import os
from pypdf import PdfReader
from app.models.pdf import PDF
from app.database import get_db
from app.models.user import User
from sqlalchemy.orm import Session
from fastapi.responses import FileResponse
from app.dependencies import get_current_user
from fastapi import APIRouter, Depends, HTTPException

router = APIRouter(
    prefix='/editor',
    tags=['editor']
)


@router.get("/pdf/{pdf_id}")
def get_pdf(
    pdf_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    pdf = db.query(PDF).filter(
        PDF.id == pdf_id,
        PDF.user_id == current_user.id
    ).first()

    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")

    reader = PdfReader(pdf.file_path)
    page_count = len(reader.pages)
    page_size = os.path.getsize(pdf.file_path)

    return FileResponse(
        pdf.file_path,
        media_type="application/pdf",
        headers={
            "X-Page-Count": str(page_count),
            "X-Page-Size": str(page_size)
        }
    )