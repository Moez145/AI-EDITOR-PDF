from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.models.pdf import PDF_UNSIGNED
from app.dependencies import get_db
from app.services.pdf_services import upload_pdf_unsigned

router = APIRouter(
    prefix='/profile',
    tags=['unsigned_user']
)


@router.post('/unsigned')
async def unsigned_upload(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are allowed.")

    contents = await file.read()
    pdf_record = upload_pdf_unsigned(contents, file.filename, db)

    return {
        "token": pdf_record.token,
        "filename": pdf_record.filename,
        "page_count": pdf_record.file_pages,
        "file_size": pdf_record.filesize
    }


@router.get('/unsigned/pdf/{token}')
def get_unsigned_pdf(token: str, db: Session = Depends(get_db)):
    pdf = db.query(PDF_UNSIGNED).filter(PDF_UNSIGNED.token == token).first()

    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")

    return FileResponse(
        pdf.file_path,
        media_type="application/pdf",
        headers={
            "X-Page-Count": str(pdf.file_pages),
            "X-Page-Size": str(int(pdf.filesize))
        }
    )