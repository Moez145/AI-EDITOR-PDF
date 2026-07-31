import os
import shutil
from fastapi import UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session
from datetime import date
from app.dependencies import get_current_user
from app.models.pdf import PDF
import uuid
from pypdf import PdfReader
import secrets
from app.models.pdf import PDF_UNSIGNED
import fitz

UPLOAD_FOLDER="uploads/original"
UPLOAD_FOLDER_UNSIGNED='uploads/unsigned_pdf'

def upload_pdf(file:UploadFile,user_id:int,db:Session):

    file_location=os.path.join(UPLOAD_FOLDER,file.filename)
    
    with open(file_location,"wb") as buffer:
        shutil.copyfileobj(file.file,buffer)
    
    file_size=round(os.path.getsize(file_location)/1024,2)
    doc=fitz.open(file_location)
    file_pages=len(doc)
    doc.close()
    
    pdf=PDF(
        filename=file.filename,
        file_path=file_location,
        user_id=user_id,
        filesize=file_size,
        file_pages=file_pages)
    
    db.add(pdf)
    db.commit()
    db.refresh(pdf)
    return pdf

def upload_pdf_unsigned(file_bytes: bytes, original_filename: str, db: Session) -> PDF_UNSIGNED:
    unique_name = f"{uuid.uuid4().hex}.pdf"
    file_path = os.path.join(UPLOAD_FOLDER_UNSIGNED, unique_name)

    with open(file_path, "wb") as f:
        f.write(file_bytes)

    reader = PdfReader(file_path)
    page_count = len(reader.pages)
    file_size = os.path.getsize(file_path)

    pdf_record = PDF_UNSIGNED(
        token=secrets.token_urlsafe(32),   # unguessable, URL-safe
        filename=original_filename,
        file_path=file_path,
        filesize=file_size,
        file_pages=page_count
    )
    db.add(pdf_record)
    db.commit()
    db.refresh(pdf_record)

    return pdf_record
    

def return_upload_pdf(user_id:int,db:Session):
    find_all_user_upload=db.query(PDF).filter(PDF.user_id==user_id).order_by(PDF.upload_time.desc()).all()
    return find_all_user_upload

def return_count_pdf(user_id:int,db:Session):
    total_documents=db.query(PDF).filter(PDF.user_id==user_id).count()
    total_size=db.query(func.sum(PDF.filesize)).filter(PDF.user_id==user_id).scalar()
    
    if total_size is None:
        total_size=0
    else:
        total_size = round(total_size, 2)
    return{
        'total_doc':total_documents,
        'total_size':total_size 
    }
def return_today_upload(user_id:int,db:Session):
    find_user_upload=db.query(PDF).filter(PDF.user_id==user_id,func.date(PDF.upload_time)==date.today()).order_by(PDF.upload_time.desc()).limit(5).all()
    return find_user_upload