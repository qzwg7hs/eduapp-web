"""
Seeds the 10 remaining topics (34 subtopics total) from the "Тема" sheet —
each with a bilingual lesson (some with a diagram image spliced in) and a
leveled A/B/C test (10 questions per level per language) — loaded from the
JSON files drafted under scratchpad/content_batch2/ by 9 parallel agents.

Run from the backend/ directory with the venv active:
    venv\\Scripts\\python.exe seed_content_batch2.py
"""
import json
import os

from app.database import SessionLocal, engine, Base
from app.models import Topic, SubTopic, Lesson, Problem

CONTENT_DIR = r"C:\Users\Aruay\AppData\Local\Temp\claude\c--Users-Aruay-Desktop-eduapp-web\e30c8997-15e3-44e3-9bf1-080a0ec2a20b\scratchpad\content_batch2"
DIAG_URLS_PATH = r"C:\Users\Aruay\AppData\Local\Temp\claude\c--Users-Aruay-Desktop-eduapp-web\e30c8997-15e3-44e3-9bf1-080a0ec2a20b\scratchpad\diagrams\urls.json"

with open(DIAG_URLS_PATH, encoding="utf-8") as f:
    DIAG_URLS = json.load(f)

# (topic_title_kz, topic_title_ru, [(filename, diagram_key_or_None), ...])
TOPICS = [
    ("Теріс сандар", "Отрицательные числа", [
        ("neg_operations.json", None),
        ("neg_modulus.json", None),
    ]),
    ("Теңдеулер мен теңсіздіктер", "Уравнения и неравенства", [
        ("eq_equations.json", None),
        ("eq_systems.json", None),
        ("eq_modulus.json", None),
        ("ineq_inequalities.json", None),
        ("ineq_systems.json", None),
        ("ineq_modulus.json", None),
    ]),
    ("Геометрия", "Геометрия", [
        ("geo_angles.json", "geo_angles"),
        ("geo_triangles.json", "geo_triangles"),
        ("geo_bisector.json", "geo_bisector"),
        ("geo_circle.json", "geo_circle"),
        ("geo_disk.json", "geo_disk"),
    ]),
    ("Дәреже, Түбір, Факториал", "Степень, Корень, Факториал", [
        ("power.json", None),
        ("root.json", None),
        ("factorial.json", None),
    ]),
    ("Функция, Координата, симметрия, график", "Функции, Координаты, Симметрия, Графики", [
        ("func_linear.json", "func_linear"),
        ("func_numberline.json", "func_numberline"),
        ("func_plane.json", "func_plane"),
        ("func_graph.json", "func_graph"),
        ("func_symmetry.json", "func_symmetry"),
    ]),
    ("Қозғалыс", "Движение", [
        ("motion_towards.json", "motion_towards"),
        ("motion_same_direction.json", "motion_same_direction"),
        ("motion_train.json", None),
        ("motion_boat.json", None),
        ("motion_avg_speed.json", None),
    ]),
    ("Жұмыс", "Работа", [
        ("work_joint.json", None),
        ("work_productivity.json", None),
    ]),
    ("Жиындар", "Множества", [
        ("sets_two.json", "sets_two"),
        ("sets_three.json", "sets_three"),
    ]),
    ("Статистика", "Статистика", [
        ("stats_mean.json", None),
        ("stats_mode_median.json", None),
    ]),
    ("Комбинаторика", "Комбинаторика", [
        ("combo_repetition.json", None),
        ("combo_order.json", None),
    ]),
]

Base.metadata.create_all(bind=engine)
db = SessionLocal()


def get_or_create_topic(title: str, language: str) -> Topic:
    existing = db.query(Topic).filter(Topic.title == title, Topic.language == language).first()
    if existing:
        return existing
    count = db.query(Topic).filter(Topic.language == language).count()
    topic = Topic(title=title, description=None, order_index=count, is_draft=False, is_published=True, language=language)
    db.add(topic)
    db.flush()
    return topic


def build_problem(p: dict, lesson_id, order_index: int, language: str) -> Problem:
    pt = p["problem_type"]
    if pt == "mcq":
        options = p["options"]
        correct_options = p["correct_options"]
        correct_option = correct_options[0]
        open_answer = None
    else:
        options = []
        correct_options = []
        correct_option = 0
        open_answer = p["open_answer"]

    return Problem(
        subsubtopic_id=lesson_id,
        title=p["question"][:60],
        question=p["question"],
        problem_type=pt,
        options=options,
        correct_option=correct_option,
        correct_options=correct_options,
        open_answer=open_answer,
        image_url=None,
        hint1=p["hint"],
        is_hard=False,
        is_draft=False,
        is_published=True,
        order_index=order_index,
        level=p["level"],
        language=language,
    )


def splice_image(blocks: list, diagram_key: str) -> list:
    """Insert an image block right after the intro (index 2, or at the end
    if the lesson is shorter than that)."""
    url = DIAG_URLS[diagram_key]
    img_block = {"type": "image", "url": url, "caption": ""}
    pos = min(2, len(blocks))
    return blocks[:pos] + [img_block] + blocks[pos:]


created_subtopics = 0
created_lessons = 0
created_problems = 0
skipped = 0
missing_files = []

for topic_idx, (title_kz, title_ru, subtopic_files) in enumerate(TOPICS):
    topic_kz = get_or_create_topic(title_kz, "kz")
    topic_ru = get_or_create_topic(title_ru, "ru")
    db.commit()
    print(f"\n=== Topic {topic_idx + 1}: {title_kz} / {title_ru} ===")

    for sub_idx, (fname, diagram_key) in enumerate(subtopic_files):
        path = os.path.join(CONTENT_DIR, fname)
        if not os.path.exists(path):
            print(f"  !! MISSING FILE: {fname}")
            missing_files.append(fname)
            continue

        with open(path, encoding="utf-8") as f:
            data = json.load(f)

        for lang, topic, sub_title in (
            ("kz", topic_kz, data["subtopic_kz"]),
            ("ru", topic_ru, data["subtopic_ru"]),
        ):
            existing_sub = db.query(SubTopic).filter(
                SubTopic.topic_id == topic.id, SubTopic.title == sub_title,
            ).first()
            if existing_sub:
                print(f"  Subtopic '{sub_title}' ({lang}) already exists, skipping.")
                skipped += 1
                continue

            sub = SubTopic(
                topic_id=topic.id, title=sub_title, order_index=sub_idx,
                is_draft=False, is_published=True, language=lang,
            )
            db.add(sub)
            db.flush()
            created_subtopics += 1

            lesson_data = data[f"lesson_{lang}"]
            blocks = lesson_data["content_blocks"]
            if diagram_key:
                blocks = splice_image(blocks, diagram_key)

            lesson = Lesson(
                subtopic_id=sub.id, title=lesson_data["title"], explanation="",
                content_blocks=blocks, order_index=0,
                is_draft=False, is_published=True, language=lang,
            )
            db.add(lesson)
            db.flush()
            created_lessons += 1

            problems = data[f"problems_{lang}"]
            for j, p in enumerate(problems):
                prob = build_problem(p, lesson.id, j, lang)
                db.add(prob)
                created_problems += 1

            db.commit()
            print(f"  [{lang}] '{sub_title}' -> lesson ({len(blocks)} blocks{', +image' if diagram_key else ''}) + {len(problems)} problems")

print(
    f"\nDone. Subtopics created: {created_subtopics} (skipped existing: {skipped}), "
    f"lessons: {created_lessons}, problems: {created_problems}"
)
if missing_files:
    print(f"\n!! MISSING FILES ({len(missing_files)}): {missing_files}")
db.close()
