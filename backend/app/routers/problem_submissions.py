# -*- coding: utf-8 -*-
"""
Students can author their own problem (text/formula/image/heading blocks,
same shape as Lesson.content_blocks) and send it in as a suggestion. Purely
a review inbox for admin — nothing here ever auto-publishes into real
content; see models.ProblemSubmission for the full reasoning.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Profile, ProblemSubmission
from ..schemas import ProblemSubmissionAdminOut, ProblemSubmissionCreate, ProblemSubmissionOut
from ..auth import require_admin, require_student
from ..storage import upload_file_bytes
from datetime import datetime

router = APIRouter(prefix="/problem-submissions", tags=["problem-submissions"])

_IMG_EXT = {
    'image/png': '.png', 'image/jpeg': '.jpg', 'image/jpg': '.jpg',
    'image/gif': '.gif', 'image/webp': '.webp',
}


def require_submission_access(current_user: Profile = Depends(require_student)) -> Profile:
    """Same as require_student, plus the (rare, admin-set) per-student
    opt-out — mirrors require_duel_access in routers/duels.py."""
    if current_user.submission_disabled:
        raise HTTPException(403, "submission_access_disabled")
    return current_user


# ── Student ─────────────────────────────────────────────────────────────────

@router.post("", response_model=ProblemSubmissionOut)
def create_submission(body: ProblemSubmissionCreate, db: Session = Depends(get_db), current_user: Profile = Depends(require_submission_access)):
    if not body.content_blocks:
        raise HTTPException(400, "submission_empty")
    row = ProblemSubmission(
        student_id=current_user.id,
        title=(body.title or "").strip() or None,
        content_blocks=body.content_blocks,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/mine", response_model=list[ProblemSubmissionOut])
def list_mine(db: Session = Depends(get_db), current_user: Profile = Depends(require_submission_access)):
    return (
        db.query(ProblemSubmission)
        .filter(ProblemSubmission.student_id == current_user.id)
        .order_by(ProblemSubmission.created_at.desc())
        .all()
    )


@router.post("/upload-image")
async def upload_submission_image(file: UploadFile = File(...), _=Depends(require_submission_access)):
    ctype = file.content_type or ''
    if not ctype.startswith('image/'):
        raise HTTPException(400, "Only image files are supported")
    content = await file.read()
    ext = _IMG_EXT.get(ctype, '.png')
    url = upload_file_bytes(content, f'submission{ext}', folder='submission-images/', content_type=ctype)
    return {"url": url}


# ── Admin ───────────────────────────────────────────────────────────────────

def _to_admin_out(row: ProblemSubmission, student: Profile) -> ProblemSubmissionAdminOut:
    return ProblemSubmissionAdminOut(
        id=row.id, student_id=row.student_id,
        student_name=student.name, student_surname=student.surname, student_unique_id=student.unique_id,
        title=row.title, content_blocks=row.content_blocks, created_at=row.created_at, is_seen=row.is_seen,
    )


@router.get("/admin", response_model=list[ProblemSubmissionAdminOut])
def admin_list(db: Session = Depends(get_db), _=Depends(require_admin)):
    rows = (
        db.query(ProblemSubmission, Profile)
        .join(Profile, Profile.id == ProblemSubmission.student_id)
        .order_by(ProblemSubmission.created_at.desc())
        .all()
    )
    return [_to_admin_out(sub, student) for sub, student in rows]


@router.get("/admin/{submission_id}", response_model=ProblemSubmissionAdminOut)
def admin_get(submission_id: UUID, db: Session = Depends(get_db), _=Depends(require_admin)):
    row = db.query(ProblemSubmission).filter(ProblemSubmission.id == submission_id).first()
    if not row:
        raise HTTPException(404, "Not found")
    if not row.is_seen:
        row.is_seen = True
        row.seen_at = datetime.utcnow()
        db.commit()
        db.refresh(row)
    student = db.query(Profile).filter(Profile.id == row.student_id).first()
    return _to_admin_out(row, student)


@router.delete("/admin/{submission_id}")
def admin_delete(submission_id: UUID, db: Session = Depends(get_db), _=Depends(require_admin)):
    row = db.query(ProblemSubmission).filter(ProblemSubmission.id == submission_id).first()
    if not row:
        raise HTTPException(404, "Not found")
    db.delete(row)
    db.commit()
    return {"ok": True}
