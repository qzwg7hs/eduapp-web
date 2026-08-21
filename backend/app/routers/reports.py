from datetime import datetime
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Problem, ProblemAttempt, ProblemReport, Profile
from ..schemas import ReportCreate, ReportResolve, ReportOut
from ..auth import require_student, require_admin

router = APIRouter(prefix="/reports", tags=["reports"])

REGULAR_SCALE = [1, 0, 0, 0, 0]
HARD_SCALE = [1, 0, 0, 0, 0]


def calc_points(is_hard: bool, hints_used: int) -> int:
    scale = HARD_SCALE if is_hard else REGULAR_SCALE
    return scale[min(hints_used, 4)]


@router.post("", response_model=ReportOut)
def submit_report(body: ReportCreate, db: Session = Depends(get_db), current_user: Profile = Depends(require_student)):
    problem = db.query(Problem).filter(Problem.id == body.problem_id).first()
    if not problem:
        raise HTTPException(404, "Problem not found")

    report = ProblemReport(
        problem_id=body.problem_id,
        student_id=current_user.id,
        description=body.description,
        status="pending",
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@router.get("", response_model=list[ReportOut])
def list_reports(status: str = "pending", db: Session = Depends(get_db), _=Depends(require_admin)):
    return (
        db.query(ProblemReport)
        .filter(ProblemReport.status == status)
        .order_by(ProblemReport.created_at.desc())
        .all()
    )


@router.get("/{report_id}", response_model=ReportOut)
def get_report(report_id: UUID, db: Session = Depends(get_db), _=Depends(require_admin)):
    report = db.query(ProblemReport).filter(ProblemReport.id == report_id).first()
    if not report:
        raise HTTPException(404)
    return report


@router.post("/{report_id}/resolve")
def resolve_report(report_id: UUID, body: ReportResolve, db: Session = Depends(get_db), _=Depends(require_admin)):
    report = db.query(ProblemReport).filter(ProblemReport.id == report_id).first()
    if not report:
        raise HTTPException(404)

    report.status = "resolved" if body.action == "fix" else "dismissed"
    report.admin_note = body.admin_note
    report.resolved_at = datetime.utcnow()

    if body.action == "fix":
        problem = db.query(Problem).filter(Problem.id == report.problem_id).first()
        if not problem:
            raise HTTPException(404, "Problem not found")

        # Update the correct answer
        if body.new_correct_options is not None:
            problem.correct_options = body.new_correct_options
            problem.correct_option = body.new_correct_options[0] if body.new_correct_options else 0
        if body.new_open_answer is not None:
            problem.open_answer = body.new_open_answer

        # Retroactive grading: re-evaluate all attempts for this problem
        all_attempts = db.query(ProblemAttempt).filter(ProblemAttempt.problem_id == problem.id).all()
        seen_students: set[str] = set()

        for attempt in all_attempts:
            sid = str(attempt.student_id)
            # Recompute correctness
            if problem.problem_type == "open":
                from .problems import _check_open_correct
                now_correct = _check_open_correct(problem, attempt.open_answer_given or "")
            else:
                selected = attempt.selected_options or []
                correct_opts = problem.correct_options or [problem.correct_option]
                now_correct = sorted(selected) == sorted(correct_opts)

            was_correct = attempt.is_correct
            attempt.is_correct = now_correct

            # Award points only for first correct attempt per student
            if now_correct and not was_correct and sid not in seen_students:
                pts = calc_points(problem.is_hard, attempt.hints_used)
                attempt.points_earned = pts
                student = db.query(Profile).filter(Profile.id == attempt.student_id).first()
                if student:
                    student.points += pts
                seen_students.add(sid)

    db.commit()
    return {"ok": True, "status": report.status}
