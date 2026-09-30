"""Service boundary for evidence-bounded case diagnostic candidates."""
from __future__ import annotations

import json
import re
from datetime import date

from app.analytics import repository
from app.analytics.service import resolve_as_of_week
from app.core import ai_gateway_client
from app.core.config import settings
from app.core.exceptions import BadRequestError, NotFoundError, ServiceUnavailableError
from app.diagnostics import workflow


ALLOWED_SEGMENT_TYPES = {
    "case_short_description", "case_description", "case_close_notes",
    "task_short_description", "task_description", "task_close_notes",
}
MAX_EXCERPT_CHARS = 1200

# Deterministic rejection for the local-test drafting assistant only, mirroring
# reports/service.py's own (currently unused) forbidden-claim list. A draft is a
# hypothesis for a reviewer to edit and approve -- never a finding on its own.
FORBIDDEN_CLAIM_PATTERNS = [
    r"\bvalidated root cause\b",
    r"\baction (is |was )?complete(d)?\b",
    r"\bconfirmed outcome\b",
    r"\bfinancial (benefit|savings|impact)\b",
    r"\bSLA\b[^.]{0,40}\bcompliant\b",
    r"\bPG\b[^.]{0,40}\bcompliant\b",
    r"\bguarantee(d)?\b",
]

_DRAFT_SYSTEM_PROMPT = (
    "You are a local-test drafting assistant for a Sanford case diagnostic review. "
    "You receive a JSON array of approved evidence excerpts, each with a segment_id. "
    "Draft a candidate diagnosis using only that evidence. Cite only segment_id values "
    "present in the supplied evidence; never invent a segment_id or reference evidence not "
    "supplied. Never state a validated root cause, completed remediation, confirmed outcome, "
    "financial benefit, or SLA/PG compliance -- this is a hypothesis for a human reviewer to "
    "edit and approve, not a finding. Return JSON only, with exactly these keys: "
    "observed_issue (string, required, what happened), candidate_contributing_factor (string, "
    "a hypothesis for why it may have happened), detection_gap (string, why it may not have "
    "been caught sooner), candidate_owner (string, a plausible owning team/role, or empty if "
    "not inferable), proposed_action (string, a recommended next step for review), and "
    "evidence_segment_ids (array of the segment_id values actually used)."
)


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


def _reject_forbidden_claims(fields: dict[str, str]) -> None:
    for label, text in fields.items():
        for pattern in FORBIDDEN_CLAIM_PATTERNS:
            if re.search(pattern, text, re.IGNORECASE):
                raise BadRequestError(
                    f"AI drafting response's '{label}' field contained an unsupported claim and was rejected."
                )


def draft_case_diagnostic(case_number: str, as_of_week: date | None) -> dict:
    """Draft a candidate diagnosis from a case's approved evidence, for a reviewer to edit and approve.

    Local-test only: this never calls the live AI gateway. It reuses the same
    server-resolved, allow-listed evidence a human reviewer sees -- the model
    never chooses what to query, and every cited segment_id is validated closed-
    world against that evidence set before the draft is returned. Nothing here
    is persisted; only an explicit reviewer submission through the existing
    create-candidate path creates a diagnostic.
    """
    if not settings.report_local_test_enabled:
        raise ServiceUnavailableError("AI-assisted diagnostic drafting is only available in local test mode.")

    resolved_week, _case_row, evidence = _case_and_evidence(case_number, as_of_week)
    if not evidence:
        raise BadRequestError("No delivered description or closing-note evidence is available to draft from.")

    client = ai_gateway_client.build_client()
    if client is None:
        raise ServiceUnavailableError("Local AI drafting is not configured (set OPENAI_API_KEY).")

    by_id = {row["segment_id"]: row for row in evidence}
    user_payload = json.dumps([
        {
            "segment_id": row["segment_id"],
            "record_level": row["record_level"],
            "task_number": row.get("task_number"),
            "segment_type": row["segment_type"],
            "excerpt": row["segment_text"][:MAX_EXCERPT_CHARS],
        }
        for row in evidence
    ])

    try:
        raw = client.generate_json(_DRAFT_SYSTEM_PROMPT, user_payload)
        parsed = json.loads(raw)
    except json.JSONDecodeError as error:
        raise BadRequestError("AI drafting response was not valid JSON.") from error

    if not isinstance(parsed, dict) or not str(parsed.get("observed_issue", "")).strip():
        raise BadRequestError("AI drafting response was missing a required observed_issue field.")

    cited_ids = parsed.get("evidence_segment_ids") or []
    if not isinstance(cited_ids, list) or any(not isinstance(segment_id, str) for segment_id in cited_ids):
        raise BadRequestError("AI drafting response's evidence_segment_ids was malformed.")
    unknown_ids = [segment_id for segment_id in cited_ids if segment_id not in by_id]
    if unknown_ids:
        raise BadRequestError(f"AI drafting response cited evidence outside the supplied set: {unknown_ids}.")

    fields = {
        "observed_issue": str(parsed.get("observed_issue", "")).strip(),
        "candidate_contributing_factor": str(parsed.get("candidate_contributing_factor", "")).strip(),
        "detection_gap": str(parsed.get("detection_gap", "")).strip(),
        "candidate_owner": str(parsed.get("candidate_owner", "")).strip(),
        "proposed_action": str(parsed.get("proposed_action", "")).strip(),
    }
    _reject_forbidden_claims(fields)

    return {
        "case_number": case_number,
        "as_of_week": resolved_week,
        **fields,
        "evidence_segment_ids": cited_ids,
        "generated_by_model": f"Local test drafting assistant ({settings.openai_model})",
        "disclaimer": (
            "LOCAL_TEST_ONLY: AI-drafted hypothesis, not reviewed. Edit and validate every field "
            "and citation before creating a candidate diagnostic."
        ),
    }


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


