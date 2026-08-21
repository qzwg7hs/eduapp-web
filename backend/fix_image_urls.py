"""
One-shot migration: replace broken "None/..." image_url values with the
correct R2 public URL prefix.

Run from the backend directory:
    python fix_image_urls.py
"""
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

PUBLIC_URL = os.getenv("PUBLIC_URL") or os.getenv("R2_PUBLIC_URL", "")
DATABASE_URL = os.getenv("DATABASE_URL")

if not PUBLIC_URL:
    raise SystemExit("ERROR: neither PUBLIC_URL nor R2_PUBLIC_URL is set in .env")
if not DATABASE_URL:
    raise SystemExit("ERROR: DATABASE_URL is not set in .env")

engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    # Show what will be fixed
    result = conn.execute(text("SELECT id, image_url FROM problems WHERE image_url LIKE 'None/%'"))
    rows = result.fetchall()
    if not rows:
        print("No broken image_url values found — nothing to fix.")
    else:
        print(f"Found {len(rows)} problem(s) with broken image_url:")
        for row in rows:
            bad_url = row[1]
            good_url = PUBLIC_URL.rstrip('/') + bad_url[4:]  # strip "None" prefix
            print(f"  {row[0]}: {bad_url!r} -> {good_url!r}")

        conn.execute(
            text(
                "UPDATE problems SET image_url = :prefix || SUBSTRING(image_url FROM 5) "
                "WHERE image_url LIKE 'None/%'"
            ),
            {"prefix": PUBLIC_URL.rstrip('/')},
        )
        conn.commit()
        print(f"\nFixed {len(rows)} record(s) successfully.")
