from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging
from app.insights.rbac import initialize_sqlite
from app.reports.workflow import initialize_workflow
from app.router import api_router

from starlette.middleware.gzip import GZipMiddleware

configure_logging(settings.log_level)
logger = logging.getLogger("app.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_sqlite(settings.report_workflow_db_path)
    initialize_workflow(settings.report_workflow_db_path)
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Backend API",
    lifespan=lifespan,
)

app.add_middleware(
    GZipMiddleware,
    minimum_size=1000
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)
app.include_router(api_router)
