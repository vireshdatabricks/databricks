from fastapi import APIRouter, status

from app.health.service import HealthService

router = APIRouter()


@router.get("", status_code=status.HTTP_200_OK)
async def health():
    service = HealthService()
    return await service.check()
