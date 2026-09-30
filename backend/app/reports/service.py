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
from app.core.ai_gateway_client import LocalOpenAIClient, build_client
from app.core.config import settings
from app.core.exceptions import BadRequestError, ServiceUnavailableError
from app.reports.schemas import ReportFact, ReportSection, SnapshotReportDraft, SnapshotReportRequest
from app.reports import workflow

REPORT_DISCLAIMERS = [
    "SYSTEM_GENERATED_DRAFT: not a validated finding; requires human review before distribution.",
    "Limited to the weekly snapshot CSV extract; no event-history, SLA/PG, or recurrence-validation source.",
    "Does not claim validated root cause, action completion, outcome, financial benefit, or SLA/PG compliance.",
]

LOCAL_TEST_DISCLAIMER = (
    "LOCAL_TEST_ONLY: generated through a developer-configured external model endpoint; "
    "do not distribute or use as a production artifact."
)

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
    "sections that cite only exact fact_id values present in the package. Never invent numbers, cases, "
    "causes, or outcomes absent from the facts. Never state validated root cause, action completion, "
    "confirmed outcome, financial benefit, or SLA/PG compliance. Always write as a system-generated "
    "draft that requires human review. Return JSON only: {\"sections\": [{\"heading\": str, \"body\": str, "
    "\"fact_ids\": [str]}]}."
)


def _resolve_fact_id(fact_id: Any, allowed_fact_ids: set[str]) -> str:
    """Accept an exact fact ID, or a uniquely resolvable final segment only.

    Models sometimes shorten ``summary.source_coverage_note`` to
    ``source_coverage_note``.  This narrow compatibility path retains evidence
    safety: an alias resolves only when exactly one supplied fact ends with that
    segment.  Any ambiguous or unknown value remains an error.
    """
    if not isinstance(fact_id, str):
        raise BadRequestError("AI gateway cited a non-string fact_id.")
    if fact_id in allowed_fact_ids:
        return fact_id
    matches = [candidate for candidate in allowed_fact_ids if candidate.rsplit(".", 1)[-1] == fact_id]
    if len(matches) == 1:
        return matches[0]
    raise BadRequestError(f"AI gateway cited an unknown fact_id: {fact_id}")


def _build_fact_package(
    as_of_week: date | None, client_account: str | None, category: str | None,
) -> tuple[date, list[ReportFact]]:
    summary_body = analytics_service.get_summary(as_of_week, client_account, None, None)
    resolved_week = date.fromisoformat(summary_body["as_of_week"])
    facts: list[ReportFact] = [
        ReportFact(fact_id=f"summary.{key}", label=key, value=str(value))
        for key, value in summary_body["data"].items()
    ]

    # The Operations endpoints are complete-filter-universe aggregates, unlike
    # paginated list endpoints.  They deliberately contain no case IDs or narratives.
    operation_filters = {"client_account": client_account, "category": category}
    for operation in ("workload", "date_risk", "durations", "documentation"):
        operation_body = analytics_service.get_operation_summary(operation, resolved_week, operation_filters)
        for key, value in operation_body["data"].items():
            facts.append(
                ReportFact(
                    fact_id=f"operations.{operation}.{key}",
                    label=f"{operation}: {key}",
                    value=json.dumps(value, default=str, sort_keys=True),
                )
            )

    # Data-quality coverage is calculated across the published case snapshot and
    # has no client/category dimensions.  Retain it as a clearly scoped global
    # coverage fact rather than incorrectly applying request filters it cannot honor.
    quality_body = analytics_service.get_operation_summary("data_quality", resolved_week, {})
    for key, value in quality_body["data"].items():
        facts.append(
            ReportFact(
                fact_id=f"operations.data_quality.{key}",
                label=f"data_quality (published snapshot scope): {key}",
                value=json.dumps(value, default=str, sort_keys=True),
            )
        )

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
        section["fact_ids"] = [_resolve_fact_id(fact_id, allowed_fact_ids) for fact_id in fact_ids]
        combined_text = f"{section.get('heading', '')} {section.get('body', '')}"
        for pattern in FORBIDDEN_CLAIM_PATTERNS:
            if re.search(pattern, combined_text, flags=re.IGNORECASE):
                raise BadRequestError(f"AI gateway response contained a disallowed claim: {pattern}")

    return raw


def generate_snapshot_report_draft(request: SnapshotReportRequest) -> SnapshotReportDraft:
    if request.evidence_authorized:
        # There is no authenticated role dependency in this local development build.
        # Reject caller-declared authorization rather than treating a UI toggle as proof.
        raise BadRequestError("Case-level evidence is unavailable until authenticated authorization is implemented.")

    client = build_client()
    if client is None:
        raise ServiceUnavailableError(
            "AI gateway is not configured. Configure the approved AI gateway, or enable the explicit local test "
            "path with REPORT_LOCAL_TEST_ENABLED plus OPENAI_API_KEY."
        )

    resolved_week, facts = _build_fact_package(request.as_of_week, request.client_account, request.category)
    allowed_fact_ids = {fact.fact_id for fact in facts}

    user_payload = {
        "as_of_week": resolved_week.isoformat(),
        "evidence_authorized": False,
        "facts": [fact.model_dump() for fact in facts],
        "instructions": [
            "Cite only fact_id values present in the facts array.",
            "Do not include case numbers or static narrative unless evidence_authorized is true.",
            "Every section must include at least one fact_id.",
            "Do not state validated root cause, completion, outcome, financial benefit, or SLA/PG compliance.",
        ],
    }

    if isinstance(client, LocalOpenAIClient):
        content = client.generate_json(
            _SYSTEM_PROMPT,
            json.dumps(user_payload, ensure_ascii=True),
        )
    else:
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
        generated_by_model=settings.openai_model if settings.report_local_test_enabled else settings.aoai_deployment,
        sections=[ReportSection(**section) for section in validated["sections"]],
        facts=facts,
        disclaimers=REPORT_DISCLAIMERS + ([LOCAL_TEST_DISCLAIMER] if settings.report_local_test_enabled else []),
    )


def create_review_report(request: SnapshotReportRequest) -> dict[str, Any]:
    """Generate an aggregate-only draft and persist it as reviewable candidates."""
    draft = generate_snapshot_report_draft(request)
    return workflow.create_report(settings.report_workflow_db_path, draft, request.client_account, request.category)
