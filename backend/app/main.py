from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from .database import engine, Base, settings
from .routers import auth, topics, problems, pod, students, leaderboard, progress, test_bank
# Note: the "reports" (problem complaints) router is deliberately not mounted —
# the feature was removed from the product surface. app/routers/reports.py and
# the ProblemReport model/table are left in place, unused, in case it's revived.

# Create all tables on startup
Base.metadata.create_all(bind=engine)

# Additive column migrations (safe to run every startup)
def _run_migrations():
    insp = inspect(engine)

    # Problem of the Day: bilingual question/description columns replaced the
    # old single-language ones (table had no real data at migration time).
    pod_cols = {c['name'] for c in insp.get_columns('problems_of_day')}
    with engine.begin() as conn:
        if 'question_kz' not in pod_cols:
            conn.execute(text('ALTER TABLE problems_of_day ADD COLUMN question_kz TEXT'))
            if 'question' in pod_cols:
                conn.execute(text("UPDATE problems_of_day SET question_kz = question WHERE question_kz IS NULL AND question IS NOT NULL"))
        if 'question_ru' not in pod_cols:
            conn.execute(text('ALTER TABLE problems_of_day ADD COLUMN question_ru TEXT'))
            if 'question' in pod_cols:
                conn.execute(text("UPDATE problems_of_day SET question_ru = question WHERE question_ru IS NULL AND question IS NOT NULL"))
        if 'description_kz' not in pod_cols:
            conn.execute(text('ALTER TABLE problems_of_day ADD COLUMN description_kz TEXT'))
            if 'description' in pod_cols:
                conn.execute(text("UPDATE problems_of_day SET description_kz = description WHERE description_kz IS NULL"))
        if 'description_ru' not in pod_cols:
            conn.execute(text('ALTER TABLE problems_of_day ADD COLUMN description_ru TEXT'))
            if 'description' in pod_cols:
                conn.execute(text("UPDATE problems_of_day SET description_ru = description WHERE description_ru IS NULL"))
        if 'question' in pod_cols:
            conn.execute(text('ALTER TABLE problems_of_day DROP COLUMN question'))
        if 'description' in pod_cols:
            conn.execute(text('ALTER TABLE problems_of_day DROP COLUMN description'))

    prob_cols = {c['name'] for c in insp.get_columns('problems')}
    with engine.begin() as conn:
        if 'level' not in prob_cols:
            conn.execute(text('ALTER TABLE problems ADD COLUMN level VARCHAR'))
        if 'number' not in prob_cols:
            conn.execute(text('ALTER TABLE problems ADD COLUMN number INTEGER'))
        if 'answer_text' not in prob_cols:
            conn.execute(text('ALTER TABLE problems ADD COLUMN answer_text TEXT'))
        if 'source_file_url' not in prob_cols:
            conn.execute(text('ALTER TABLE problems ADD COLUMN source_file_url VARCHAR'))

    # Content-language column (bilingual kz/ru topics/subtopics/lessons/problems)
    for table in ('topics', 'subtopics', 'subsubtopics', 'problems'):
        cols = {c['name'] for c in insp.get_columns(table)}
        if 'language' not in cols:
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN language VARCHAR DEFAULT 'kz'"))
                conn.execute(text(f"UPDATE {table} SET language = 'kz' WHERE language IS NULL"))

    # Skip marker on problem_attempts (persists "student skipped this" across reloads)
    attempt_cols = {c['name'] for c in insp.get_columns('problem_attempts')}
    if 'is_skip' not in attempt_cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE problem_attempts ADD COLUMN is_skip BOOLEAN DEFAULT false"))

    # Fix problems stuck as is_draft=True inside published lessons.
    # These were created by bulk upload before the is_draft=False fix was applied.
    # The publish cascade was skipping them; this repairs existing data.
    with engine.begin() as conn:
        conn.execute(text("""
            UPDATE problems
            SET is_draft = false, is_published = true
            WHERE is_draft = true
              AND subsubtopic_id IN (
                  SELECT id FROM subsubtopics WHERE is_published = true
              )
        """))

_run_migrations()

app = FastAPI(title="EduApp API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(topics.router, prefix="/api")
app.include_router(problems.router, prefix="/api")
app.include_router(pod.router, prefix="/api")
app.include_router(students.router, prefix="/api")
app.include_router(leaderboard.router, prefix="/api")
app.include_router(progress.router, prefix="/api")
app.include_router(test_bank.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
