# -*- coding: utf-8 -*-
"""
Profile cosmetics: an avatar border/theme color and an animal icon, unlocked
by THIS PERIOD's points (MonthlyScore for the current period — see
app/scoring.py), not the lifetime total. Deliberately re-evaluated every
period rather than a permanent unlock list, so good performance stays
worth something every month — but what's already equipped is never
revoked if a slower period follows (see equip_cosmetic below); a student
just can't newly pick something above this period's tier until they
re-earn it.

Each color has two shades: `hex` (soft pastel, used as the avatar circle's
background) and `accent` (a punchier version of the same hue, used for
buttons/highlights on the small set of "personal chrome" surfaces that
adopt a student's chosen color — nav bar, home greeting, profile, "your
rank" card). Icons are referenced by a stable key (rendered as a small
minimal line-art SVG by the frontend's AnimalIcon component), not emoji.
"""
from sqlalchemy.orm import Session

from .models import Profile, MonthlyScore
from .scoring import current_period_key, is_bootstrap_period

COLORS = [
    {"key": "blue",     "hex": "#cfe3f0", "accent": "#4a90c2"},
    {"key": "sage",     "hex": "#d7e4d1", "accent": "#5a9e6f"},
    {"key": "pink",     "hex": "#f3dde0", "accent": "#d97a94"},
    {"key": "lavender", "hex": "#e3ddf0", "accent": "#8b7fc7"},
    {"key": "sand",     "hex": "#ede0c8", "accent": "#c9a15a"},
    {"key": "mint",     "hex": "#d3ede4", "accent": "#3aab8f"},
    {"key": "peach",    "hex": "#f2e0d0", "accent": "#e0935a"},
    {"key": "rose",     "hex": "#e8d5da", "accent": "#c47a8f"},
    # Elite tier only — see BOOTSTRAP_TIERS/STEADY_TIERS below. Same pastel
    # family as the rest, just reserved for the very top of the ladder.
    {"key": "gold",     "hex": "#f2e2ad", "accent": "#c99a2e"},
    {"key": "silver",   "hex": "#e3e6ea", "accent": "#7c8794"},
]
ICONS = ["cat", "dog", "fox", "panda", "owl", "rabbit", "lion", "koala", "eagle", "wolf"]

# Two separate ladders, cumulative within each (each tier includes
# everything from tiers below it).
#
# BOOTSTRAP_TIERS covers only the one-off Aug+Sep 2026 combined period.
# That period's MonthlyScore already holds two months of backlog activity
# (most of it earned before this feature even existed), so live leaderboard
# totals run roughly 100-970+ with an average around 500 — a normal
# single-month ladder would leave top students maxed out instantly and
# give everyone else nothing left to work toward for the rest of the
# period. Scaled so an average student (~500) lands mid-ladder, the top of
# the leaderboard (~900+) clears the "core" set (all 8 original
# colors/icons), and the last 2 (gold/silver, eagle/wolf) sit at 1000 and
# 1200 — just past the current #1 — so the leaderboard has something left
# to reach for instead of everyone at the top being equally maxed out.
BOOTSTRAP_TIERS = [
    {"min_points": 0,    "colors": 0,  "icons": 0},
    {"min_points": 150,  "colors": 2,  "icons": 0},
    {"min_points": 350,  "colors": 4,  "icons": 2},
    {"min_points": 600,  "colors": 6,  "icons": 5},
    {"min_points": 900,  "colors": 8,  "icons": 8},
    {"min_points": 1000, "colors": 9,  "icons": 9},
    {"min_points": 1200, "colors": 10, "icons": 10},
]

