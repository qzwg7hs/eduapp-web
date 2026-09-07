# -*- coding: utf-8 -*-
"""
Weekly missions: a small FIXED set of goal types the admin parameterizes
(pick a type, a target number, a week, a reward) rather than author free-
form logic or text. This is deliberate — the progress-tracking logic per
type is written and tested once here; the admin can only ever supply data
(numbers, dates), never new behavior, so there's no way to publish a
broken mission. Display text is generated from goal_type+target in both
languages at read time, so there's no free-text field to leave untranslated
or typo.

Add a new mission type by: adding its key to GOAL_TYPES, a template in
TEXT_TEMPLATES, and one call to update_mission_progress(...) from wherever
the qualifying event happens.
"""
from datetime import date, datetime

from sqlalchemy.orm import Session

from .models import Profile, WeeklyMission, StudentMissionProgress
from .scoring import award_monthly_points

# goal_type -> human label shown in the admin dropdown (language-neutral, admin-facing only —
# the actual student-facing text comes from TEXT_TEMPLATES / the frontend's own i18n map)
GOAL_TYPES = {
    "pod_correct_count": "Solve N Problems of the Day correctly this week",
    "daily_exam_completed_count": "Score at least 1 point on N daily tests this week",
    "daily_exam_score_sum": "Score a total of N points across this week's daily tests",
    "daily_exam_single_score": "Score at least N in a single daily test",
}

def _ru_plural(n: int, one: str, few: str, many: str) -> str:
    """Russian noun-after-number agreement (1 очко, 2 очка, 5 очков, ...)."""
    n = abs(n)
    if n % 10 == 1 and n % 100 != 11:
        return one
    if n % 10 in (2, 3, 4) and n % 100 not in (12, 13, 14):
        return few
    return many


# Kazakh numeral+noun stays in one form regardless of count (unlike Russian),
# so only the Russian templates need a pluralized noun picked per n.
TEXT_TEMPLATES = {
    "pod_correct_count": {
        "kz": lambda n: f"Осы аптада Күн есебін {n} рет дұрыс шеш",
        "ru": lambda n: f"Реши задание дня правильно {n} {_ru_plural(n, 'раз', 'раза', 'раз')} на этой неделе",
    },
    "daily_exam_completed_count": {
        "kz": lambda n: f"Осы аптада күнделікті тесттен {n} рет кемінде 1 ұпай жина",
        "ru": lambda n: f"Набери хотя бы 1 балл в ежедневном тесте {n} {_ru_plural(n, 'раз', 'раза', 'раз')} на этой неделе",
    },
    "daily_exam_score_sum": {
        "kz": lambda n: f"Осы аптадағы күнделікті тесттерден жалпы {n} ұпай жина",
        "ru": lambda n: f"Набери в сумме {n} {_ru_plural(n, 'очко', 'очка', 'очков')} за ежедневные тесты на этой неделе",
    },
    "daily_exam_single_score": {
        "kz": lambda n: f"Бір күнделікті тестте кемінде {n} ұпай жина",
        "ru": lambda n: f"Набери минимум {n} {_ru_plural(n, 'очко', 'очка', 'очков')} в одном ежедневном тесте",
    },
}


def mission_text(goal_type: str, target: int, language: str) -> str:
    tpl = TEXT_TEMPLATES.get(goal_type, {}).get(language)
    return tpl(target) if tpl else ""


def _active_missions(db: Session, goal_type: str, today: date) -> list[WeeklyMission]:
    return (
        db.query(WeeklyMission)
        .filter(WeeklyMission.goal_type == goal_type, WeeklyMission.week_start <= today, WeeklyMission.week_end >= today)
        .all()
    )


def update_mission_progress(db: Session, student_id, goal_type: str, value: int, mode: str = "increment", today: date | None = None) -> None:
    """mode='increment': adds value to progress (e.g. +1 exam taken).
    mode='max': progress becomes max(progress, value) (e.g. best single score).
    Awards reward_points (both lifetime + this period's monthly total, same
    as every other points path) exactly once, the moment target is reached."""
    today = today or date.today()
    for mission in _active_missions(db, goal_type, today):
        row = db.query(StudentMissionProgress).filter(
            StudentMissionProgress.student_id == student_id,
            StudentMissionProgress.mission_id == mission.id,
        ).first()
        if not row:
            row = StudentMissionProgress(student_id=student_id, mission_id=mission.id, progress=0)
            db.add(row)
            db.flush()

        if row.points_awarded:
            continue  # already completed and paid out — nothing left to track

        row.progress = row.progress + value if mode == "increment" else max(row.progress, value)

        if row.progress >= mission.target:
            row.completed_at = datetime.utcnow()
            row.points_awarded = True
            db.query(Profile).filter(Profile.id == student_id).update(
                {"points": Profile.points + mission.reward_points}, synchronize_session=False
            )
            award_monthly_points(db, student_id, mission.reward_points)
