from datetime import datetime,timedelta,timezone
from jose import jwt,JWTError
from passlib.context import CryptContext
from fastapi import HTTPException,status
from fastapi.security import OAuth2PasswordBearer

#JWT CONFIGURATION

secret_key="change_This_to a long_random_string"
algorithm='HS256'
access_Token_expire_minutes=20

# HASHING

pwd_context=CryptContext(schemes=['bcrypt'],deprecated='auto')

# OAuth

oauth2_scheme=OAuth2PasswordBearer(tokenUrl='/auth/login')

# Convert enter password by user to hashed password

def hash_password(password:str)->str:
    return pwd_context.hash(password)

# Now Verify Password

def verify_password(plain_password:str,hashed_password:str)->bool:
    return pwd_context.verify(plain_password,hashed_password)

# create token

def create_access_token(data:dict):
    to_encode=data.copy()
    expire=datetime.now(timezone.utc)+timedelta(minutes=access_Token_expire_minutes)
    to_encode.update({'exp':expire})
    encoded_jwt=jwt.encode(to_encode,secret_key,algorithm=algorithm)
    return encoded_jwt

# verify access token

def verify_access_token(token: str):
    try:
        payload = jwt.decode(
            token,
            secret_key,
            algorithms=[algorithm]
        )

        print(payload)

        email = payload.get("sub")

        if email is None:
            raise HTTPException(
                status_code=401,
                detail="Invalid token"
            )

        return email

    except JWTError as e:
        print(e)
        raise HTTPException(
            status_code=401,
            detail="Could Not Find Valid Credentials."
        )