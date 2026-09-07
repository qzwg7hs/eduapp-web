# -*- coding: utf-8 -*-
"""
Monthly scoring period logic, shared by every points-awarding endpoint
(problems.py, pod.py, test_bank.py) and by the leaderboard/admin-overview
readers.

Periods are calendar months, with one deliberate one-off exception: the
first period combines August + September 2026 into a single period, since
monthly tracking didn't exist before this feature shipped and there's real
already-earned activity in both months worth keeping together rather than
splitting arbitrarily at the ship date. October 2026 onward is a clean
calendar month per period.
"""
from datetime import datetime

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from .models import MonthlyScore

_MONTH_NAMES = {
    "kz": ["Қаңтар", "Ақпан", "Наурыз", "Сәуір", "Мамыр", "Маусым",
           "Шілде", "Тамыз", "Қыркүйек", "Қазан", "Қараша", "Желтоқсан"],
    "ru": ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
           "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"],
}

_COMBINED_PERIOD = "2026-08_09"
_COMBINED_MONTHS = {(2026, 8), (2026, 9)}


def current_period_key(when: datetime | None = None) -> str:
    when = when or datetime.utcnow()
    if (when.year, when.month) in _COMBINED_MONTHS:
        return _COMBINED_PERIOD
    return f"{when.year}-{when.month:02d}"


def is_bootstrap_period(period_key: str) -> bool:
    """True for the one-off Aug+Sep 2026 combined period — callers that need
    to treat it differently (e.g. cosmetics.py's point-ladder, which needs a
    higher scale for a two-month backlog of points than for a genuine single
    calendar month) key off this instead of duplicating the raw string."""
    return period_key == _COMBINED_PERIOD


def period_label(period_key: str, language: str = "kz") -> str:
    names = _MONTH_NAMES.get(language, _MONTH_NAMES["kz"])
    if period_key == _COMBINED_PERIOD:
        return f"{names[7]} – {names[8]} 2026"  # "Тамыз – Қыркүйек 2026"
    year, month = period_key.split("-")
    return f"{names[int(month) - 1]} {year}"


def award_monthly_points(db: Session, student_id, pts: int, when: datetime | None = None) -> None:
    """Atomically add pts to the student's current-period MonthlyScore row,
    creating it at 0 first if this is their first activity in the period.
    Uses a real upsert (INSERT ... ON CONFLICT) rather than a check-then-
    insert/update, so this is safe under concurrent requests — the same
    race class that atomic profile.points updates already guard against."""
    if pts <= 0:
        return
    period = current_period_key(when)
    now = datetime.utcnow()
    stmt = pg_insert(MonthlyScore).values(
        student_id=student_id, period_key=period, points=pts, updated_at=now,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["student_id", "period_key"],
        set_={"points": MonthlyScore.points + pts, "updated_at": now},
    )
    db.execute(stmt)
