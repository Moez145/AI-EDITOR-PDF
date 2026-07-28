from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.models.pdf import PDF
from app.models.user import User
from app.database import get_db
from app.dependencies import get_current_user
from app.services.pdf_services import return_count_pdf

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

    page_count = return_count_pdf(current_user.id, db)

    return FileResponse(
        pdf.file_path,
        media_type="application/pdf",
        headers={"X-Page-Count": str(page_count)}
    )