"""
One-time backfill: mirror all EXISTING (pre-dating the cross-language
mirroring feature) correct/skip ProblemAttempts and completed
StudentProgress rows onto their pair_key counterparts, so progress made
before this feature shipped is just as language-consistent as progress
made after it.

Only mirrors the *latest* relevant attempt per (student, problem) — a
correct one if any exists, else the latest skip — matching what
get_best_attempts_for_lesson would already surface. points_earned is
always 0 on the mirror (the real point was already awarded once,
historically, on the original attempt).

Idempotent: skips a pairing if a mirror already exists for that
(student, sibling problem/lesson) combination, so re-running is safe.

Usage (from backend/, venv active):
    venv\\Scripts\\python.exe backfill_mirror_progress.py --report-only
    venv\\Scripts\\python.exe backfill_mirror_progress.py
"""
import argparse

from app.database import SessionLocal
from app.models import Problem, ProblemAttempt, Lesson, StudentProgress

parser = argparse.ArgumentParser()
parser.add_argument("--report-only", action="store_true")
args = parser.parse_args()

db = SessionLocal()

# ── Problem attempts ─────────────────────────────────────────────────────
# sibling_of[problem_id] = sibling problem_id, for every paired problem
paired_problems = db.query(Problem).filter(Problem.pair_key.isnot(None)).all()
by_pair_key: dict = {}
for p in paired_problems:
    by_pair_key.setdefault(p.pair_key, []).append(p)

sibling_of = {}
for key, probs in by_pair_key.items():
    if len(probs) != 2:
        continue  # shouldn't happen post-backfill_pair_keys.py, skip defensively
    a, b = probs
    sibling_of[a.id] = b.id
    sibling_of[b.id] = a.id

# Real (non-mirror) attempts only — these are the source of truth to mirror from.
real_attempts = db.query(ProblemAttempt).filter(ProblemAttempt.is_mirror == False).all()

# Best real attempt per (student_id, problem_id): correct > latest
best: dict = {}
for a in real_attempts:
    key = (a.student_id, a.problem_id)
    cur = best.get(key)
    if cur is None:
        best[key] = a
    elif a.is_correct and not cur.is_correct:
        best[key] = a
    elif a.is_correct == cur.is_correct and a.attempted_at > cur.attempted_at:
        best[key] = a

# Existing mirror rows (student_id, problem_id) already present — don't duplicate.
existing_mirrors = {
    (a.student_id, a.problem_id)
    for a in db.query(ProblemAttempt).filter(ProblemAttempt.is_mirror == True).all()
}

to_create = 0
for (student_id, problem_id), a in best.items():
    sib_id = sibling_of.get(problem_id)
    if not sib_id:
        continue
    if (student_id, sib_id) in existing_mirrors:
        continue  # sibling already has a mirror (or its own real attempt covers it)
    # Also skip if the sibling already has its own REAL attempt for this
    # student — don't overwrite genuine independent activity on that side.
    if (student_id, sib_id) in best:
        continue
    to_create += 1
    if not args.report_only:
        db.add(ProblemAttempt(
            student_id=student_id,
            problem_id=sib_id,
            is_correct=a.is_correct,
            hints_used=a.hints_used,
            points_earned=0,
            selected_options=a.selected_options,
            open_answer_given=a.open_answer_given,
            is_skip=a.is_skip,
            is_mirror=True,
        ))

print(f"ProblemAttempt mirrors to create: {to_create}")

# ── Lesson completions ───────────────────────────────────────────────────
paired_lessons = db.query(Lesson).filter(Lesson.pair_key.isnot(None)).all()
lesson_by_pair_key: dict = {}
for l in paired_lessons:
    lesson_by_pair_key.setdefault(l.pair_key, []).append(l)

lesson_sibling_of = {}
for key, lessons in lesson_by_pair_key.items():
    if len(lessons) != 2:
        continue
    a, b = lessons
    lesson_sibling_of[a.id] = b.id
    lesson_sibling_of[b.id] = a.id

real_completions = db.query(StudentProgress).filter(
    StudentProgress.is_completed == True,
    StudentProgress.is_mirror == False,
).all()
existing_progress = {
    (sp.student_id, sp.subsubtopic_id)
    for sp in db.query(StudentProgress).all()  # any row at all on that side counts as "already covered"
}

lessons_to_create = 0
for sp in real_completions:
    sib_id = lesson_sibling_of.get(sp.subsubtopic_id)
    if not sib_id:
        continue
    if (sp.student_id, sib_id) in existing_progress:
        continue
    lessons_to_create += 1
    if not args.report_only:
        db.add(StudentProgress(
            student_id=sp.student_id,
            subsubtopic_id=sib_id,
            is_completed=True,
            completed_at=sp.completed_at,
            is_mirror=True,
        ))
        existing_progress.add((sp.student_id, sib_id))

print(f"StudentProgress mirrors to create: {lessons_to_create}")

if args.report_only:
    db.rollback()
    print("--report-only: no changes written.")
else:
    db.commit()
    print("Committed.")

db.close()
