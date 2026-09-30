from fastapi import APIRouter

from app.core.config import settings
from app.health.router import router as health_router
from app.analytics.router import router as analytics_router
from app.reports.router import router as reports_router
from app.diagnostics.router import router as diagnostics_router

api_router = APIRouter(prefix=f"{settings.base_path}{settings.api_prefix}")

api_router.include_router(health_router, prefix="/health", tags=["Health"])
api_router.include_router(analytics_router, prefix="/v1/analytics", tags=["Analytics"])
api_router.include_router(reports_router, prefix="/v1/reports", tags=["Reports"])
api_router.include_router(diagnostics_router, prefix="/v1/diagnostics", tags=["Diagnostics"])
