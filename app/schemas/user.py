from pydantic import BaseModel,EmailStr

class UserCreate(BaseModel):
    username:str
    email:EmailStr
    password:str
    
class UserLogin(BaseModel):
    password:str
    email:EmailStr
    
class UserResponse(BaseModel):
    id:int
    username:str    
    email:EmailStr
    
    class config:
        from_attributes=True

class UserUpdate(BaseModel):
    username:str
    email:EmailStr
    password:str