from fastapi import HTTPException,status
from sqlalchemy.orm import Session
from app.models.user import User
from app.schemas.pdf import PDFResponse
from app.schemas.user import UserLogin,UserCreate,UserResponse
from app.schemas.token import Token
from app.security import hash_password,verify_password,create_access_token,oauth2_scheme,verify_access_token

def register_user( user:UserCreate,db:Session):
    existing_user=db.query(User).filter(User.email==user.email).first()
    if existing_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,detail='User Already Exist.')
    else:
        hashed_password=hash_password(user.password)
        new_user=User(
            username=user.username,
            email=user.email,
            password=hashed_password
        )
        # Save into Database
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
    return new_user

def login_user(user:UserLogin,db:Session):
    find_user=db.query(User).filter(User.email==user.email).first()
    if not find_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,detail='Invalid_email or Password')
    if not verify_password(user.password,find_user.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,detail='Invalid_email or Password')
    
    access_token=create_access_token(data={'sub':find_user.email})
    return Token(
        access_token=access_token,
        token_type='bearer'
    )
