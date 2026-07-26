from pydantic import BaseModel
from datetime import datetime

class PDFResponse(BaseModel):
    id:int
    filename:str
    file_path:str
    upload_time:datetime
    filesize:float
    file_pages:int
    class config:
        from_attributes=True