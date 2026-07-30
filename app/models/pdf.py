from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Float
from sqlalchemy.sql import func
from app.database import Base


class PDF(Base):
    __tablename__ = "pdf_files"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(255), nullable=False)
    filesize = Column(Float)
    file_pages = Column(Integer, nullable=True)
    upload_time = Column(DateTime(timezone=True), server_default=func.now())
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)


class PDF_UNSIGNED(Base):
    __tablename__ = 'pdf_files_unsigned'

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(64), unique=True, index=True, nullable=False)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(255), nullable=False)
    filesize = Column(Float)
    file_pages = Column(Integer, nullable=True)
    upload_time = Column(DateTime(timezone=True), server_default=func.now())