from uuid import UUID
from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import StudentProgress, ProblemAttempt, PodAttempt, Profile
from ..schemas import ProgressCreate, ProgressOut
from ..auth import require_student

router = APIRouter(prefix="/progress", tags=["progress"])


@router.post("/complete", response_model=ProgressOut)
def mark_complete(body: ProgressCreate, db: Session = Depends(get_db), current_user: Profile = Depends(require_student)):
    existing = db.query(StudentProgress).filter(
        StudentProgress.student_id == current_user.id,
        StudentProgress.subsubtopic_id == body.subsubtopic_id,
    ).first()

    if existing:
        if not existing.is_completed:
            existing.is_completed = True
            existing.completed_at = datetime.utcnow()
            db.commit()
            db.refresh(existing)
        return existing

    progress = StudentProgress(
        student_id=current_user.id,
        subsubtopic_id=body.subsubtopic_id,
        is_completed=True,
        completed_at=datetime.utcnow(),
    )
    db.add(progress)
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
        .filter(ProblemAttempt.student_id == current_user.id)
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
    # Exclude skip markers — they're not real answers and shouldn't count
    # against accuracy or toward "attempts".
    attempts = db.query(ProblemAttempt).filter(
        ProblemAttempt.student_id == current_user.id,
        ProblemAttempt.is_skip == False,
    ).all()
    pod_solved = db.query(PodAttempt).filter(
        PodAttempt.student_id == current_user.id,
        PodAttempt.is_correct == True,
    ).count()
    lessons_done = db.query(StudentProgress).filter(
        StudentProgress.student_id == current_user.id,
        StudentProgress.is_completed == True,
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
