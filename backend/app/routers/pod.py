from datetime import datetime, timedelta, date as date_type
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Form, File, UploadFile
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ProblemOfDay, PodAttempt, Profile
from ..schemas import PodAdminOut, PodStatusOut, PodAttemptCreate, PodAttemptOut
from ..auth import get_current_user, require_admin, require_student
from ..storage import upload_image, upload_file_bytes
from ..pod_parser import parse_pod_docx

router = APIRouter(prefix="/pod", tags=["pod"])

POD_POINTS = 5

_IMG_EXT = {
    'image/png': '.png', 'image/jpeg': '.jpg', 'image/jpg': '.jpg',
    'image/gif': '.gif', 'image/webp': '.webp',
}


def _today_utc5() -> date_type:
    """Problem of the Day rolls over at 00:00 UTC+5 (Kazakhstan time) — same
    calendar-day convention as the Test Bank."""
    return (datetime.utcnow() + timedelta(hours=5)).date()


def _active_window(day: date_type) -> tuple[datetime, datetime]:
    # 00:00 UTC+5 == 19:00 UTC the previous calendar day
    active_from = datetime(day.year, day.month, day.day) - timedelta(hours=5)
    return active_from, active_from + timedelta(days=1)


def _cleanup_old_pods(db: Session) -> None:
    """Keep only yesterday, today, and future days — delete anything older,
    every time a Problem of the Day endpoint is hit (same lazy pattern as the
    leaderboard's monthly reset — no scheduler needed)."""
    cutoff = _today_utc5() - timedelta(days=1)
    db.query(ProblemOfDay).filter(ProblemOfDay.date < cutoff).delete(synchronize_session=False)
    db.commit()


def _resolve(pod: ProblemOfDay, language: str) -> tuple[str, str | None]:
    if language == "ru":
        return pod.question_ru, pod.description_ru
    return pod.question_kz, pod.description_kz


# ── Student ─────────────────────────────────────────────────────────────────

