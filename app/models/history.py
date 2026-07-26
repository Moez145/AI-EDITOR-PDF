from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func

from app.database import Base


class ChatHistory(Base):
    __tablename__ = "chat_history"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    pdf_id = Column(Integer, ForeignKey("pdf_files.id"), nullable=False)

    question = Column(Text, nullable=False)

    answer = Column(Text, nullable=False)

    page_number = Column(Integer)

    model_name = Column(String(100))

    created_at = Column(DateTime(timezone=True), server_default=func.now())