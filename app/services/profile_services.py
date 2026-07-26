from fastapi import HTTPException,status
from sqlalchemy.orm import Session
from app.models.user import User
from app.schemas.user import UserUpdate
from app.security import hash_password

# get user register data
def get_register_user(current_user: User, db: Session):
    user = db.query(User).filter(User.id == current_user.id).first()

    if user is None:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    return user 

# to update register user data
def get_updated_user(user_data:UserUpdate,current_user:User,db:Session):
    current_user.username = user_data.username
    current_user.email = user_data.email

    if user_data.password:
        current_user.password = hash_password(user_data.password)

    db.commit()
    db.refresh(current_user)

    return current_user