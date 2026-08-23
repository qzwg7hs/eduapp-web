from uuid import UUID
from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import StudentProgress, ProblemAttempt, PodAttempt, Profile, Lesson
from ..schemas import ProgressCreate, ProgressOut
from ..auth import require_student

router = APIRouter(prefix="/progress", tags=["progress"])


def _mark_one_complete(db: Session, student_id, lesson_id, is_mirror: bool = False) -> StudentProgress:
    existing = db.query(StudentProgress).filter(
        StudentProgress.student_id == student_id,
        StudentProgress.subsubtopic_id == lesson_id,
    ).first()
    if existing:
        if not existing.is_completed:
            existing.is_completed = True
            existing.completed_at = datetime.utcnow()
        return existing

    progress = StudentProgress(
        student_id=student_id,
        subsubtopic_id=lesson_id,
        is_completed=True,
        completed_at=datetime.utcnow(),
        is_mirror=is_mirror,
    )
    db.add(progress)
    return progress


@router.post("/complete", response_model=ProgressOut)
def mark_complete(body: ProgressCreate, db: Session = Depends(get_db), current_user: Profile = Depends(require_student)):
    progress = _mark_one_complete(db, current_user.id, body.subsubtopic_id)

    # Cross-language consistency: also mark this lesson's paired counterpart
    # (same lesson, other language) complete, so "done" status doesn't
    # depend on which language the student happened to finish it in.
    lesson = db.query(Lesson).filter(Lesson.id == body.subsubtopic_id).first()
    if lesson and lesson.pair_key:
        sibling = (
            db.query(Lesson)
            .filter(Lesson.pair_key == lesson.pair_key, Lesson.id != lesson.id)
            .first()
        )
        if sibling:
            _mark_one_complete(db, current_user.id, sibling.id, is_mirror=True)

    db.commit()
    db.refresh(progress)
    return progress


@router.get("/my", response_model=list[ProgressOut])
def my_progress(db: Session = Depends(get_db), current_user: Profile = Depends(require_student)):
    return db.query(StudentProgress).filter(
        StudentProgress.student_id == current_user.id,
        StudentProgress.is_completed == True,
    ).all()


