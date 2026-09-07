# -*- coding: utf-8 -*-
"""
Broadcast notifications: one row per announcement, shown to every student.
Unread state is derived (an announcement is unread for a student until a
matching NotificationRead row exists), not a per-notification counter, so
sending a new announcement never has to touch every student's row — only
opening one does.
"""
from pydantic import BaseModel
from sqlalchemy.orm import Session

from fastapi import APIRouter, Depends, HTTPException

from ..database import get_db
from ..models import Profile, Notification, NotificationRead
from ..auth import require_student, require_admin

router = APIRouter(prefix="/notifications", tags=["notifications"])


class NotificationCreate(BaseModel):
    icon: str | None = None
    title_kz: str
    title_ru: str
    body_kz: str
    body_ru: str


def _localized(n: Notification, language: str) -> dict:
    kz = language == "kz"
    return {
        "id": str(n.id),
        "icon": n.icon,
        "title": n.title_kz if kz else n.title_ru,
        "body": n.body_kz if kz else n.body_ru,
        "created_at": n.created_at,
    }


@router.get("")
def list_notifications(language: str = "kz", db: Session = Depends(get_db), current_user: Profile = Depends(require_student)):
    notifications = db.query(Notification).order_by(Notification.created_at.desc()).all()
    read_ids = {
        r.notification_id for r in db.query(NotificationRead.notification_id)
        .filter(NotificationRead.student_id == current_user.id).all()
    }
    return [{**_localized(n, language), "is_read": n.id in read_ids} for n in notifications]


@router.get("/unread-count")
def unread_count(db: Session = Depends(get_db), current_user: Profile = Depends(require_student)):
    total = db.query(Notification).count()
    read = db.query(NotificationRead).filter(NotificationRead.student_id == current_user.id).count()
    return {"count": max(0, total - read)}


@router.post("/{notification_id}/read")
def mark_read(notification_id: str, db: Session = Depends(get_db), current_user: Profile = Depends(require_student)):
    notification = db.query(Notification).filter(Notification.id == notification_id).first()
    if not notification:
        raise HTTPException(404, "Not found")
    existing = db.query(NotificationRead).filter(
        NotificationRead.student_id == current_user.id, NotificationRead.notification_id == notification_id,
    ).first()
    if not existing:
        db.add(NotificationRead(student_id=current_user.id, notification_id=notification_id))
        db.commit()
    return {"ok": True}


@router.post("/read-all")
def mark_all_read(db: Session = Depends(get_db), current_user: Profile = Depends(require_student)):
    notifications = db.query(Notification.id).all()
    read_ids = {
        r.notification_id for r in db.query(NotificationRead.notification_id)
        .filter(NotificationRead.student_id == current_user.id).all()
    }
    for (nid,) in notifications:
        if nid not in read_ids:
            db.add(NotificationRead(student_id=current_user.id, notification_id=nid))
    db.commit()
    return {"ok": True}


# --- Admin -------------------------------------------------------------

@router.get("/admin")
def admin_list(db: Session = Depends(get_db), current_user: Profile = Depends(require_admin)):
    notifications = db.query(Notification).order_by(Notification.created_at.desc()).all()
    return [{
        "id": str(n.id), "icon": n.icon,
        "title_kz": n.title_kz, "title_ru": n.title_ru,
        "body_kz": n.body_kz, "body_ru": n.body_ru,
        "created_at": n.created_at,
    } for n in notifications]


@router.post("/admin")
def admin_create(body: NotificationCreate, db: Session = Depends(get_db), current_user: Profile = Depends(require_admin)):
    for field in (body.title_kz, body.title_ru, body.body_kz, body.body_ru):
        if not field.strip():
            raise HTTPException(400, "Title and body are required in both languages.")
    n = Notification(
        icon=body.icon or None,
        title_kz=body.title_kz.strip(), title_ru=body.title_ru.strip(),
        body_kz=body.body_kz.strip(), body_ru=body.body_ru.strip(),
    )
    db.add(n)
    db.commit()
    db.refresh(n)
    return {
        "id": str(n.id), "icon": n.icon,
        "title_kz": n.title_kz, "title_ru": n.title_ru,
        "body_kz": n.body_kz, "body_ru": n.body_ru,
        "created_at": n.created_at,
    }


@router.delete("/admin/{notification_id}")
def admin_delete(notification_id: str, db: Session = Depends(get_db), current_user: Profile = Depends(require_admin)):
    n = db.query(Notification).filter(Notification.id == notification_id).first()
    if not n:
        raise HTTPException(404, "Not found")
    db.delete(n)
    db.commit()
    return {"ok": True}
