from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Application
    app_name: str = "Case Insight"
    app_version: str = "1.0.0"
    environment: str = "development"
    log_level: str = "INFO"

    # CORS
    cors_origins: list[str] = ["*"]

    # API routing
    api_prefix: str = "/api"
    base_path: str = ""

    # Analytics response envelope
    logic_version: str = "phase1-v1"
    data_quality_status: str = "LIMITED_TO_SNAPSHOT_CSV"

    # Databricks SQL warehouse connection (see README for how to obtain these)
    # DATABRICKS_HOST / AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET match the
    # servicenow-extract script's names so the same Azure AD app registration can be reused.
    databricks_server_hostname: str = ""
    databricks_host: str = ""
    databricks_http_path: str = ""
    databricks_access_token: str = ""
    databricks_catalog: str = "trend_analysis"
    databricks_schema: str = "trend_default"
    azure_tenant_id: str = ""
    azure_client_id: str = ""
    azure_client_secret: str = ""

    @property
    def resolved_databricks_hostname(self) -> str:
        """Bare hostname for the SQL connector, derived from DATABRICKS_SERVER_HOSTNAME or DATABRICKS_HOST."""
        host = self.databricks_server_hostname or self.databricks_host
        return host.removeprefix("https://").removeprefix("http://").rstrip("/")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
