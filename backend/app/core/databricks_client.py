import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import contextmanager
from typing import Any, Iterator

from databricks import sql as databricks_sql

from app.core.config import settings
from app.core.exceptions import ServiceUnavailableError

logger = logging.getLogger("app.databricks")

# Well-known first-party resource ID for Azure Databricks AAD auth (public, not a secret).
_DATABRICKS_AAD_RESOURCE_ID = "2ff814a6-3304-4ab8-85cb-cd0e6f879c1d"

# Cached across requests so bulk querying doesn't request a fresh token every time.
_cached_token: dict[str, Any] = {}


def _get_azure_access_token() -> str:
    cached = _cached_token.get("value")
    expires_at = _cached_token.get("expires_at", 0)
    if cached and expires_at > time.time():
        return cached

    if not (settings.azure_tenant_id and settings.azure_client_id and settings.azure_client_secret):
        raise ServiceUnavailableError(
            "Databricks connection is not configured. Set DATABRICKS_HTTP_PATH plus either "
            "DATABRICKS_ACCESS_TOKEN or AZURE_TENANT_ID/AZURE_CLIENT_ID/AZURE_CLIENT_SECRET."
        )

    body = urllib.parse.urlencode({
        "grant_type": "client_credentials",
        "client_id": settings.azure_client_id,
        "client_secret": settings.azure_client_secret,
        "scope": f"{_DATABRICKS_AAD_RESOURCE_ID}/.default",
    }).encode("utf-8")
    url = f"https://login.microsoftonline.com/{settings.azure_tenant_id}/oauth2/v2.0/token"
    request = urllib.request.Request(url, data=body, headers={"Content-Type": "application/x-www-form-urlencoded"})

    try:
        with urllib.request.urlopen(request) as response:
            payload = json.loads(response.read())
    except urllib.error.URLError as exc:
        logger.error("Failed to acquire Azure AD token for Databricks", exc_info=exc)
        raise ServiceUnavailableError("Unable to authenticate with Databricks.") from exc

    access_token = payload["access_token"]
    expires_in = int(payload.get("expires_in", 3600))
    # Refresh a minute early to avoid using a token that expires mid-request.
    _cached_token["value"] = access_token
    _cached_token["expires_at"] = time.time() + expires_in - 60
    return access_token


def _resolve_access_token() -> str:
    if settings.databricks_access_token:
        return settings.databricks_access_token
    return _get_azure_access_token()


@contextmanager
def get_connection() -> Iterator[Any]:
    hostname = settings.resolved_databricks_hostname
    if not (hostname and settings.databricks_http_path):
        raise ServiceUnavailableError(
            "Databricks connection is not configured. Set DATABRICKS_SERVER_HOSTNAME (or DATABRICKS_HOST) "
            "and DATABRICKS_HTTP_PATH."
        )

    try:
        connection = databricks_sql.connect(
            server_hostname=hostname,
            http_path=settings.databricks_http_path,
            access_token=_resolve_access_token(),
        )
    except ServiceUnavailableError:
        raise
    except Exception as exc:
        logger.error("Failed to connect to Databricks SQL warehouse", exc_info=exc)
        raise ServiceUnavailableError("Unable to reach the Databricks SQL warehouse.") from exc

    try:
        yield connection
    finally:
        connection.close()


def run_query(query: str, parameters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Execute a parameterized SQL query against Databricks and return rows as dicts.

    `query` must use named markers (e.g. ``:case_number``) for any user-supplied value;
    never interpolate user input directly into the SQL text.
    """
    try:
        with get_connection() as connection, connection.cursor() as cursor:
            cursor.execute(query, parameters=parameters or {})
            columns = [col[0] for col in cursor.description or []]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]
    except ServiceUnavailableError:
        raise
    except Exception as exc:
        logger.error("Databricks query failed", exc_info=exc)
        raise ServiceUnavailableError("The analytics data service failed to respond.") from exc
