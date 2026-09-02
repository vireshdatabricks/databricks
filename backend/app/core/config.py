from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Application
    app_name: str = "CMS Analytics"
    app_version: str = "1.0.0"
    environment: str = "development"
    log_level: str = "INFO"

    # CORS
    cors_origins: list[str] = ["*"]

    # API routing
    api_prefix: str = "/api"
    base_path: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
