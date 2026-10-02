from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
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
    # Serve only extract weeks whose latest gold_publication_registry attempt is READY.
    # Disable only against a workspace that predates the registry table.
    publication_gate_enabled: bool = True

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

    # AI gateway (OpenAI-compatible) for snapshot-report draft generation. Field names match
    # the intake-agent POC's .env so the same onboarded gateway credentials can be reused as-is.
    # ai_live_enabled gates all outbound calls; leave false until gateway access is approved.
    ai_live_enabled: bool = False
    aoai_endpoint: str = ""
    aoai_deployment: str = ""
    aoai_api_version: str = ""
    azure_openai_api_key: str = ""
    uhg_auth_url: str = ""
    uhg_scope: str = ""
    uhg_client_id: str = ""
    uhg_client_secret: str = ""
    uhg_project_id: str = ""
    uhg_gateway_endpoint: str = ""

    # Local-only report drafting through the direct OpenAI API. This separate,
    # explicit switch prevents a developer API key from changing shared behavior.
    report_local_test_enabled: bool = False
    openai_api_key: str = Field(default="", validation_alias=AliasChoices("OPENAI_API_KEY", "OPENAPI_KEYS"))
    openai_model: str = "gpt-5-nano"
    # Local review/audit store. Production must replace this with an owned database
    # and authenticated identity mapping before treating reviewer identities as verified.
    report_workflow_db_path: Path = Path("data/report_workflow.sqlite3")

    # Notebook 07 report request orchestration. Leave the job ID empty until WP0
    # creates the dedicated job and grants this service principal Can Manage Run.
    report_run_job_id: str = ""
    report_run_model_allowlist: list[str] = ["databricks-gpt-oss-20b"]
    report_run_poll_seconds: int = 15


    @property
    def resolved_databricks_hostname(self) -> str:
        """Bare hostname for the SQL connector, derived from DATABRICKS_SERVER_HOSTNAME or DATABRICKS_HOST."""
        host = self.databricks_server_hostname or self.databricks_host
        return host.removeprefix("https://").removeprefix("http://").rstrip("/")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
