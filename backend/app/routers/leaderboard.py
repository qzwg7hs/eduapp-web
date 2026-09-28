from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Profile, MonthlyScore
from ..schemas import LeaderboardEntry, MonthlyLeaderboardOut
from ..auth import get_current_user
from ..scoring import current_period_key, period_label

router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])


def _rank_entries(students: list[tuple[Profile, int]]) -> list[LeaderboardEntry]:
    """Standard competition ranking ("1224"): students tied on points share
    the same rank, and the next distinct score's rank skips ahead by however
    many students tied for the rank before it (1, 2, =3, =3, =3, 6 — not 4)."""
    entries = []
    rank = 0
    for i, (s, pts) in enumerate(students):
        if i == 0 or pts != students[i - 1][1]:
            rank = i + 1
        entries.append(LeaderboardEntry(
            rank=rank, name=s.name, surname=s.surname, unique_id=s.unique_id, points=pts,
            equipped_border_color=s.equipped_border_color, equipped_avatar_icon=s.equipped_avatar_icon,
        ))
    return entries


@router.get("", response_model=list[LeaderboardEntry])
def get_leaderboard(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """All-time leaderboard, ranked by each student's lifetime total points
    (Profile.points — never resets)."""
    students = (
        db.query(Profile)
        .filter(Profile.role == "student", Profile.is_active == True)
        .order_by(Profile.points.desc())
        .all()
    )
    return _rank_entries([(s, s.points) for s in students])


@router.get("/monthly", response_model=MonthlyLeaderboardOut)
def get_monthly_leaderboard(language: str = "kz", db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    """Current-period leaderboard, ranked by MonthlyScore.points for the
    active period only — a separate ledger from the all-time total (see
    app/scoring.py). A student with no activity yet this period simply has
    no MonthlyScore row, which reads as 0 here rather than needing one."""
    period = current_period_key()

    rows = (
        db.query(Profile, MonthlyScore.points)
        .join(MonthlyScore, (MonthlyScore.student_id == Profile.id) & (MonthlyScore.period_key == period))
        .filter(Profile.role == "student", Profile.is_active == True, MonthlyScore.points > 0)
        .order_by(MonthlyScore.points.desc())
        .all()
    )
    entries = _rank_entries([(s, pts) for s, pts in rows])

    my_score = db.query(MonthlyScore).filter(
        MonthlyScore.student_id == current_user.id, MonthlyScore.period_key == period,
    ).first()

    return MonthlyLeaderboardOut(
        period_key=period,
        period_label=period_label(period, language),
        entries=entries,
        my_points=my_score.points if my_score else 0,
    )
