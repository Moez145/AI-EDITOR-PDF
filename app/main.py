from fastapi import FastAPI, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from sqlalchemy import Boolean, Integer, String, create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker
from app.routes.editor import router as eidtor_router
from app.routes.landing_free import router as landing_router
from app.routes.auth import router as auth_router
from app.routes.profile import router as profile_router
from app.models.user import User
from app.routes.editor_route_unsigned import router as edited_route
from app.models.pdf import PDF
from app.models.chat import Chat
from app.routes.pdf import router as pdf_routes
from app.database import Base,engine


app = FastAPI()

Base.metadata.create_all(bind=engine)

# to get static file
app.mount(
    "/static",
    StaticFiles(directory="app/static"),
    name="static"
)

# for the templates in the folder
templates = Jinja2Templates(directory="templates/pages")

#for the landing page
@app.get("/")
def landing_page(request: Request):
    return templates.TemplateResponse(
        name="landing_page.html",
        request= request
    )
    
# for the dashboard page
@app.get('/dashboard')
def dashboard(request:Request):
    return templates.TemplateResponse(
        name='dashboard.html',
        request=request
    )
    
# for the history page
@app.get('/history')
def history(request:Request):
    return templates.TemplateResponse(
        name='history.html',
        request=request
    )

# for the editor page for Login Users
@app.get("/editor/{pdfId}")
def editor(request: Request, pdfId: int):
    return templates.TemplateResponse(
        request=request,
        name="editor.html",
        context={
            "pdfId": pdfId
        }
    )

app.include_router(landing_router)

app.include_router(eidtor_router)
app.include_router(edited_route)

# for authentication of the data
app.include_router(auth_router)

# for upload of the file
app.include_router(pdf_routes)

# for see profile of the user
app.include_router(profile_router)