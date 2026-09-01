# -*- coding: utf-8 -*-
"""
One-time restore: sets every student's profile.points to the true lifetime
total reconstructed from their actual point-earning history (the only
source of truth), undoing the effect of the now-removed automatic monthly
leaderboard reset (which zeroed profile.points directly, in place, with no
record of what it overwrote).

True total = sum(ProblemAttempt.points_earned) + sum(PodAttempt.points_earned)
           + sum(DailyExam.score for submitted exams)

Every points-awarding code path writes both an atomic profile.points
increment AND one of these history rows at the same time, so this sum is
guaranteed to equal the correct lifetime total regardless of how many times
the reset already fired — the reset never touched these tables, only the
cached total.

Also removes the now-orphaned 'last_monthly_reset' SystemSettings row,
since the code that interpreted it no longer exists.

Run against local, verify, then production.
"""
from sqlalchemy import func

from app.database import SessionLocal
from app.models import Profile, ProblemAttempt, PodAttempt, DailyExam, SystemSettings

db = SessionLocal()

students = db.query(Profile).filter(Profile.role == "student").all()
changed = 0
for s in students:
    prob_sum = db.query(func.coalesce(func.sum(ProblemAttempt.points_earned), 0)).filter(
        ProblemAttempt.student_id == s.id
    ).scalar()
    pod_sum = db.query(func.coalesce(func.sum(PodAttempt.points_earned), 0)).filter(
        PodAttempt.student_id == s.id
    ).scalar()
    exam_sum = db.query(func.coalesce(func.sum(DailyExam.score), 0)).filter(
        DailyExam.student_id == s.id, DailyExam.submitted_at.isnot(None)
    ).scalar()
    true_total = prob_sum + pod_sum + exam_sum

    if s.points != true_total:
        changed += 1
    s.points = true_total

deleted = db.query(SystemSettings).filter(SystemSettings.key == "last_monthly_reset").delete()

db.commit()
print(f"Restored points for {len(students)} students ({changed} actually changed).")
print(f"Removed {deleted} stale 'last_monthly_reset' setting row(s).")
db.close()
