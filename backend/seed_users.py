"""
One-off script: creates the admin account and imports all students from
"Список Аруайға.xlsx" (sheet "Оқушы") into the database.

Run from the backend/ directory with the venv active:
    venv\\Scripts\\python.exe seed_users.py
"""
import sys
import openpyxl

from app.database import SessionLocal, engine, Base
from app.models import Profile
from app.auth import hash_password

XLSX_PATH = r"C:\Users\Aruay\Desktop\eduapp-web\eduapp-web\Список Аруайға.xlsx"
SHEET_NAME = "Оқушы"

ADMIN = {
    "name": "Берік",
    "surname": "Міндетбаев",
    "username": "berik_mindetbayev",
    "password": "admin_pwrd",
}

Base.metadata.create_all(bind=engine)
db = SessionLocal()

created = 0
skipped = 0

# ── Admin ────────────────────────────────────────────────────────────────
if db.query(Profile).filter(Profile.username == ADMIN["username"]).first():
    print(f'Admin "{ADMIN["username"]}" already exists, skipping.')
else:
    db.add(Profile(
        username=ADMIN["username"],
        password_hash=hash_password(ADMIN["password"]),
        plain_password=ADMIN["password"],
        name=ADMIN["name"],
        surname=ADMIN["surname"],
        unique_id=ADMIN["username"],
        role="admin",
        points=0,
    ))
    db.commit()
    print(f'Admin "{ADMIN["name"]} {ADMIN["surname"]}" ({ADMIN["username"]}) created.')

# ── Students ─────────────────────────────────────────────────────────────
wb = openpyxl.load_workbook(XLSX_PATH, data_only=True)
ws = wb[SHEET_NAME]

rows = list(ws.iter_rows(min_row=2, values_only=True))  # skip header row
for row in rows:
    if not row or all(c is None for c in row):
        continue
    _num, surname, name, username, password = row[:5]
    if not username or not password:
        continue
    username = str(username).strip().lower()
    password = str(password).strip()

    if db.query(Profile).filter(Profile.username == username).first():
        skipped += 1
        continue

    db.add(Profile(
        username=username,
        password_hash=hash_password(password),
        plain_password=password,
        name=str(name).strip(),
        surname=str(surname).strip(),
        unique_id=username,
        role="student",
        points=0,
    ))
    created += 1

db.commit()
db.close()

print(f"Students created: {created}, skipped (already existed): {skipped}")
