from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Profile
from ..schemas import LoginRequest, TokenResponse, ProfileOut
from ..auth import verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    identifier = body.username.strip().lower()

    user = db.query(Profile).filter(Profile.username == identifier).first()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect username or password")

    if user.is_active is False:
        raise HTTPException(status_code=403, detail="Account is deactivated. Contact your instructor.")

    token = create_access_token({
        "sub": str(user.id),
        "role": user.role,
        "name": user.name,
    })
    return TokenResponse(access_token=token)


@router.get("/me", response_model=ProfileOut)
def me(current_user: Profile = Depends(get_current_user)):
    return current_user
