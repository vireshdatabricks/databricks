from fastapi import APIRouter

from app.core.config import settings
from app.health.router import router as health_router

api_router = APIRouter(prefix=f"{settings.base_path}{settings.api_prefix}")

api_router.include_router(health_router, prefix="/health", tags=["Health"])