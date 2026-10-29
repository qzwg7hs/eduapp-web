"""
Publishes a new Community Test edition: deactivates whatever edition is
currently active (if any — old questions/attempts are kept, just no
longer the active one) and creates a fresh one from a questions JSON file
sitting next to this script.

This is the mechanism for publishing a FUTURE edition too, not just the
first one — when a new student-made set is ready, parse it into the same
JSON shape (list of {number, question_kz, question_ru, options_kz,
options_ru, correct_option}) and rerun this script (optionally pointing
--questions at a different file). No code changes needed to roll out new
content; that's the whole point of building this feature as a reusable,
swappable slot (see CommunityTest in app/models.py).

Usage (from backend/, venv active):
    venv\\Scripts\\python.exe seed_community_test.py
    venv\\Scripts\\python.exe seed_community_test.py --questions other_set.json --title-kz "..." --title-ru "..."
"""
import argparse
import json
import os
from datetime import datetime

from app.database import SessionLocal
from app.models import CommunityTest, CommunityTestQuestion

HERE = os.path.dirname(os.path.abspath(__file__))

parser = argparse.ArgumentParser()
parser.add_argument("--questions", default="community_test_seed_data.json",
                     help="JSON file (relative to backend/) with the question list")
parser.add_argument("--title-kz", default="Оқушылар құрастырған тест")
parser.add_argument("--title-ru", default="Тест, составленный учениками")
parser.add_argument("--description-kz", default="Оқушылардың өздері құрастырған есептер жинағы. Уақыт шектеуі 60 минут, әрекет санына шек жоқ.")
parser.add_argument("--description-ru", default="Сборник задач, составленных самими учениками. Лимит времени 60 минут, количество попыток не ограничено.")
parser.add_argument("--time-limit-minutes", type=int, default=60)
args = parser.parse_args()

with open(os.path.join(HERE, args.questions), encoding="utf-8") as f:
    questions = json.load(f)

assert questions, "Questions file is empty"
for q in questions:
    assert len(q["options_kz"]) == 4 and len(q["options_ru"]) == 4, f"Question {q['number']} must have exactly 4 options per language"
    assert 0 <= q["correct_option"] <= 3, f"Question {q['number']} has an out-of-range correct_option"

db = SessionLocal()

previous_active = db.query(CommunityTest).filter(CommunityTest.is_active == True).first()  # noqa: E712
if previous_active:
    previous_active.is_active = False
    previous_active.closed_at = datetime.utcnow()
    print(f"Deactivated previous edition: {previous_active.title_kz!r} (id={previous_active.id})")

test = CommunityTest(
    title_kz=args.title_kz, title_ru=args.title_ru,
    description_kz=args.description_kz, description_ru=args.description_ru,
    time_limit_minutes=args.time_limit_minutes,
    is_active=True, activated_at=datetime.utcnow(),
)
db.add(test)
db.flush()  # assigns test.id without committing yet

for q in questions:
    db.add(CommunityTestQuestion(
        test_id=test.id,
        number=q["number"],
        question_kz=q["question_kz"],
        question_ru=q["question_ru"],
        options_kz=q["options_kz"],
        options_ru=q["options_ru"],
        correct_option=q["correct_option"],
    ))

db.commit()
print(f"Published new edition {test.id}: {len(questions)} questions, title={args.title_kz!r}, time_limit={args.time_limit_minutes}min.")
db.close()
