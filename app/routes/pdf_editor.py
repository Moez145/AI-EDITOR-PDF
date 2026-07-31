import os
from app.database import get_db
from app.models.user import User
from fastapi import UploadFile
from fastapi import File
from sqlalchemy.orm import Session
from fastapi.responses import FileResponse
from app.models.pdf import PDF
from app.services.pymupdf_services import get_pdf_data
from app.dependencies import get_current_user
from fastapi import APIRouter, Depends, HTTPException

router=APIRouter(
    prefix='/editor/pdf/{pdf_id}',
    tags=['Edit PDF']
)

@router.get('/text')
def edit_pdf(pdf_id:int,db:Session=Depends(get_db),current_user: User = Depends(get_current_user)):
    pdf_return= db.query(PDF).filter(PDF.id==pdf_id,PDF.user_id==current_user.id).first()
    if not pdf_return:
        raise HTTPException(status_code=404, detail="PDF not found")
    return get_pdf_data(pdf_return.file_path)

