class HealthService:
    async def check(self) -> dict:
        return {"status": "Up and running."}
