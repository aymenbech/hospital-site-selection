from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api import projects
from app.routers.datasets_profiling import router as datasets_profiling_router
from app.routers.analysis import router as analysis_router
from app.routers.ahp import router as ahp_router
from app.routers.wam import router as wam_router
from app.routers.decision_makers import router as decision_makers_router

app = FastAPI(title=settings.app_name, version=settings.app_version)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(datasets_profiling_router, prefix="/api/datasets", tags=["datasets-profiling"])
app.include_router(analysis_router, tags=["analysis"])
app.include_router(ahp_router, tags=["ahp"])
app.include_router(wam_router, tags=["wam"])
app.include_router(decision_makers_router, prefix="/api/decision-makers", tags=["decision-makers"])


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"message": "Hospital Site Selection API"}
