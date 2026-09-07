from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Profile
from ..auth import require_student
from ..scoring import current_period_key
from ..cosmetics import full_catalog, current_month_points, equip_cosmetic, accent_for, _tiers_for

router = APIRouter(prefix="/cosmetics", tags=["cosmetics"])


class EquipRequest(BaseModel):
    border_color: str | None = None
    avatar_icon: str | None = None


@router.get("/options")
def get_cosmetic_options(db: Session = Depends(get_db), current_user: Profile = Depends(require_student)):
    points = current_month_points(db, current_user.id)
    catalog = full_catalog(points)
    next_tier = next((t for t in _tiers_for(current_period_key()) if t["min_points"] > points), None)
    return {
        "current_month_points": points,
        "colors": catalog["colors"],
        "icons": catalog["icons"],
        "equipped_border_color": current_user.equipped_border_color,
        "equipped_avatar_icon": current_user.equipped_avatar_icon,
        "equipped_accent": accent_for(current_user.equipped_border_color),
        "next_unlock_at": next_tier["min_points"] if next_tier else None,
    }


@router.post("/equip")
def equip(body: EquipRequest, db: Session = Depends(get_db), current_user: Profile = Depends(require_student)):
    try:
        equip_cosmetic(db, current_user, body.border_color, body.avatar_icon)
    except ValueError as e:
        raise HTTPException(400, str(e))
    db.commit()
    return {"equipped_border_color": current_user.equipped_border_color, "equipped_avatar_icon": current_user.equipped_avatar_icon}
