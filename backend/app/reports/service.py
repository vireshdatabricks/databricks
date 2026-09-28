"""Snapshot-report draft generation: builds an aggregate-first fact package from the
existing analytics service, sends it to the AI gateway, and deterministically validates
the response before returning it. The model never receives attachment binaries, raw
Databricks access, or case-level narrative unless the caller is evidence-authorized.
"""
from __future__ import annotations

import json
import re
from datetime import date
from typing import Any

from app.analytics import service as analytics_service
from app.core.ai_gateway_client import build_client
from app.core.config import settings
from app.core.exceptions import BadRequestError, ServiceUnavailableError
from app.reports.schemas import ReportFact, ReportSection, SnapshotReportDraft, SnapshotReportRequest

REPORT_DISCLAIMERS = [
    "SYSTEM_GENERATED_DRAFT: not a validated finding; requires human review before distribution.",
    "Limited to the weekly snapshot CSV extract; no event-history, SLA/PG, or recurrence-validation source.",
    "Does not claim validated root cause, action completion, outcome, financial benefit, or SLA/PG compliance.",
]

# Deterministic rejection: any of these phrases in model output fails validation outright.
FORBIDDEN_CLAIM_PATTERNS = [
    r"\bvalidated root cause\b",
    r"\baction (is |was )?complete(d)?\b",
    r"\bconfirmed outcome\b",
    r"\bfinancial (benefit|savings|impact)\b",
    r"\bSLA\b[^.]{0,40}\bcompliant\b",
    r"\bPG\b[^.]{0,40}\bcompliant\b",
    r"\bguarantee(d)?\b",
]

_SYSTEM_PROMPT = (
    "You are a report-drafting assistant for a PBM case-insights snapshot report. "
    "You receive an aggregate-first fact package where every fact has a fact_id. Draft narrative "
    "sections that cite only fact_id values present in the package. Never invent numbers, cases, "
    "causes, or outcomes absent from the facts. Never state validated root cause, action completion, "
    "confirmed outcome, financial benefit, or SLA/PG compliance. Always write as a system-generated "
    "draft that requires human review. Return JSON only: {\"sections\": [{\"heading\": str, \"body\": str, "
    "\"fact_ids\": [str]}]}."
)


def _build_fact_package(
    as_of_week: date | None, client_account: str | None, category: str | None,
) -> tuple[date, list[ReportFact]]:
    summary_body = analytics_service.get_summary(as_of_week, client_account, None, None)
    resolved_week = date.fromisoformat(summary_body["as_of_week"])
    facts: list[ReportFact] = [
        ReportFact(fact_id=f"summary.{key}", label=key, value=str(value))
        for key, value in summary_body["data"].items()
    ]

    trends_body = analytics_service.list_case_trends(resolved_week, client_account, category, None, None, None, 50, None)
    facts.extend(
        ReportFact(fact_id=f"case_trend.{index}", label=f"{row.get('report_month')} case trend", value=json.dumps(row))
        for index, row in enumerate(trends_body["data"])
    )

    themes_body = analytics_service.list_themes(resolved_week, category, None, None, 20, None)
    facts.extend(
        ReportFact(fact_id=f"theme.{index}", label=row.get("theme_label", ""), value=json.dumps(row))
        for index, row in enumerate(themes_body["data"])
    )

    return resolved_week, facts


def _validate_draft(raw: dict[str, Any], allowed_fact_ids: set[str]) -> dict[str, Any]:
    sections = raw.get("sections")
    if not isinstance(sections, list) or not sections:
        raise BadRequestError("AI gateway response was missing a non-empty 'sections' array.")

    for section in sections:
        fact_ids = section.get("fact_ids") or []
        if not fact_ids:
            raise BadRequestError("AI gateway response contained a section with no cited fact_ids.")
        for fact_id in fact_ids:
            if fact_id not in allowed_fact_ids:
                raise BadRequestError(f"AI gateway cited an unknown fact_id: {fact_id}")
        combined_text = f"{section.get('heading', '')} {section.get('body', '')}"
        for pattern in FORBIDDEN_CLAIM_PATTERNS:
            if re.search(pattern, combined_text, flags=re.IGNORECASE):
                raise BadRequestError(f"AI gateway response contained a disallowed claim: {pattern}")

    return raw


def generate_snapshot_report_draft(request: SnapshotReportRequest) -> SnapshotReportDraft:
    client = build_client()
    if client is None:
        raise ServiceUnavailableError(
            "AI gateway is not configured. Set AI_LIVE_ENABLED plus AOAI_*/UHG_* credentials in backend/.env."
        )

    resolved_week, facts = _build_fact_package(request.as_of_week, request.client_account, request.category)
    allowed_fact_ids = {fact.fact_id for fact in facts}

    user_payload = {
        "as_of_week": resolved_week.isoformat(),
        "evidence_authorized": request.evidence_authorized,
        "facts": [fact.model_dump() for fact in facts],
        "instructions": [
            "Cite only fact_id values present in the facts array.",
            "Do not include case numbers or static narrative unless evidence_authorized is true.",
            "Every section must include at least one fact_id.",
            "Do not state validated root cause, completion, outcome, financial benefit, or SLA/PG compliance.",
        ],
    }

    response = client.chat.completions.create(
        model=settings.aoai_deployment,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(user_payload, ensure_ascii=True)},
        ],
        response_format={"type": "json_object"},
        temperature=0,
        timeout=60,
    )

    content = response.choices[0].message.content or "{}"
    raw = json.loads(content)
    validated = _validate_draft(raw, allowed_fact_ids)

    return SnapshotReportDraft(
        status="SYSTEM_GENERATED_DRAFT",
        as_of_week=resolved_week,
        logic_version=settings.logic_version,
        generated_by_model=settings.aoai_deployment,
        sections=[ReportSection(**section) for section in validated["sections"]],
        facts=facts,
        disclaimers=REPORT_DISCLAIMERS,
    )
