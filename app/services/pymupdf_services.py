from app.models.pdf import PDF
from app.schemas.pdf import PDFResponse
from sqlalchemy.orm import Session
import fitz

def get_pdf_data(file_path):
    doc = fitz.open(file_path)
    pages = []
    for page in doc:
        pages.append({
            "page": page.number,
            "text": page.get_text()
        })
    doc.close()
    return pages