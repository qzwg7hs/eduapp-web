from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Profile, SystemSettings
from ..schemas import LeaderboardEntry
from ..auth import get_current_user

router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])


def _maybe_monthly_reset(db: Session):
    """Reset all student points if a new calendar month has started."""
    now = datetime.utcnow()
    current_key = f"{now.year}-{now.month:02d}"

    setting = db.query(SystemSettings).filter(SystemSettings.key == "last_monthly_reset").first()
    if setting and setting.value == current_key:
        return  # already reset this month

    # Reset all student points
    db.query(Profile).filter(Profile.role == "student").update({"points": 0})

    if setting:
        setting.value = current_key
        setting.updated_at = now
    else:
        db.add(SystemSettings(key="last_monthly_reset", value=current_key, updated_at=now))

    db.commit()


@router.get("", response_model=list[LeaderboardEntry])
def get_leaderboard(db: Session = Depends(get_db), _=Depends(get_current_user)):
    _maybe_monthly_reset(db)
    students = (
        db.query(Profile)
        .filter(Profile.role == "student", Profile.is_active == True)
        .order_by(Profile.points.desc())
        .limit(10)
        .all()
    )
    # Standard competition ranking ("1224"): students tied on points share the
    # same rank, and the next distinct score's rank skips ahead by however
    # many students tied for the rank before it (1, 2, =3, =3, =3, 6 — not 4).
    entries = []
    rank = 0
    for i, s in enumerate(students):
        if i == 0 or s.points != students[i - 1].points:
            rank = i + 1
        entries.append(LeaderboardEntry(
            rank=rank,
            name=s.name,
            surname=s.surname,
            unique_id=s.unique_id,
            points=s.points,
        ))
    return entries
