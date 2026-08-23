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
def continue_progress(db: Session = Depends(get_db), current_user: Profile = Depends(require_student)):
    """The lesson/test the student most recently worked on and hasn't finished
    yet (some but not all of its problems attempted or skipped) — used for a
    'resume where you left off' quick-reference on the home page."""
    from sqlalchemy import func
    from ..models import Problem, Lesson, SubTopic, Topic

    rows = (
        db.query(
            Problem.subsubtopic_id.label("lesson_id"),
            func.max(ProblemAttempt.attempted_at).label("last_at"),
            func.count(func.distinct(ProblemAttempt.problem_id)).label("attempted"),
        )
        .join(ProblemAttempt, ProblemAttempt.problem_id == Problem.id)
        .filter(
            ProblemAttempt.student_id == current_user.id,
            # Exclude synthetic cross-language echoes — this should reflect
            # genuine activity, not the mirrored noise of an attempt made on
            # the paired problem in the other language.
            ProblemAttempt.is_mirror == False,
        )
        .group_by(Problem.subsubtopic_id)
        .order_by(func.max(ProblemAttempt.attempted_at).desc())
        .all()
    )

    for row in rows:
        lesson = db.query(Lesson).filter(Lesson.id == row.lesson_id).first()
        if not lesson or not lesson.is_published:
            continue
        total = db.query(Problem).filter(Problem.subsubtopic_id == lesson.id, Problem.is_published == True).count()
        if total == 0 or row.attempted >= total:
            continue  # no real test here, or already fully gone through

        sub = db.query(SubTopic).filter(SubTopic.id == lesson.subtopic_id).first()
        topic = db.query(Topic).filter(Topic.id == sub.topic_id).first() if sub else None
        if not sub or not topic:
            continue

        return {
            "lesson_id": str(lesson.id),
            "lesson_title": lesson.title,
            "subtopic_title": sub.title,
            "topic_id": str(topic.id),
            "topic_title": topic.title,
            "attempted_count": row.attempted,
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