@router.get("/today", response_model=PodStatusOut)
def get_today_pod(language: str = "kz", db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _cleanup_old_pods(db)
    now = datetime.utcnow()
    pod = db.query(ProblemOfDay).filter(
        ProblemOfDay.active_from <= now,
        ProblemOfDay.active_until >= now,
    ).first()
    if not pod:
        return PodStatusOut(status="none")

    if current_user.role == "student":
        already = db.query(PodAttempt).filter(
            PodAttempt.student_id == current_user.id,
            PodAttempt.pod_id == pod.id,
        ).first()
        if already:
            # Answered (or forced-stopped) already — no re-entry, no review.
            return PodStatusOut(status="locked")

    question, description = _resolve(pod, language)
    return PodStatusOut(status="available", pod_id=pod.id, question=question, description=description, image_url=pod.image_url)


@router.post("/attempt", response_model=PodAttemptOut)
def submit_pod_attempt(body: PodAttemptCreate, db: Session = Depends(get_db), current_user: Profile = Depends(require_student)):
    pod = db.query(ProblemOfDay).filter(ProblemOfDay.id == body.pod_id).first()
    if not pod:
        raise HTTPException(404, "Problem of Day not found")

    already = db.query(PodAttempt).filter(
        PodAttempt.student_id == current_user.id,
        PodAttempt.pod_id == body.pod_id,
    ).first()
    if already:
        raise HTTPException(400, "Already answered today's Problem of the Day")

    normalized = body.answer.strip().lower()
    is_correct = bool(normalized) and normalized == pod.correct_answer.strip().lower()
    pts = POD_POINTS if is_correct else 0

    attempt = PodAttempt(
        student_id=current_user.id,
        pod_id=body.pod_id,
        is_correct=is_correct,
        points_earned=pts,
        answer=normalized,
    )
    db.add(attempt)

    if pts > 0:
        # Atomic SQL-level increment — avoids losing an update when this
        # races with another points-awarding request (see problems.py).
        db.query(Profile).filter(Profile.id == current_user.id).update(
            {"points": Profile.points + pts}, synchronize_session=False
        )

    db.commit()
    db.refresh(attempt)
    return attempt


# ── Admin ─────────────────────────────────────────────────────────────────────

@router.get("/admin/list", response_model=list[PodAdminOut])
def list_pods(db: Session = Depends(get_db), _=Depends(require_admin)):
    _cleanup_old_pods(db)
    return db.query(ProblemOfDay).order_by(ProblemOfDay.date).all()


@router.post("/admin/upload")
async def upload_pod_docx(file: UploadFile = File(...), db: Session = Depends(get_db), _=Depends(require_admin)):
    """Bulk-import a bilingual Problem-of-the-Day .docx — each parsed problem
    is appended to the queue on the next free day after whatever is already
    scheduled (or starting today if the queue is empty)."""
    if not (file.filename or '').lower().endswith('.docx'):
        raise HTTPException(400, "Only .docx files are supported")

    content = await file.read()
    parsed, errors = parse_pod_docx(content)

    existing_dates = sorted(d for (d,) in db.query(ProblemOfDay.date).all())
    next_date = existing_dates[-1] + timedelta(days=1) if existing_dates else _today_utc5()

    imported = 0
    for item in parsed:
        image_url = None
        for img_bytes, ctype in item['images'][:1]:
            ext = _IMG_EXT.get(ctype, '.png')
            image_url = upload_file_bytes(img_bytes, f'pod_img{ext}', folder='pod-images/', content_type=ctype)

        active_from, active_until = _active_window(next_date)
        db.add(ProblemOfDay(
            date=next_date,
            question_kz=item['question_kz'],
            question_ru=item['question_ru'],
            correct_answer=item['answer'].strip().lower(),
            image_url=image_url,
            active_from=active_from,
            active_until=active_until,
        ))
        imported += 1
        next_date = next_date + timedelta(days=1)

    db.commit()
    return {
        "imported": imported,
        "errors": [{"number": e["number"], "reason": "; ".join(e["issues"])} for e in errors],
    }


@router.post("/admin", response_model=PodAdminOut)
def upsert_pod(
        date: date_type = Form(...),
        question_kz: str = Form(...),
        question_ru: str = Form(...),
        correct_answer: str = Form(...),
        description_kz: str | None = Form(None),
        description_ru: str | None = Form(None),
        image: UploadFile | None = File(None),
        db: Session = Depends(get_db),
        _=Depends(require_admin),
):
    if not question_kz.strip() or not question_ru.strip() or not correct_answer.strip():
        raise HTTPException(400, "Question (both languages) and correct answer are required")

    image_url = upload_image(image) if image else None
    active_from, active_until = _active_window(date)

    existing = db.query(ProblemOfDay).filter(ProblemOfDay.date == date).first()
    if existing:
        existing.question_kz = question_kz
        existing.question_ru = question_ru
        existing.description_kz = description_kz
        existing.description_ru = description_ru
        existing.correct_answer = correct_answer.strip().lower()
        if image_url:
            existing.image_url = image_url
        existing.active_from = active_from
        existing.active_until = active_until
        db.commit()
        db.refresh(existing)
        return existing

    pod = ProblemOfDay(
        date=date,
        question_kz=question_kz,
        question_ru=question_ru,
        description_kz=description_kz,
        description_ru=description_ru,
        image_url=image_url,
        correct_answer=correct_answer.strip().lower(),
        active_from=active_from,
        active_until=active_until,
    )
    db.add(pod)
    db.commit()
    db.refresh(pod)
    return pod


@router.put("/admin/{pod_id}", response_model=PodAdminOut)
def update_pod(
        pod_id: UUID,
        question_kz: str = Form(...),
        question_ru: str = Form(...),
        correct_answer: str = Form(...),
        description_kz: str | None = Form(None),
        description_ru: str | None = Form(None),
        image: UploadFile | None = File(None),
        db: Session = Depends(get_db),
        _=Depends(require_admin),
):
    pod = db.query(ProblemOfDay).filter(ProblemOfDay.id == pod_id).first()
    if not pod:
        raise HTTPException(404)
    if not question_kz.strip() or not question_ru.strip() or not correct_answer.strip():
        raise HTTPException(400, "Question (both languages) and correct answer are required")

    pod.question_kz = question_kz
    pod.question_ru = question_ru
    pod.description_kz = description_kz
    pod.description_ru = description_ru
    pod.correct_answer = correct_answer.strip().lower()
    if image:
        pod.image_url = upload_image(image)

    db.commit()
    db.refresh(pod)
    return pod


@router.delete("/admin/{pod_id}")
def delete_pod(pod_id: UUID, db: Session = Depends(get_db), _=Depends(require_admin)):
    pod = db.query(ProblemOfDay).filter(ProblemOfDay.id == pod_id).first()
    if not pod:
        raise HTTPException(404)
    deleted_date = pod.date
    db.delete(pod)
    db.flush()

    # Close the gap: every later-scheduled entry moves one day earlier, so the
    # queue stays a contiguous run of consecutive days (no empty day left
    # behind). Ascending-date order guarantees each target day is already
    # vacated by the time we move into it, avoiding the unique(date) collision.
    later = (
        db.query(ProblemOfDay)
        .filter(ProblemOfDay.date > deleted_date)
        .order_by(ProblemOfDay.date.asc())
        .all()
    )
    for p in later:
        new_date = p.date - timedelta(days=1)
        p.date = new_date
        p.active_from, p.active_until = _active_window(new_date)
        db.flush()

    db.commit()
    return {"ok": True}


@router.post("/admin/{pod_id}/move")
def move_pod(pod_id: UUID, direction: str, db: Session = Depends(get_db), _=Depends(require_admin)):
    """Swap this entry's scheduled day with its neighbor (direction: 'up' = earlier, 'down' = later)."""
    if direction not in ("up", "down"):
        raise HTTPException(400, "direction must be 'up' or 'down'")

    all_pods = db.query(ProblemOfDay).order_by(ProblemOfDay.date).all()
    idx = next((i for i, p in enumerate(all_pods) if p.id == pod_id), None)
    if idx is None:
        raise HTTPException(404)

    target_idx = idx - 1 if direction == "up" else idx + 1
    if target_idx < 0 or target_idx >= len(all_pods):
        raise HTTPException(400, "Already at the edge of the queue")

    a, b = all_pods[idx], all_pods[target_idx]
    a_date, b_date = a.date, b.date

    # 3-step swap through a scratch date to avoid the unique(date) collision
    a.date = a_date + timedelta(days=100000)
    db.flush()
    b.date = a_date
    b.active_from, b.active_until = _active_window(a_date)
    db.flush()
    a.date = b_date
    a.active_from, a.active_until = _active_window(b_date)

    db.commit()
    return {"ok": True}
