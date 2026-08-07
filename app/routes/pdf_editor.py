import os
from app.database import get_db
from app.models.user import User
from sqlalchemy.orm import Session
from app.models.pdf import PDF
from app.services.pymupdf_services import get_pdf_data, update_pdf_text
from app.dependencies import get_current_user
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

router = APIRouter(
    prefix='/editor/pdf/{pdf_id}',
    tags=['Edit PDF']
)

class SpanEdit(BaseModel):
    text: str
    bbox: list[float]
    font: str
    size: float
    color: int
    flags: int

class PageEdit(BaseModel):
    page: int
    spans: list[SpanEdit]

class TextUpdatePayload(BaseModel):
    pages: list[PageEdit]
    
def _get_owned_pdf(pdf_id: int, db: Session, current_user: User) -> PDF:
    pdf_return = db.query(PDF).filter(PDF.id == pdf_id, PDF.user_id == current_user.id).first()
    if not pdf_return:
        raise HTTPException(status_code=404, detail="PDF not found")
    return pdf_return

@router.get('/text')
def get_pdf_text(pdf_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    pdf_return = _get_owned_pdf(pdf_id, db, current_user)
    return get_pdf_data(pdf_return.file_path)

@router.put('/text')
def save_pdf_text(pdf_id: int, payload: TextUpdatePayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    pdf_return = _get_owned_pdf(pdf_id, db, current_user)
    update_pdf_text(pdf_return.file_path, [p.model_dump() for p in payload.pages])
    return {"status": "saved"}