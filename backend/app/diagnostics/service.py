"""Service boundary for evidence-bounded case diagnostic candidates."""
from __future__ import annotations

from datetime import date

from app.analytics import repository
from app.analytics.service import resolve_as_of_week
from app.core.exceptions import NotFoundError
from app.diagnostics import workflow


ALLOWED_SEGMENT_TYPES = {
    "case_short_description", "case_description", "case_close_notes",
    "task_short_description", "task_description", "task_close_notes",
}
MAX_EXCERPT_CHARS = 1200


def _case_and_evidence(case_number: str, as_of_week: date | None) -> tuple[date, dict, list[dict]]:
    resolved_week = resolve_as_of_week(as_of_week)
    case_row = repository.get_case_fact(case_number, resolved_week)
    if case_row is None:
        raise NotFoundError(f"Case {case_number} was not found for as_of_week {resolved_week.isoformat()}.")
    all_segments = repository.list_narrative_segments(case_number)
    # Narrative segments are append-only. Do not show a segment first captured
    # after the selected snapshot as evidence for that historical review.
    evidence = [
        row for row in all_segments
        if row["segment_type"] in ALLOWED_SEGMENT_TYPES
        and row.get("extract_week") is not None
        and str(row["extract_week"]) <= resolved_week.isoformat()
    ]
    return resolved_week, case_row, evidence


def get_case_diagnostics(database_path, case_number: str, as_of_week: date | None) -> dict:
    resolved_week, case_row, evidence = _case_and_evidence(case_number, as_of_week)
    return {
        "case_number": case_number,
        "as_of_week": resolved_week,
        "client_account": case_row.get("client_account"),
        "evidence": [{**row, "excerpt": row["segment_text"][:MAX_EXCERPT_CHARS]} for row in evidence],
        "diagnostics": workflow.list_diagnostics(database_path, case_number, resolved_week.isoformat()),
        "identity_notice": "Local development reviewer identity only. Production requires verified SSO identity and role enforcement before case evidence access.",
    }


def create_case_diagnostic(database_path, case_number: str, as_of_week: date | None, actor: str, payload) -> dict:
    resolved_week, case_row, evidence = _case_and_evidence(case_number, as_of_week)
    by_id = {row["segment_id"]: row for row in evidence}
    selected_ids = list(dict.fromkeys(payload.evidence_segment_ids))
    missing = [segment_id for segment_id in selected_ids if segment_id not in by_id]
    if missing:
        raise ValueError("One or more selected evidence segments are not approved narrative evidence for this case.")
    resolved_evidence = [{**by_id[segment_id], "excerpt": by_id[segment_id]["segment_text"][:MAX_EXCERPT_CHARS]} for segment_id in selected_ids]
    return workflow.create_diagnostic(database_path, case_number, resolved_week.isoformat(), case_row.get("client_account"), actor, payload, resolved_evidence)
