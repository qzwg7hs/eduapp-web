from datetime import date, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import WeeklyMission, StudentMissionProgress, Profile
from ..schemas import MissionCreate, MissionAdminOut, MissionStudentOut
from ..auth import require_admin, require_student
from ..missions import GOAL_TYPES, mission_text

router = APIRouter(prefix="/missions", tags=["missions"])


def _today_utc5() -> date:
    """Same calendar-day convention as POD/the daily exam/streaks — rolls
    over at 00:00 UTC+5, not server-local midnight."""
    return (datetime.utcnow() + timedelta(hours=5)).date()


# ── Student ───────────────────────────────────────────────────────────────────

@router.get("/current", response_model=list[MissionStudentOut])
def get_current_missions(language: str = "kz", db: Session = Depends(get_db), current_user: Profile = Depends(require_student)):
    today = _today_utc5()
    missions = (
        db.query(WeeklyMission)
        .filter(WeeklyMission.week_start <= today, WeeklyMission.week_end >= today)
        .order_by(WeeklyMission.created_at)
        .all()
    )
    out = []
    for m in missions:
        row = db.query(StudentMissionProgress).filter(
            StudentMissionProgress.student_id == current_user.id,
            StudentMissionProgress.mission_id == m.id,
        ).first()
        out.append(MissionStudentOut(
            id=m.id,
            goal_type=m.goal_type,
            target=m.target,
            progress=min(row.progress, m.target) if row else 0,
            reward_points=m.reward_points,
            completed=bool(row and row.points_awarded),
            text=mission_text(m.goal_type, m.target, language),
            week_end=m.week_end,
        ))
    return out


# ── Admin ─────────────────────────────────────────────────────────────────────

@router.get("/admin/goal-types")
def list_goal_types(_=Depends(require_admin)):
    """The fixed set of supported mission types, for the admin dropdown."""
    return [{"goal_type": k, "label": v} for k, v in GOAL_TYPES.items()]


@router.get("/admin", response_model=list[MissionAdminOut])
def list_missions(db: Session = Depends(get_db), _=Depends(require_admin)):
    missions = db.query(WeeklyMission).order_by(WeeklyMission.week_start.desc()).all()
    return [
        MissionAdminOut(
            id=m.id, goal_type=m.goal_type, target=m.target, reward_points=m.reward_points,
            week_start=m.week_start, week_end=m.week_end,
            text_kz=mission_text(m.goal_type, m.target, "kz"),
            text_ru=mission_text(m.goal_type, m.target, "ru"),
        )
        for m in missions
    ]


@router.post("/admin", response_model=MissionAdminOut)
def create_mission(body: MissionCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    if body.goal_type not in GOAL_TYPES:
        raise HTTPException(400, f"Unknown goal_type. Must be one of: {', '.join(GOAL_TYPES)}")
    if body.target <= 0:
        raise HTTPException(400, "target must be positive")
    if body.reward_points <= 0:
        raise HTTPException(400, "reward_points must be positive")

    week_end = body.week_start + timedelta(days=6)
    m = WeeklyMission(
        goal_type=body.goal_type, target=body.target, reward_points=body.reward_points,
        week_start=body.week_start, week_end=week_end,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return MissionAdminOut(
        id=m.id, goal_type=m.goal_type, target=m.target, reward_points=m.reward_points,
        week_start=m.week_start, week_end=m.week_end,
        text_kz=mission_text(m.goal_type, m.target, "kz"),
        text_ru=mission_text(m.goal_type, m.target, "ru"),
    )


@router.delete("/admin/{mission_id}")
def delete_mission(mission_id: UUID, db: Session = Depends(get_db), _=Depends(require_admin)):
    m = db.query(WeeklyMission).filter(WeeklyMission.id == mission_id).first()
    if not m:
        raise HTTPException(404)
    db.delete(m)
    db.commit()
    return {"ok": True}
