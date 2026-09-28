# -*- coding: utf-8 -*-
"""
Daily streak tracking. Counts POD or the daily Test Bank exam — any real
daily-feature activity, participation not correctness (a wrong POD guess or
a low exam score still means the student showed up today).

Deliberately incremental, never a scheduled bulk job: touch_streak() is
called once from each qualifying endpoint (pod.py's submit, test_bank.py's
submit) and only ever updates that one student's own row, comparing today
against their own last_streak_date. There is no "reset everyone's streak"
job anywhere — the exact bug class that wiped every student's points
earlier (see the monthly-reset removal) can't happen here by construction.

One freeze per calendar week: if exactly one day was missed and a freeze
hasn't been used this week yet, the streak survives instead of breaking.
Freeze eligibility rolls over lazily by week_key (same pattern as
MonthlyScore's period_key) — no scheduled job needed to "give back" the
freeze each week either.
"""
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from .models import Profile


def _today_utc5() -> date:
    """Same calendar-day convention as POD and the daily Test Bank exam —
    rolls over at 00:00 UTC+5 (Kazakhstan time), not server-local midnight."""
    return (datetime.utcnow() + timedelta(hours=5)).date()


def _week_key(d: date) -> str:
    iso = d.isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"


def effective_streak(student: Profile, today: date | None = None) -> int:
    """The streak as it should be DISPLAYED right now — as opposed to
    student.current_streak, which is a write-time cache only ever updated
    inside touch_streak() (i.e. the moment the student does a qualifying
    activity). Without this, a student who stops participating keeps seeing
    their old streak number indefinitely, since nothing ever touches the row
    again to notice it broke.

    Read-only — never mutates or commits anything, so touch_streak() still
    sees the true last_streak_date/freeze state on the student's next real
    activity (in particular, the freeze logic there needs the actual stored
    values, not this display-time approximation, to work correctly).

    - No activity ever: 0.
    - Last activity was today or yesterday: still fully alive, show the
      stored streak (yesterday isn't broken yet — there's still time today).
    - Exactly one full day missed (gap of 2) AND this week's freeze is still
      available: still shown as alive — matches touch_streak's own "the
      freeze saves it" rule, so the number doesn't flicker to 0 and back the
      moment they do come back today.
    - Anything past that (freeze already used, or more than one day missed):
      broken — 0, regardless of what the stored column still says.
    """
    today = today or _today_utc5()
    if not student.last_streak_date:
        return 0

    gap = (today - student.last_streak_date).days
    if gap <= 1:
        return student.current_streak or 0

    if gap == 2:
        week = _week_key(today)
        freeze_available = student.freeze_week_key != week or not student.freeze_used_this_week
        if freeze_available:
            return student.current_streak or 0

    return 0


def touch_streak(db: Session, student: Profile, today: date | None = None) -> None:
    """Record that `student` did a qualifying activity today. Safe to call
    multiple times in the same day (a student doing both POD and the daily
    exam today doesn't double-count) — mutates the passed Profile instance
    in place; caller is expected to db.commit() as part of its own request."""
    today = today or _today_utc5()

    if student.last_streak_date == today:
        return  # already counted today

    week = _week_key(today)
    if student.freeze_week_key != week:
        student.freeze_week_key = week
        student.freeze_used_this_week = False

    if student.last_streak_date == today - timedelta(days=1):
        student.current_streak += 1
    elif student.last_streak_date == today - timedelta(days=2) and not student.freeze_used_this_week:
        # Exactly one day missed, and this week's freeze hasn't been spent —
        # the streak survives, consuming the freeze.
        student.freeze_used_this_week = True
        student.current_streak += 1
    else:
        # First-ever activity, or more than one day missed with no freeze
        # available — start fresh today.
        student.current_streak = 1

    student.last_streak_date = today
    student.longest_streak = max(student.longest_streak or 0, student.current_streak)
