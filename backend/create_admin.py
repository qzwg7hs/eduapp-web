"""
Run this once to create the first admin account:
    python create_admin.py
"""
import sys
from app.database import SessionLocal, engine, Base
from app.models import Profile
from app.auth import hash_password

Base.metadata.create_all(bind=engine)

name     = input("Admin first name: ").strip()
surname  = input("Admin last name: ").strip()
username = input("Admin username: ").strip().lower()
password = input("Admin password: ").strip()

db = SessionLocal()
if db.query(Profile).filter(Profile.username == username).first():
    print(f'Admin with username "{username}" already exists.')
    sys.exit(1)

admin = Profile(
    username=username,
    password_hash=hash_password(password),
    plain_password=password,
    name=name,
    surname=surname,
    unique_id=username,
    role="admin",
    points=0,
)
db.add(admin)
db.commit()
print(f'Admin "{name} {surname}" created. Login with username: {username}')
db.close()
