from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Profile, ProblemAttempt, Problem, Lesson, SubTopic, Topic, DailyExam
from ..schemas import ProfileOut, StudentCreate, StudentUpdate
from ..auth import hash_password, require_admin

router = APIRouter(prefix="/students", tags=["students"])


@router.get("", response_model=list[ProfileOut])
def list_students(db: Session = Depends(get_db), _=Depends(require_admin)):
    return db.query(Profile).filter(Profile.role == "student").order_by(Profile.surname).all()


@router.post("", response_model=ProfileOut)
def create_student(body: StudentCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    username = body.username.strip().lower()
    if db.query(Profile).filter(Profile.username == username).first():
        raise HTTPException(400, f'Username "{username}" is already taken')

    student = Profile(
        username=username,
        password_hash=hash_password(body.password),
        plain_password=body.password,
        name=body.name,
        surname=body.surname,
        unique_id=username,
        role="student",
        points=0,
    )
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


@router.put("/{student_id}", response_model=ProfileOut)
def update_student(student_id: UUID, body: StudentUpdate, db: Session = Depends(get_db), _=Depends(require_admin)):
    student = db.query(Profile).filter(Profile.id == student_id, Profile.role == "student").first()
    if not student:
        raise HTTPException(404, "Student not found")

    if body.username:
        username = body.username.strip().lower()
        conflict = db.query(Profile).filter(Profile.username == username, Profile.id != student_id).first()
        if conflict:
            raise HTTPException(400, f'Username "{username}" is already taken')
        student.username = username
        student.unique_id = username

    if body.name:
        student.name = body.name
    if body.surname:
        student.surname = body.surname
    if body.new_password:
        student.password_hash = hash_password(body.new_password)
        student.plain_password = body.new_password

    db.commit()
    db.refresh(student)
    return student


@router.post("/{student_id}/toggle-active")
def toggle_active(student_id: UUID, db: Session = Depends(get_db), _=Depends(require_admin)):
    student = db.query(Profile).filter(Profile.id == student_id, Profile.role == "student").first()
    if not student:
        raise HTTPException(404, "Student not found")
    student.is_active = not student.is_active
    db.commit()
    return {"ok": True, "is_active": student.is_active}


@router.delete("/{student_id}")
def delete_student(student_id: UUID, db: Session = Depends(get_db), _=Depends(require_admin)):
    student = db.query(Profile).filter(Profile.id == student_id, Profile.role == "student").first()
    if not student:
        raise HTTPException(404, "Student not found")
    db.delete(student)
    db.commit()
    return {"ok": True}


@router.post("/{student_id}/reset-points")
def reset_points(student_id: UUID, db: Session = Depends(get_db), _=Depends(require_admin)):
    student = db.query(Profile).filter(Profile.id == student_id, Profile.role == "student").first()
    if not student:
        raise HTTPException(404)
    student.points = 0
    db.commit()
    return {"ok": True}


@router.get("/{student_id}/plain-password")
def get_plain_password(student_id: UUID, db: Session = Depends(get_db), _=Depends(require_admin)):
    student = db.query(Profile).filter(Profile.id == student_id, Profile.role == "student").first()
    if not student:
        raise HTTPException(404)
    return {"plain_password": student.plain_password or "(not available)"}


@router.get("/{student_id}/results")
def get_student_results(student_id: UUID, db: Session = Depends(get_db), _=Depends(require_admin)):
    student = db.query(Profile).filter(Profile.id == student_id, Profile.role == "student").first()
    if not student:
        raise HTTPException(404, "Student not found")

    attempts = (
        db.query(ProblemAttempt)
        .filter(ProblemAttempt.student_id == student_id)
        .order_by(ProblemAttempt.attempted_at.desc())
        .all()
    )

    # Best attempt per problem (correct > wrong, most recent wins)
    best: dict = {}
    for a in reversed(attempts):  # oldest first so newest overwrites
        pid = str(a.problem_id)
        if pid not in best or (a.is_correct and not best[pid].is_correct):
            best[pid] = a

    rows = []
    for pid, attempt in best.items():
        problem = db.query(Problem).filter(Problem.id == attempt.problem_id).first()
        if not problem:
            continue
        lesson = db.query(Lesson).filter(Lesson.id == problem.subsubtopic_id).first()
        subtopic = db.query(SubTopic).filter(SubTopic.id == lesson.subtopic_id).first() if lesson else None
        topic = db.query(Topic).filter(Topic.id == subtopic.topic_id).first() if subtopic else None
        rows.append({
            "problem_id":     pid,
            "question":       problem.question[:120],
            "level":          problem.level,
            "problem_type":   problem.problem_type,
            "is_correct":     attempt.is_correct,
            "points_earned":  attempt.points_earned,
            "hints_used":     attempt.hints_used,
            "answer_given":   attempt.open_answer_given if problem.problem_type == "open" else None,
            "attempted_at":   attempt.attempted_at.isoformat() if attempt.attempted_at else None,
            "lesson_title":   lesson.title if lesson else None,
            "subtopic_title": subtopic.title if subtopic else None,
            "topic_title":    topic.title if topic else None,
        })

    # Test Bank (daily exam) history — a separate, unrelated result set
    exams = (
        db.query(DailyExam)
        .filter(DailyExam.student_id == student_id, DailyExam.submitted_at.isnot(None))
        .order_by(DailyExam.exam_date.desc())
        .all()
    )
    exam_rows = [
        {
            "exam_date":        e.exam_date.isoformat(),
            "language":         e.language,
            "score":            e.score,
            "total":            len(e.question_numbers or []),
            "terminated_early": e.terminated_early,
            "submitted_at":     e.submitted_at.isoformat() if e.submitted_at else None,
        }
        for e in exams
    ]

    return {
        "student": {
            "id":             str(student.id),
            "name":           student.name,
            "surname":        student.surname,
            "username":       student.username,
            "plain_password": student.plain_password or "(not available)",
            "points":         student.points,
            "is_active":      student.is_active,
        },
        "total_attempts": len(best),
        "correct_count":  sum(1 for a in best.values() if a.is_correct),
        "total_points":   student.points,
        "results":        rows,
        "test_bank_exams": exam_rows,
    }
