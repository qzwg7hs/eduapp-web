# -*- coding: utf-8 -*-
"""
One-time backfill: seeds each student's MonthlyScore row for the combined
August+September 2026 period with everything they already earned in those
two months, before live monthly tracking existed. Every points-awarding
endpoint now also increments MonthlyScore going forward (see
app/scoring.py's award_monthly_points) — this script only covers the
"before this feature shipped" gap for that one combined period; October
onward needs no backfill since tracking is live from day one of each of
those periods.

Idempotent: recomputes the full August+September sum from source history
every time and sets (not adds to) the row, so re-running is always safe
and just re-syncs to the same correct value — it won't double-count if run
twice, and it won't stomp on live points earned via the app in the same
window since those are already included in the same history sum.

Run against local, verify, then production.
"""
from datetime import datetime

from sqlalchemy import func, extract, or_, and_

from app.database import SessionLocal
from app.models import Profile, ProblemAttempt, PodAttempt, DailyExam, MonthlyScore
from app.scoring import current_period_key

PERIOD = "2026-08_09"
assert PERIOD == current_period_key(datetime(2026, 8, 15)) == current_period_key(datetime(2026, 9, 15)), \
    "PERIOD must match what award_monthly_points would compute for Aug/Sep 2026 — keep in sync with app/scoring.py"


def in_aug_sep_2026(col):
    return and_(extract("year", col) == 2026, extract("month", col).in_([8, 9]))


db = SessionLocal()

students = db.query(Profile).filter(Profile.role == "student").all()
seeded = 0
for s in students:
    prob_sum = db.query(func.coalesce(func.sum(ProblemAttempt.points_earned), 0)).filter(
        ProblemAttempt.student_id == s.id, in_aug_sep_2026(ProblemAttempt.attempted_at)
    ).scalar()
    pod_sum = db.query(func.coalesce(func.sum(PodAttempt.points_earned), 0)).filter(
        PodAttempt.student_id == s.id, in_aug_sep_2026(PodAttempt.attempted_at)
    ).scalar()
    exam_sum = db.query(func.coalesce(func.sum(DailyExam.score), 0)).filter(
        DailyExam.student_id == s.id, DailyExam.submitted_at.isnot(None), in_aug_sep_2026(DailyExam.exam_date)
    ).scalar()
    total = prob_sum + pod_sum + exam_sum

    existing = db.query(MonthlyScore).filter(
        MonthlyScore.student_id == s.id, MonthlyScore.period_key == PERIOD
    ).first()
    if existing:
        if existing.points != total:
            existing.points = total
            seeded += 1
    elif total > 0:
        db.add(MonthlyScore(student_id=s.id, period_key=PERIOD, points=total))
        seeded += 1

db.commit()
print(f"Backfilled/synced August+September 2026 MonthlyScore for {len(students)} students ({seeded} rows created/updated).")
db.close()