# STEADY_TIERS applies from October 2026 onward, once a "month" means one
# genuine calendar month rather than a two-month backlog — real monthly
# totals will be much smaller (no more one-time after-lesson-test backlog
# to draw from, just Problem of the Day + daily test + missions going
# forward), so this ladder is deliberately a fraction of the bootstrap one.
# Same elite-tier idea at the top: the core set caps at 600, gold/silver
# and eagle/wolf are a genuine stretch goal beyond that.
STEADY_TIERS = [
    {"min_points": 0,    "colors": 0,  "icons": 0},
    {"min_points": 100,  "colors": 1,  "icons": 0},
    {"min_points": 200,  "colors": 2,  "icons": 1},
    {"min_points": 300,  "colors": 4,  "icons": 2},
    {"min_points": 400,  "colors": 5,  "icons": 4},
    {"min_points": 500,  "colors": 6,  "icons": 6},
    {"min_points": 600,  "colors": 8,  "icons": 8},
    {"min_points": 800,  "colors": 9,  "icons": 9},
    {"min_points": 1000, "colors": 10, "icons": 10},
]


def _tiers_for(period_key: str) -> list[dict]:
    return BOOTSTRAP_TIERS if is_bootstrap_period(period_key) else STEADY_TIERS


def _tier_for(points: int, period_key: str | None = None) -> dict:
    tiers = _tiers_for(period_key or current_period_key())
    tier = tiers[0]
    for t in tiers:
        if points >= t["min_points"]:
            tier = t
    return tier


def unlocked_for(points: int, period_key: str | None = None) -> tuple[list[dict], list[str]]:
    tier = _tier_for(points, period_key)
    return COLORS[: tier["colors"]], ICONS[: tier["icons"]]


def _unlock_threshold(index: int, field: str, tiers: list[dict]) -> int:
    """The min_points of the first tier whose `field` count covers this
    0-based index — i.e. the points needed to unlock the (index+1)-th item."""
    for t in tiers:
        if t[field] > index:
            return t["min_points"]
    return tiers[-1]["min_points"]


def full_catalog(points: int, period_key: str | None = None) -> dict:
    """Every color/icon, locked or not, with the threshold each unlocks at —
    so students can see what's coming, not just what they already have."""
    period_key = period_key or current_period_key()
    tiers = _tiers_for(period_key)
    tier = _tier_for(points, period_key)
    return {
        "colors": [
            {**c, "unlocked": i < tier["colors"], "unlock_at": _unlock_threshold(i, "colors", tiers)}
            for i, c in enumerate(COLORS)
        ],
        "icons": [
            {"key": icon, "unlocked": i < tier["icons"], "unlock_at": _unlock_threshold(i, "icons", tiers)}
            for i, icon in enumerate(ICONS)
        ],
    }


def current_month_points(db: Session, student_id) -> int:
    row = db.query(MonthlyScore).filter(
        MonthlyScore.student_id == student_id, MonthlyScore.period_key == current_period_key(),
    ).first()
    return row.points if row else 0


def equip_cosmetic(db: Session, student: Profile, border_color: str | None, avatar_icon: str | None) -> None:
    """Validates the requested selection against what's currently unlocked
    (via this period's points) and, if valid, equips it. Raises ValueError
    with a user-facing reason if not unlocked — never silently ignores an
    invalid request. Passing None for a field leaves that field unchanged
    (so a student can update just the color without re-sending the icon)."""
    points = current_month_points(db, student.id)
    colors, icons = unlocked_for(points)
    color_hexes = {c["hex"] for c in colors}

    if border_color is not None:
        if border_color != "" and border_color not in color_hexes:
            raise ValueError("This color isn't unlocked yet this period.")
        student.equipped_border_color = border_color or None

    if avatar_icon is not None:
        if avatar_icon != "" and avatar_icon not in icons:
            raise ValueError("This icon isn't unlocked yet this period.")
        student.equipped_avatar_icon = avatar_icon or None


def accent_for(border_color_hex: str | None) -> str | None:
    """The punchier accent shade paired with an equipped pastel color, for
    the personal-theme surfaces (nav bar, home, profile, leaderboard 'your
    rank' card). None if nothing's equipped (caller falls back to default)."""
    for c in COLORS:
        if c["hex"] == border_color_hex:
            return c["accent"]
    return None
