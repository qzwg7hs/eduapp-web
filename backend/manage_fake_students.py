# -*- coding: utf-8 -*-
"""
Decorative "outside participant" leaderboard accounts — not real students,
no usable login intended (random unusable password hash, no plain_password
stored). Created purely so the real students' leaderboard shows more
visible activity than the current small cohort alone provides, per an
explicit ask to make the rating page feel more alive/competitive.

Usage:
    python manage_fake_students.py create   # one-time: create all 20 at their
                                             # starting points (idempotent —
                                             # skips any username that already
                                             # exists, so safe to re-run).
    python manage_fake_students.py bump     # run whenever asked to "increase
                                             # their points" — adds a small
                                             # random amount (15-25 by default)
                                             # to each of the 20, on both the
                                             # lifetime total and this period's
                                             # MonthlyScore, atomically.

Only ever touches the 20 usernames in FAKE_STUDENTS below — never a
real student.
"""
import random
import sys
import uuid

from app.database import SessionLocal
from app.models import Profile
from app.auth import hash_password
from app.scoring import award_monthly_points, current_period_key

# (name, surname, username, starting points)
# Starting points are the originally-drafted values minus 250 (except
# timur_nursultan, left as-is at 101) — full 900+ totals right out of the
# gate would've read as implausible for accounts with no prior visible
# activity.
FAKE_STUDENTS = [
    ("Гүлнұр", "Серікқали", "gulnur_serikkali", 701),
    ("Аброр", "Турсунов", "abror_tursunov", 687),
    ("Камила", "Ахметова", "kamila_akhmetova", 614),
    ("Ерасыл", "Қуандық", "erasyl_kuandyk", 613),
    ("Дана", "Алдабергенова", "dana_aldabergenova", 609),
    ("Ринат", "Қасымов", "rinat_kasymov", 607),
    ("Виктор", "Ким", "viktor_kim", 549),
    ("Санжар", "Төлеубек", "sanzhar_toleubek", 533),
    ("Иван", "Смирнов", "ivan_smirnov", 517),
    ("Жания", "Бекболат", "zhaniya_bekbolat", 496),
    ("Дамир", "Самат", "damir_samat", 486),
    ("Артём", "Пак", "artem_pak", 408),
    ("Диёра", "Юсупова", "diyora_yusupova", 393),
    ("Асель", "Досжан", "asel_doszhan", 329),
    ("Айгерім", "Ерболат", "aigerim_erbolat", 271),
    ("Нурбол", "Жеткербай", "nurbol_zhetkerbay", 208),
    ("Мадина", "Жақсылық", "madina_zhaksylyk", 202),
    ("Дінмұхаммед", "Серікұлы", "dinmukhammed_serikuly", 144),
    ("Екатерина", "Волкова", "ekaterina_volkova", 141),
    ("Тимур", "Нұрсұлтан", "timur_nursultan", 101),
]

FAKE_USERNAMES = {u for _, _, u, _ in FAKE_STUDENTS}


def create():
    db = SessionLocal()
    created, skipped = 0, 0
    for name, surname, username, points in FAKE_STUDENTS:
        if db.query(Profile).filter(Profile.username == username).first():
            skipped += 1
            continue
        student = Profile(
            id=uuid.uuid4(),
            username=username,
            password_hash=hash_password(uuid.uuid4().hex),  # unusable, random — not meant to log in
            plain_password=None,
            name=name,
            surname=surname,
            unique_id=username,
            role="student",
            points=points,
            is_decorative=True,  # excludes this account from Duel's opponent picker (routers/duels.py) — it can never log in to respond
        )
        db.add(student)
        db.flush()
        award_monthly_points(db, student.id, points)  # same total on this period's leaderboard too
        created += 1
    db.commit()
    print(f"created={created} skipped(already existed)={skipped}")


def bump(lo=15, hi=25):
    db = SessionLocal()
    rows = db.query(Profile).filter(Profile.username.in_(FAKE_USERNAMES)).all()
    if not rows:
        print("No fake students found in this database — run `create` first.")
        return
    for r in rows:
        delta = random.randint(lo, hi)
        db.query(Profile).filter(Profile.id == r.id).update(
            {"points": Profile.points + delta}, synchronize_session=False
        )
        award_monthly_points(db, r.id, delta)
    db.commit()
    print(f"bumped {len(rows)} accounts by {lo}-{hi} pts each (period={current_period_key()})")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "create"
    if mode == "create":
        create()
    elif mode == "bump":
        bump()
    else:
        print("usage: python manage_fake_students.py [create|bump]")
