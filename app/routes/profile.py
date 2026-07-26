from pydantic import BaseModel
from fastapi import APIRouter,Depends,Request
from sqlalchemy.orm import Session
from app.models.user import User
from app.schemas.user import UserResponse,UserUpdate
from app.dependencies import get_current_user
from app.database import get_db
from app.services.auth_services import register_user
from app.services.profile_services import get_register_user,get_updated_user
from fastapi.templating import Jinja2Templates

templates=Jinja2Templates(directory='templates/pages')

router=APIRouter(prefix='/profile',tags=['profile'])
@router.get("/")
def profile_page(request: Request):
    return templates.TemplateResponse(
        name="profile.html",
        request=request
    )
    
@router.get("/me", response_model=UserResponse)
def get_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return get_register_user(current_user, db)


@router.post('/me',response_model=UserResponse)
def updated_data(user_data:UserUpdate,current_user:User=Depends(get_current_user),db:Session=Depends(get_db)):
    return get_updated_user(user_data,current_user,db)