@router.get("/continue")
def continue_progress(
        language: str = "kz",
        db: Session = Depends(get_db),
        current_user: Profile = Depends(require_student),
):
    """The lesson/test the student most recently worked on and hasn't finished
    yet (some but not all of its problems attempted or skipped) — used for a
    'resume where you left off' quick-reference on the home page.

    Every lesson/problem is a separate row per language, so raw attempts on
    a single lesson_id can only ever reflect activity in whichever language
    that specific id belongs to. Two things follow from that, both fixed
    here rather than by grouping on the raw lesson_id like before:
      1. The count must merge BOTH language sides of the same conceptual
         lesson (via each problem's pair_key), or it undercounts whenever
         any of the work happened on the sibling id (mirrored rows are
         deliberately excluded elsewhere as non-activity, but they're
         exactly the signal needed here to know a pair problem was touched
         at all).
      2. The returned lesson/subtopic/topic must be resolved to the
         *currently requested* language, not whichever language the
         underlying activity happened to be recorded in — otherwise the
         card shows a title in a different language than the current UI
         locale.
    """
    from ..models import Problem, Lesson, SubTopic, Topic

    rows = (
        db.query(Problem.subsubtopic_id, Problem.pair_key, Problem.id, ProblemAttempt.attempted_at)
        .join(ProblemAttempt, ProblemAttempt.problem_id == Problem.id)
        .filter(ProblemAttempt.student_id == current_user.id)
        .all()
    )
    if not rows:
        return None

    # Per raw lesson_id: distinct "conceptual problem" keys touched (a
    # problem's pair_key when paired, else its own id) + last activity time.
    per_lesson: dict = {}
    for lesson_id, prob_pair_key, prob_id, attempted_at in rows:
        d = per_lesson.setdefault(lesson_id, {"keys": set(), "last": attempted_at})
        d["keys"].add(prob_pair_key or prob_id)
        if attempted_at > d["last"]:
            d["last"] = attempted_at

    lessons_by_id = {l.id: l for l in db.query(Lesson).filter(Lesson.id.in_(per_lesson.keys())).all()}

    # Merge each lesson_id's activity with its pair sibling's, so a lesson
    # worked on across both languages (or purely mirrored on one side) is
    # counted once, completely — not split into two partial groups.
    merged: dict = {}
    handled: set = set()
    for lesson_id, d in per_lesson.items():
        if lesson_id in handled:
            continue
        lesson = lessons_by_id.get(lesson_id)
        sibling_id = None
        if lesson and lesson.pair_key:
            sibling = (
                db.query(Lesson)
                .filter(Lesson.pair_key == lesson.pair_key, Lesson.id != lesson_id)
                .first()
            )
            sibling_id = sibling.id if sibling else None

        keys = set(d["keys"])
        last = d["last"]
        if sibling_id and sibling_id in per_lesson:
            keys |= per_lesson[sibling_id]["keys"]
            last = max(last, per_lesson[sibling_id]["last"])
            handled.add(sibling_id)
        handled.add(lesson_id)
        merged[lesson_id] = {"keys": keys, "last": last}

    ranked = sorted(merged.items(), key=lambda kv: kv[1]["last"], reverse=True)

    for lesson_id, d in ranked:
        lesson = lessons_by_id.get(lesson_id)
        if not lesson:
            continue

        # Resolve to the requested display language.
        display_lesson = lesson
        if lesson.language != language:
            if not lesson.pair_key:
                continue
            counterpart = (
                db.query(Lesson)
                .filter(Lesson.pair_key == lesson.pair_key, Lesson.language == language)
                .first()
            )
            if not counterpart:
                continue
            display_lesson = counterpart

        if not display_lesson.is_published:
            continue
        total = db.query(Problem).filter(Problem.subsubtopic_id == display_lesson.id, Problem.is_published == True).count()
        attempted = len(d["keys"])
        if total == 0 or attempted >= total:
            continue  # no real test here, or already fully gone through

        sub = db.query(SubTopic).filter(SubTopic.id == display_lesson.subtopic_id).first()
        topic = db.query(Topic).filter(Topic.id == sub.topic_id).first() if sub else None
        if not sub or not topic:
            continue

        return {
            "lesson_id": str(display_lesson.id),
            "lesson_title": display_lesson.title,
            "subtopic_title": sub.title,
            "topic_id": str(topic.id),
            "topic_title": topic.title,
            "attempted_count": attempted,
            "total_count": total,
        }

    return None


@router.get("/stats")
def my_stats(db: Session = Depends(get_db), current_user: Profile = Depends(require_student)):
    # Exclude skip markers (not real answers) and mirror rows (the synthetic
    # cross-language echo of a real attempt made on the other language's
    # problem — counting both would double every real answer).
    attempts = db.query(ProblemAttempt).filter(
        ProblemAttempt.student_id == current_user.id,
        ProblemAttempt.is_skip == False,
        ProblemAttempt.is_mirror == False,
    ).all()
    pod_solved = db.query(PodAttempt).filter(
        PodAttempt.student_id == current_user.id,
        PodAttempt.is_correct == True,
    ).count()
    lessons_done = db.query(StudentProgress).filter(
        StudentProgress.student_id == current_user.id,
        StudentProgress.is_completed == True,
        StudentProgress.is_mirror == False,
    ).count()

    total = len(attempts)
    correct = sum(1 for a in attempts if a.is_correct)
    # Distinct problems actually solved (correctly, at least once) — not a
    # count of every attempt, which can exceed the total problem count once
    # retries are involved.
    problems_solved = len({a.problem_id for a in attempts if a.is_correct})

    return {
        "total_attempts": total,
        "correct_attempts": correct,
        "problems_solved": problems_solved,
        "pod_solved": pod_solved,
        "lessons_completed": lessons_done,
    }


@router.get("/admin/overview")
def admin_overview(db: Session = Depends(get_db)):
    from ..auth import require_admin
    from ..models import Topic, Problem

    students = db.query(Profile).filter(Profile.role == "student").all()
    avg_points = round(sum(s.points for s in students) / len(students)) if students else 0

    return {
        "total_students": len(students),
        "total_topics": db.query(Topic).count(),
        "total_problems": db.query(Problem).count(),
        "avg_points": avg_points,
        "top_students": [
            {"name": s.name, "surname": s.surname, "points": s.points}
            for s in sorted(students, key=lambda x: x.points, reverse=True)[:5]
        ],
    }