def get_client_diagnostic_report_summary(database_path, client_account: str, as_of_week: date | None) -> dict:
    """Report-facing rollup of already-reviewed diagnostics for one client/week.

    Renders only fields a reviewer already typed and validated through the
    diagnostic workflow; it introduces no new narrative text at render time.
    Consolidation groups validated diagnostics by exact-match contributing-factor
    text only -- this is a pilot-grade approximation, not a controlled taxonomy,
    and near-duplicate phrasing will not merge.
    """
    resolved_week = resolve_as_of_week(as_of_week)
    diagnostics = workflow.list_diagnostics_by_client(database_path, client_account, resolved_week.isoformat())

    validated = [row for row in diagnostics if row["status"] == "VALIDATED"]
    pending = [row for row in diagnostics if row["status"] == "CANDIDATE_REQUIRES_REVIEW"]
    reviewed_not_validated = [row for row in diagnostics if row["status"] not in ("VALIDATED", "CANDIDATE_REQUIRES_REVIEW")]

    groups: dict[str, list[dict]] = {}
    for row in validated:
        factor = (row.get("candidate_contributing_factor") or "").strip()
        if factor:
            groups.setdefault(factor, []).append(row)

    consolidated_patterns = [
        {
            "contributing_factor": factor,
            "case_count": len(rows),
            "case_numbers": sorted({row["case_number"] for row in rows}),
            "candidate_owners": sorted({row["candidate_owner"] for row in rows if row.get("candidate_owner")}),
            "proposed_actions": sorted({row["proposed_action"] for row in rows if row.get("proposed_action")}),
        }
        for factor, rows in groups.items() if len(rows) > 1
    ]
    consolidated_case_numbers = {case_number for pattern in consolidated_patterns for case_number in pattern["case_numbers"]}

    one_off_diagnostics = [
        {
            "diagnostic_id": row["diagnostic_id"],
            "case_number": row["case_number"],
            "observed_issue": row["observed_issue"],
            "candidate_contributing_factor": row["candidate_contributing_factor"],
            "detection_gap": row["detection_gap"],
            "candidate_owner": row["candidate_owner"],
            "proposed_action": row["proposed_action"],
        }
        for row in validated if row["case_number"] not in consolidated_case_numbers
    ]

    return {
        "client_account": client_account,
        "as_of_week": resolved_week,
        "created": len(diagnostics),
        "validated": len(validated),
        "pending": len(pending),
        "reviewed_not_validated": len(reviewed_not_validated),
        "validated_one_off_diagnostics": one_off_diagnostics,
        "consolidated_patterns": consolidated_patterns,
        "identity_notice": "Local development reviewer identity only. Production requires verified SSO identity and role enforcement before case evidence access.",
        "limitations": [
            "Consolidated patterns group validated diagnostics by exact-match contributing-factor text only; near-duplicate phrasing is not merged.",
            "This is a candidate diagnostic rollup, not a confirmed root cause, completed remediation, or contractual/financial outcome.",
        ],
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
