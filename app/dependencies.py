from fastapi import Depends,HTTPException,status
from app.models.user import User
from sqlalchemy.orm import Session
from app.security import hash_password,verify_password,create_access_token,oauth2_scheme,verify_access_token
from app.database import get_db

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    print("TOKEN:", token)

    email = verify_access_token(token)
    print("EMAIL:", email)

    user = db.query(User).filter(User.email == email).first()
    print("USER:", user)

    if user is None:
        raise HTTPException(
            status_code=404,
            detail="User Not Found"
        )
        
    return user

