from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.user import UserCreate, UserLogin, UserResponse
from app.schemas.token import Token
from app.services.auth_services import register_user, login_user

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)

@router.post("/register",response_model=UserResponse,status_code=201)
def register(user: UserCreate,db: Session = Depends(get_db)):
    return register_user(user, db)


@router.post("/login",response_model=Token)
def login(user: UserLogin,db: Session = Depends(get_db)):
    return login_user(user, db)


@router.get("/me",response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user