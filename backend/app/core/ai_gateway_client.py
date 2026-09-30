"""OpenAI-compatible AI gateway client for backend-generated report drafts.

Mirrors the UHG gateway / Azure OpenAI client pattern from the intake-agent POC so the same
onboarded gateway credentials (AI_LIVE_ENABLED, AOAI_*, UHG_*) can be reused here unchanged.
Only this backend module talks to the gateway; the browser and Databricks are never exposed
to it, and this module never receives attachment binaries or raw case narrative text.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx
from openai import AzureOpenAI, OpenAI

from app.core.config import settings

logger = logging.getLogger(__name__)
_LOGGED = False


def _log_once(message: str, *, warning: bool = False) -> None:
    global _LOGGED
    if not _LOGGED:
        (logger.warning if warning else logger.info)(message)
        _LOGGED = True


def _request_uhg_access_token() -> str:
    body = {
        "grant_type": "client_credentials",
        "scope": settings.uhg_scope,
        "client_id": settings.uhg_client_id,
        "client_secret": settings.uhg_client_secret,
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    with httpx.Client(timeout=60.0) as http_client:
        response = http_client.post(settings.uhg_auth_url, headers=headers, data=body)
        response.raise_for_status()
        return response.json()["access_token"]


def _build_uhg_gateway_client() -> AzureOpenAI | None:
    gateway_endpoint = settings.uhg_gateway_endpoint or settings.aoai_endpoint
    if not gateway_endpoint:
        _log_once("ai_gateway_client mode: FALLBACK (no UHG_GATEWAY_ENDPOINT or AOAI_ENDPOINT set)", warning=True)
        return None
    access_token = _request_uhg_access_token()
    _log_once("ai_gateway_client mode: LIVE (UHG gateway)")
    return AzureOpenAI(
        azure_endpoint=gateway_endpoint,
        api_version=settings.aoai_api_version,
        azure_deployment=settings.aoai_deployment,
        azure_ad_token=access_token,
        default_headers={"projectId": settings.uhg_project_id} if settings.uhg_project_id else None,
    )


def _build_direct_aoai_client() -> AzureOpenAI | None:
    if not settings.aoai_endpoint or not settings.azure_openai_api_key:
        _log_once("ai_gateway_client mode: FALLBACK (direct AOAI requires AOAI_ENDPOINT and AZURE_OPENAI_API_KEY)", warning=True)
        return None
    _log_once("ai_gateway_client mode: LIVE (direct Azure OpenAI)")
    return AzureOpenAI(
        api_key=settings.azure_openai_api_key,
        azure_endpoint=settings.aoai_endpoint,
        api_version=settings.aoai_api_version,
        azure_deployment=settings.aoai_deployment,
    )


@dataclass(frozen=True)
class LocalOpenAIClient:
    """Direct OpenAI client used only for explicit local report draft testing."""

    api_key: str
    model: str

    def generate_json(self, system_prompt: str, user_payload: str) -> str:
        client = OpenAI(api_key=self.api_key, timeout=60.0)
        response = client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_payload},
            ],
            response_format={"type": "json_object"},
        )
        return response.choices[0].message.content or "{}"


def _build_local_openai_client() -> LocalOpenAIClient | None:
    if not settings.openai_api_key:
        _log_once("ai_gateway_client mode: FALLBACK (local report testing requires OPENAI_API_KEY)", warning=True)
        return None
    _log_once(f"ai_gateway_client mode: LOCAL_TEST (OpenAI {settings.openai_model})")
    return LocalOpenAIClient(api_key=settings.openai_api_key, model=settings.openai_model)


def build_client() -> AzureOpenAI | LocalOpenAIClient | None:
    """Return a configured gateway client, or None when the gateway is disabled/unconfigured."""
    if settings.report_local_test_enabled:
        return _build_local_openai_client()
    if not settings.ai_live_enabled:
        _log_once("ai_gateway_client mode: FALLBACK (AI_LIVE_ENABLED=false)")
        return None
    if not settings.aoai_deployment or not settings.aoai_api_version:
        _log_once("ai_gateway_client mode: FALLBACK (missing AOAI_DEPLOYMENT or AOAI_API_VERSION)", warning=True)
        return None
    if settings.uhg_auth_url and settings.uhg_client_id and settings.uhg_client_secret and settings.uhg_scope:
        return _build_uhg_gateway_client()
    return _build_direct_aoai_client()
