from fastapi import APIRouter,Depends
from sqlalchemy.orm import Session
from app.database import get_db
from fastapi import Request
from fastapi.templating import Jinja2Templates


templates=Jinja2Templates(directory='templates/pages')
router=APIRouter(
    tags=['Free Upload']
)

@router.get('/editor')
def free_get_editor(request:Request):
    return templates.TemplateResponse(
        name='free_editor.html',
        request=request
    )
    
@router.get('/sign_in')
def login(request:Request):
    return templates.TemplateResponse(
        name='sign_in.html',
        request=request
    )

@router.get('/sign_up')
def register(request:Request):
    return templates.TemplateResponse(
        name='sign_up.html',
        request=request
    )