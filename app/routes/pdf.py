from fastapi import APIRouter
from fastapi import UploadFile
from fastapi import File
from fastapi import Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_user
from app.services.pdf_services import return_upload_pdf
from app.models.user import User
from app.schemas.pdf import PDFResponse
from app.services.pdf_services import upload_pdf,return_count_pdf,return_today_upload

router=APIRouter(
    prefix='/pdf',
    tags=['Uploader']
)

@router.post('/upload',response_model=PDFResponse)
def upload(file:UploadFile=File(...),db:Session=Depends(get_db),current_user:User=Depends(get_current_user)):
     return upload_pdf(file,current_user.id,db)
 
@router.get('/recent',response_model=list[PDFResponse])
def recent(db:Session=Depends(get_db),current_user:User=Depends(get_current_user)):
    return return_upload_pdf(current_user.id,db)

@router.get('/dashboard-stats')
def rect_count(db:Session=Depends(get_db),current_user:User=Depends(get_current_user)):
    return return_count_pdf(current_user.id,db)

@router.get('/today',response_model=list[PDFResponse])
def today(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return return_today_upload(current_user.id, db)