from sqlalchemy.orm import Session
from app.services.pymupdf_services import get_pdf_data
from fastapi import APIRouter,Depends,File,UploadFile,HTTPException
from app.models.pdf import PDF
from app.schemas.pdf import PDFResponse
from app.database import get_db
from app.models.user import User
from app.dependencies import get_current_user
from fastapi.responses import FileResponse

router=APIRouter(
    prefix='/editor',
    tags=['editor']
)
@router.get("/pdf/{pdf_id}")
def get_pdf(pdf_id: int,db: Session = Depends(get_db),current_user: User = Depends(get_current_user)):
    pdf = db.query(PDF).filter(PDF.id == pdf_id,PDF.user_id == current_user.id).first()
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")

    return FileResponse(
        pdf.file_path,
        media_type="application/pdf"
    )
    
