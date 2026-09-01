from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Profile
from ..schemas import LeaderboardEntry
from ..auth import get_current_user

router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])


@router.get("", response_model=list[LeaderboardEntry])
def get_leaderboard(db: Session = Depends(get_db), _=Depends(get_current_user)):
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
