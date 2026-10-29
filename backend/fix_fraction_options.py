"""
One-off fix: render fraction-valued Community Test options as proper LaTeX
(wrapped in $...$, parsed by the frontend's LatexText component) instead of
a bare "N/M" string or a unicode fraction glyph buried in unit text.

Updates the CURRENTLY ACTIVE edition's CommunityTestQuestion rows in place
(no new edition published -- this is a formatting fix to existing content,
not a content change) AND rewrites community_test_seed_data.json so a
future republish of this same question set carries the fix forward too.

Safe to re-run: fix_fraction() is idempotent (a string that's already
wrapped in $...$ or has no fraction pattern is returned unchanged).
"""
import json
import os
import re

from app.database import SessionLocal
from app.models import CommunityTest, CommunityTestQuestion

HERE = os.path.dirname(os.path.abspath(__file__))
SEED_JSON = os.path.join(HERE, "community_test_seed_data.json")

UNICODE_FRAC = {
    "¼": (1, 4), "½": (1, 2), "¾": (3, 4),
    "⅓": (1, 3), "⅔": (2, 3),
    "⅕": (1, 5), "⅖": (2, 5), "⅗": (3, 5), "⅘": (4, 5),
    "⅙": (1, 6), "⅚": (5, 6),
    "⅛": (1, 8), "⅜": (3, 8), "⅝": (5, 8), "⅞": (7, 8),
}
_GLYPH_CLASS = "".join(UNICODE_FRAC)


def fix_fraction(opt: str) -> str:
    s = opt.strip()
    if "$" in s:
        return opt  # already LaTeX-wrapped -- idempotent, leave as-is

    # Pure fraction option, e.g. "3/8" or "134/41" -- the whole string is N/M.
    m = re.fullmatch(r"(\d+)/(\d+)", s)
    if m:
        n, d = m.groups()
        return rf"$\frac{{{n}}}{{{d}}}$"

    # A mixed number with a unicode fraction glyph embedded in a larger
    # string, e.g. "73⅓ км/сағ" or "33⅓%" -- convert just the number+glyph,
    # leave the trailing unit text as plain text alongside it.
    m2 = re.match(rf"^(\d+)([{_GLYPH_CLASS}])(.*)$", s)
    if m2:
        whole, glyph, rest = m2.groups()
        n, d = UNICODE_FRAC[glyph]
        return rf"${whole}\tfrac{{{n}}}{{{d}}}$" + rest

    return opt


if __name__ == "__main__":
    changed = 0

    # 1) Fix the JSON source file (so future republishes keep the fix).
    with open(SEED_JSON, encoding="utf-8") as f:
        data = json.load(f)
    for q in data:
        for key in ("options_kz", "options_ru"):
            new_opts = [fix_fraction(o) for o in q[key]]
            if new_opts != q[key]:
                changed += 1
            q[key] = new_opts
    with open(SEED_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f"Updated {SEED_JSON} ({changed} option arrays changed).")

    # 2) Fix the currently active edition's rows in place (no new edition).
    db = SessionLocal()
    test = db.query(CommunityTest).filter(CommunityTest.is_active == True).first()  # noqa: E712
    if not test:
        print("No active CommunityTest edition found -- nothing to update in the DB.")
    else:
        rows = db.query(CommunityTestQuestion).filter(CommunityTestQuestion.test_id == test.id).all()
        row_changes = 0
        for r in rows:
            new_kz = [fix_fraction(o) for o in r.options_kz]
            new_ru = [fix_fraction(o) for o in r.options_ru]
            if new_kz != r.options_kz or new_ru != r.options_ru:
                r.options_kz = new_kz
                r.options_ru = new_ru
                row_changes += 1
        db.commit()
        print(f"Updated {row_changes} question rows in active edition {test.id} ({test.title_kz!r}).")
    db.close()
