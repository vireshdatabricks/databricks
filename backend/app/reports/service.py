"""Snapshot-report draft generation: builds an aggregate-first fact package from the
existing analytics service, sends it to the AI gateway, and deterministically validates
the response before returning it. The model never receives attachment binaries, raw
Databricks access, or case-level narrative unless the caller is evidence-authorized.
"""
from __future__ import annotations

import json
from datetime import date
from typing import Any

from app.analytics import service as analytics_service
from app.core.config import settings
from app.core.exceptions import BadRequestError
from app.reports.schemas import ReportFact, ReportSection, SnapshotReportDraft, SnapshotReportRequest
from app.reports import workflow

REPORT_DISCLAIMERS = [
    "Draft for human review. Reviewer validation is required before distribution.",
    "Limited to the selected weekly snapshot. Event history, SLA and performance-guarantee sources, and recurrence validation are unavailable.",
    "This briefing does not establish root cause, completed action, outcome, financial benefit, or contractual compliance.",
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
    "sections that cite only exact fact_id values present in the package. Never invent numbers, cases, "
    "causes, or outcomes absent from the facts. Never state validated root cause, action completion, "
    "confirmed outcome, financial benefit, or SLA/PG compliance. Always write as a system-generated "
    "draft that requires human review. Write each body as short paragraphs separated by blank lines; use simple "
    "hyphen-led lines only for a genuine list. Return JSON only: {\"sections\": [{\"heading\": str, \"body\": str, "
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

    return resolved_week, facts


def _fact_value(facts: dict[str, ReportFact], fact_id: str, default: str = "not available") -> str:
    fact = facts.get(fact_id)
    return fact.value if fact else default


def _int_value(value: str) -> int | None:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _top_label(value: str) -> tuple[str, int] | None:
    try:
        rows = json.loads(value)
    except json.JSONDecodeError:
        return None
    if not isinstance(rows, list) or not rows or not isinstance(rows[0], dict):
        return None
    label = rows[0].get("label")
    if not label:
        return None
    return str(label), _int_value(str(rows[0].get("count"))) or 0


def _distribution_sentence(value: str) -> str:
    """Render aggregate label/count arrays without leaking serialized JSON."""
    try:
        rows = json.loads(value)
    except json.JSONDecodeError:
        return "not available"
    if not isinstance(rows, list):
        return "not available"
    entries = [
        f"{_int_value(str(row.get('count'))) or 0:,} {str(row.get('label') or 'unknown').replace('_', ' ')}"
        for row in rows if isinstance(row, dict)
    ]
    return "; ".join(entries) if entries else "not available"


def _deterministic_sections(resolved_week: date, facts: list[ReportFact]) -> list[ReportSection]:
    """Build a factual briefing without relying on generic model prose.

    Snapshot aggregates can support review priorities, not causal or contractual
    findings.  This controlled template keeps those boundaries visible.
    """
    values = {fact.fact_id: fact for fact in facts}
    total_cases = _fact_value(values, "summary.total_case_count")
    open_cases = _fact_value(values, "summary.open_case_count")
    closed_cases = _fact_value(values, "summary.closed_case_count")
    total_tasks = _fact_value(values, "summary.total_task_count")
    open_tasks = _fact_value(values, "summary.open_task_count")
    overdue_cases = _fact_value(values, "operations.date_risk.overdue_case_count")
    usable_risk_dates = _fact_value(values, "operations.date_risk.usable_risk_date_count")
    oldest_age = _fact_value(values, "operations.workload.oldest_age_calendar_days")
    documentation = _distribution_sentence(_fact_value(values, "operations.documentation.documentation_status_counts", "[]"))
    assignment_fact = "operations.workload.assignment_group_counts"
    assignment_top = _top_label(_fact_value(values, assignment_fact, "[]"))
    assignment_sentence = (
        f"The largest represented assignment group is {assignment_top[0]} with {assignment_top[1]:,} cases."
        if assignment_top else "Assignment-group concentration is not available for this scope."
    )

    return [
        ReportSection(
            heading="Executive snapshot",
            body=(
                f"As of {resolved_week.isoformat()}, this selected snapshot contains {total_cases} cases and {total_tasks} tasks. "
                f"{open_cases} cases and {open_tasks} tasks are open; {closed_cases} cases are closed.\n\n"
                "Use this briefing to focus the next operational review. It is a current-state snapshot, not a measure of trend, contractual performance, or root cause."
            ),
            fact_ids=["summary.total_case_count", "summary.total_task_count", "summary.open_case_count", "summary.open_task_count", "summary.closed_case_count"],
        ),
        ReportSection(
            heading="Priority review 1: open cases with an operational date risk",
            body=(
                f"{overdue_cases} open cases are currently classified as overdue by the available operational date proxy, out of {usable_risk_dates} cases with a usable reference date.\n\n"
                "Review the open-case list and its reference dates first. This is not an SLA or performance-guarantee determination."
            ),
            fact_ids=["operations.date_risk.overdue_case_count", "operations.date_risk.usable_risk_date_count", "operations.date_risk.open_case_count"],
        ),
        ReportSection(
            heading="Priority review 2: workload ownership and age",
            body=(
                f"The oldest valid open-case age is {oldest_age} calendar days. {assignment_sentence}\n\n"
                "Confirm ownership and the next update for the oldest open cases before drawing conclusions about operational performance."
            ),
            fact_ids=["operations.workload.oldest_age_calendar_days", assignment_fact, "operations.workload.open_case_count"],
        ),
        ReportSection(
            heading="Priority review 3: documentation and data confidence",
            body=(
                "Documentation status is a field-presence proxy, not a quality or completeness judgment. "
                f"The current distribution is: {documentation}.\n\n"
                "Use the data-confidence appendix before acting on any aggregate finding that depends on missing fields."
            ),
            fact_ids=["operations.documentation.documentation_status_counts", "operations.documentation.missing_root_cause_count", "operations.documentation.missing_resolution_count", "operations.data_quality.quality_status_counts"],
        ),
    ]


def generate_snapshot_report_draft(request: SnapshotReportRequest) -> SnapshotReportDraft:
    if request.evidence_authorized:
        # There is no authenticated role dependency in this local development build.
        # Reject caller-declared authorization rather than treating a UI toggle as proof.
        raise BadRequestError("Case-level evidence is unavailable until authenticated authorization is implemented.")

    resolved_week, facts = _build_fact_package(request.as_of_week, request.client_account, request.category)
    sections = _deterministic_sections(resolved_week, facts)

    return SnapshotReportDraft(
        status="DRAFT_REQUIRES_REVIEW",
        as_of_week=resolved_week,
        logic_version=settings.logic_version,
        generated_by_model="Deterministic snapshot briefing template",
        sections=sections,
        facts=facts,
        disclaimers=REPORT_DISCLAIMERS,
    )


def create_review_report(request: SnapshotReportRequest) -> dict[str, Any]:
    """Generate an aggregate-only draft and persist it as reviewable candidates."""
    draft = generate_snapshot_report_draft(request)
    return workflow.create_report(settings.report_workflow_db_path, draft, request.client_account, request.category)
