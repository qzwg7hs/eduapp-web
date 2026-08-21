"""
One-off script: seeds the pilot topic "Katynas zhane paiyz / Otnoshenie i
protsenty" (Ratio and Percentages) — 7 subtopics, each with a bilingual
lesson and a leveled A/B/C test (10 questions per level per language) —
loaded from the JSON files drafted under scratchpad/content/.

Run from the backend/ directory with the venv active:
    venv\\Scripts\\python.exe seed_content.py
"""
import json
import os

from app.database import SessionLocal, engine, Base
from app.models import Topic, SubTopic, Lesson, Problem

CONTENT_DIR = r"C:\Users\Aruay\AppData\Local\Temp\claude\c--Users-Aruay-Desktop-eduapp-web\e30c8997-15e3-44e3-9bf1-080a0ec2a20b\scratchpad\content"

# Subtopic files, in the exact order they appear in the xlsx "Тема" sheet
SUBTOPIC_FILES = [
    "ratio_two_numbers.json",
    "ratio_three_numbers.json",
    "scale.json",
    "percentages.json",
    "direct_proportion.json",
    "inverse_proportion.json",
    "concentration.json",
]

TOPIC_TITLE_KZ = "Қатынас және пайыз"
TOPIC_TITLE_RU = "Отношение и проценты"

Base.metadata.create_all(bind=engine)
db = SessionLocal()


def get_or_create_topic(title: str, language: str) -> Topic:
    existing = db.query(Topic).filter(Topic.title == title, Topic.language == language).first()
    if existing:
        return existing
    count = db.query(Topic).filter(Topic.language == language).count()
    topic = Topic(
        title=title,
        description=None,
        order_index=count,
        is_draft=False,
        is_published=True,
        language=language,
    )
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


created_subtopics = 0
created_lessons = 0
created_problems = 0
skipped = 0

topic_kz = get_or_create_topic(TOPIC_TITLE_KZ, "kz")
topic_ru = get_or_create_topic(TOPIC_TITLE_RU, "ru")
db.commit()

for idx, fname in enumerate(SUBTOPIC_FILES):
    path = os.path.join(CONTENT_DIR, fname)
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
            topic_id=topic.id,
            title=sub_title,
            order_index=idx,
            is_draft=False,
            is_published=True,
            language=lang,
        )
        db.add(sub)
        db.flush()
        created_subtopics += 1

        lesson_data = data[f"lesson_{lang}"]
        lesson = Lesson(
            subtopic_id=sub.id,
            title=lesson_data["title"],
            explanation="",
            content_blocks=lesson_data["content_blocks"],
            order_index=0,
            is_draft=False,
            is_published=True,
            language=lang,
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
        print(f"  [{lang}] '{sub_title}' -> lesson + {len(problems)} problems")

print(
    f"\nDone. Subtopics created: {created_subtopics} "
    f"(skipped existing: {skipped}), lessons: {created_lessons}, "
    f"problems: {created_problems}"
)
db.close()
