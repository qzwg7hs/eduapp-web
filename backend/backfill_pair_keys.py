"""
One-time backfill: link every kz row to its ru counterpart (same conceptual
topic/subtopic/lesson/problem, different language) via a shared `pair_key`
UUID, so progress and cross-language navigation can treat them as one thing.

Matching strategy (content was always created/revised in lockstep across
both languages, so positional matching is reliable — but we verify counts
at every level rather than assuming):
  - Topics:    kz[i] <-> ru[i] by order_index, within the whole language set.
  - SubTopics: kz[i] <-> ru[i] by order_index, within each matched Topic pair.
  - Lessons:   kz[i] <-> ru[i] by order_index, within each matched SubTopic pair.
  - Problems:  matched by order_index within each matched Lesson pair. The
               lesson-revision pipeline (revise_content.py) builds each
               lesson's kz and ru problem lists from the same parallel JSON
               arrays via enumerate(), so order_index is a reliable 1:1 key
               here — the admin-assigned (level,number) fields are NOT set
               on this content (only bulk-docx-imported problems use those).

Any mismatch (unequal counts, unmatched (level,number) keys) is reported and
skipped rather than guessed — run with --report-only first to check before
writing.

Usage (from backend/, venv active):
    venv\\Scripts\\python.exe backfill_pair_keys.py --report-only
    venv\\Scripts\\python.exe backfill_pair_keys.py
"""
import argparse
import uuid

from app.database import SessionLocal
from app.models import Topic, SubTopic, Lesson, Problem

parser = argparse.ArgumentParser()
parser.add_argument("--report-only", action="store_true", help="don't write anything, just report matches/mismatches")
args = parser.parse_args()

db = SessionLocal()

stats = {"topics": 0, "subtopics": 0, "lessons": 0, "problems": 0}
mismatches = []


def pair(a, b):
    """Assign a shared pair_key to two matched rows (idempotent: reuses a's
    existing pair_key if already set, so re-running is safe)."""
    key = a.pair_key or b.pair_key or uuid.uuid4()
    a.pair_key = key
    b.pair_key = key


kz_topics = db.query(Topic).filter(Topic.language == "kz").order_by(Topic.order_index).all()
ru_topics = db.query(Topic).filter(Topic.language == "ru").order_by(Topic.order_index).all()

if len(kz_topics) != len(ru_topics):
    mismatches.append(f"TOPIC COUNT MISMATCH: kz={len(kz_topics)} ru={len(ru_topics)}")
    kz_topics, ru_topics = kz_topics[:0], ru_topics[:0]  # bail on topic-level matching entirely

for kt, rt in zip(kz_topics, ru_topics):
    pair(kt, rt)
    stats["topics"] += 1

    kz_subs = db.query(SubTopic).filter(SubTopic.topic_id == kt.id).order_by(SubTopic.order_index).all()
    ru_subs = db.query(SubTopic).filter(SubTopic.topic_id == rt.id).order_by(SubTopic.order_index).all()
    if len(kz_subs) != len(ru_subs):
        mismatches.append(f"SUBTOPIC COUNT MISMATCH under topic '{kt.title}' (order {kt.order_index}): kz={len(kz_subs)} ru={len(ru_subs)}")
        continue

    for ks, rs in zip(kz_subs, ru_subs):
        pair(ks, rs)
        stats["subtopics"] += 1

        kz_lessons = db.query(Lesson).filter(Lesson.subtopic_id == ks.id).order_by(Lesson.order_index).all()
        ru_lessons = db.query(Lesson).filter(Lesson.subtopic_id == rs.id).order_by(Lesson.order_index).all()
        if len(kz_lessons) != len(ru_lessons):
            mismatches.append(f"LESSON COUNT MISMATCH under subtopic '{ks.title}' (order {ks.order_index}): kz={len(kz_lessons)} ru={len(ru_lessons)}")
            continue

        for kl, rl in zip(kz_lessons, ru_lessons):
            pair(kl, rl)
            stats["lessons"] += 1

            kz_probs = db.query(Problem).filter(Problem.subsubtopic_id == kl.id).all()
            ru_probs = db.query(Problem).filter(Problem.subsubtopic_id == rl.id).all()
            kz_by_key = {p.order_index: p for p in kz_probs}
            ru_by_key = {p.order_index: p for p in ru_probs}

            if len(kz_by_key) != len(kz_probs):
                mismatches.append(f"DUPLICATE order_index within kz lesson '{kl.title}' (order {kl.order_index})")
            if len(ru_by_key) != len(ru_probs):
                mismatches.append(f"DUPLICATE order_index within ru lesson '{rl.title}' (order {rl.order_index})")

            if set(kz_by_key) != set(ru_by_key):
                only_kz = set(kz_by_key) - set(ru_by_key)
                only_ru = set(ru_by_key) - set(kz_by_key)
                mismatches.append(
                    f"PROBLEM KEY MISMATCH in lesson '{kl.title}' (order {kl.order_index}): "
                    f"kz-only={sorted(only_kz)} ru-only={sorted(only_ru)}"
                )

            for key in set(kz_by_key) & set(ru_by_key):
                pair(kz_by_key[key], ru_by_key[key])
                stats["problems"] += 1

print("Matched pairs:", stats)
print(f"\nMismatches ({len(mismatches)}):")
for m in mismatches:
    print(" -", m)

if args.report_only:
    db.rollback()
    print("\n--report-only: no changes written.")
else:
    db.commit()
    print("\nCommitted.")

db.close()
