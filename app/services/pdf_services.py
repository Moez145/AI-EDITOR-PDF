import os
import shutil
from fastapi import UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session
from datetime import date
from app.dependencies import get_current_user
from app.models.pdf import PDF
import fitz

UPLOAD_FOLDER="uploads/original"

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
