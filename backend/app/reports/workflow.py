"""SQLite-backed, append-only report review workflow for local development.

This store holds report-review state only.  It is not a replacement for the
source systems of record and deliberately stores cited fact values, not raw
attachment binaries or unrestricted case narratives.
"""
from __future__ import annotations

import html
import json
import sqlite3
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any


FINAL_DISPOSITIONS = {"VALIDATED", "REJECTED", "DUPLICATE"}
ALLOWED_DISPOSITIONS = FINAL_DISPOSITIONS | {"REVISED", "ADDITIONAL_EVIDENCE_REQUIRED"}


def initialize_workflow(database_path: Path) -> None:
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path)
    try:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS report_run (
              report_id TEXT PRIMARY KEY, version INTEGER NOT NULL, status TEXT NOT NULL,
              as_of_week TEXT NOT NULL, client_account TEXT, category TEXT,
              logic_version TEXT NOT NULL, generated_by_model TEXT NOT NULL,
              disclaimers_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS candidate_insight (
              insight_id TEXT PRIMARY KEY, report_id TEXT NOT NULL REFERENCES report_run(report_id),
              sequence INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
              claim_type TEXT NOT NULL DEFAULT 'pattern', confidence TEXT NOT NULL DEFAULT 'medium',
              material INTEGER NOT NULL DEFAULT 1 CHECK (material IN (0, 1)),
              current_disposition TEXT NOT NULL DEFAULT 'PENDING', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              UNIQUE(report_id, sequence)
            );
            CREATE TABLE IF NOT EXISTS insight_citation (
              citation_id TEXT PRIMARY KEY, insight_id TEXT NOT NULL REFERENCES candidate_insight(insight_id),
              source_type TEXT NOT NULL CHECK (source_type IN ('AGGREGATE_FACT', 'TICKET_FIELD', 'WORK_NOTE', 'ATTACHMENT')),
              source_locator TEXT NOT NULL, excerpt TEXT NOT NULL, evidence_hash TEXT,
              classification TEXT NOT NULL DEFAULT 'AGGREGATE_INTERNAL', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS insight_review_decision (
              decision_id TEXT PRIMARY KEY, insight_id TEXT NOT NULL REFERENCES candidate_insight(insight_id),
              reviewer_subject TEXT NOT NULL, disposition TEXT NOT NULL,
              rationale TEXT NOT NULL, revision_text TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS report_download_audit (
              audit_id TEXT PRIMARY KEY, report_id TEXT NOT NULL REFERENCES report_run(report_id),
              requester_subject TEXT NOT NULL, requested_kind TEXT NOT NULL,
              allowed INTEGER NOT NULL CHECK (allowed IN (0, 1)), readiness_json TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TRIGGER IF NOT EXISTS insight_review_decision_immutable_update
            BEFORE UPDATE ON insight_review_decision BEGIN SELECT RAISE(ABORT, 'review decisions are immutable'); END;
            CREATE TRIGGER IF NOT EXISTS insight_review_decision_immutable_delete
            BEFORE DELETE ON insight_review_decision BEGIN SELECT RAISE(ABORT, 'review decisions are immutable'); END;
            """
        )
        connection.commit()
    finally:
        connection.close()


@contextmanager
def _connect(database_path: Path):
    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def create_report(database_path: Path, draft: Any, client_account: str | None, category: str | None) -> dict[str, Any]:
    report_id = str(uuid.uuid4())
    with _connect(database_path) as connection:
        connection.execute(
            """INSERT INTO report_run(report_id, version, status, as_of_week, client_account, category, logic_version, generated_by_model, disclaimers_json)
               VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)""",
            (report_id, draft.status, draft.as_of_week.isoformat(), client_account, category, draft.logic_version,
             draft.generated_by_model, json.dumps(draft.disclaimers)),
        )
        facts_by_id = {fact.fact_id: fact for fact in draft.facts}
        for sequence, section in enumerate(draft.sections, start=1):
            insight_id = str(uuid.uuid4())
            connection.execute(
                """INSERT INTO candidate_insight(insight_id, report_id, sequence, title, body)
                   VALUES (?, ?, ?, ?, ?)""",
                (insight_id, report_id, sequence, section.heading, section.body),
            )
            for fact_id in section.fact_ids:
                fact = facts_by_id[fact_id]
                connection.execute(
                    """INSERT INTO insight_citation(citation_id, insight_id, source_type, source_locator, excerpt)
                       VALUES (?, ?, 'AGGREGATE_FACT', ?, ?)""",
                    (str(uuid.uuid4()), insight_id, fact.fact_id, fact.value),
                )
    return get_report(database_path, report_id)


def _readiness(connection: sqlite3.Connection, report_id: str) -> dict[str, int | bool]:
    rows = connection.execute(
        "SELECT material, current_disposition, COUNT(*) AS count FROM candidate_insight WHERE report_id = ? GROUP BY material, current_disposition",
        (report_id,),
    ).fetchall()
    pending = validated = excluded = total_material = 0
    for row in rows:
        if not row["material"]:
            continue
        count = row["count"]
        total_material += count
        if row["current_disposition"] == "VALIDATED":
            validated += count
        elif row["current_disposition"] in {"REJECTED", "DUPLICATE"}:
            excluded += count
        else:
            pending += count
    return {"total_material": total_material, "validated": validated, "excluded": excluded, "pending": pending, "ready": pending == 0 and total_material > 0}


def get_report(database_path: Path, report_id: str) -> dict[str, Any] | None:
    with _connect(database_path) as connection:
        report = connection.execute("SELECT * FROM report_run WHERE report_id = ?", (report_id,)).fetchone()
        if report is None:
            return None
        insights = []
        for insight in connection.execute("SELECT * FROM candidate_insight WHERE report_id = ? ORDER BY sequence", (report_id,)):
            citations = [dict(row) for row in connection.execute("SELECT * FROM insight_citation WHERE insight_id = ? ORDER BY created_at", (insight["insight_id"],))]
            decisions = [dict(row) for row in connection.execute("SELECT * FROM insight_review_decision WHERE insight_id = ? ORDER BY created_at", (insight["insight_id"],))]
            insights.append({**dict(insight), "material": bool(insight["material"]), "citations": citations, "decisions": decisions})
        return {**dict(report), "disclaimers": json.loads(report["disclaimers_json"]), "insights": insights, "readiness": _readiness(connection, report_id)}


def decide_insight(database_path: Path, report_id: str, insight_id: str, reviewer_subject: str, disposition: str, rationale: str, revision_text: str | None) -> dict[str, Any] | None:
    if disposition not in ALLOWED_DISPOSITIONS:
        raise ValueError("Unsupported insight disposition.")
    with _connect(database_path) as connection:
        exists = connection.execute("SELECT 1 FROM candidate_insight WHERE insight_id = ? AND report_id = ?", (insight_id, report_id)).fetchone()
        if exists is None:
            return None
        connection.execute(
            """INSERT INTO insight_review_decision(decision_id, insight_id, reviewer_subject, disposition, rationale, revision_text)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (str(uuid.uuid4()), insight_id, reviewer_subject, disposition, rationale, revision_text),
        )
        connection.execute("UPDATE candidate_insight SET current_disposition = ? WHERE insight_id = ?", (disposition, insight_id))
    return get_report(database_path, report_id)


def record_download(database_path: Path, report_id: str, requester_subject: str, requested_kind: str) -> tuple[dict[str, Any] | None, bool]:
    report = get_report(database_path, report_id)
    if report is None:
        return None, False
    allowed = requested_kind == "DRAFT_HTML" or bool(report["readiness"]["ready"])
    with _connect(database_path) as connection:
        connection.execute(
            """INSERT INTO report_download_audit(audit_id, report_id, requester_subject, requested_kind, allowed, readiness_json)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (str(uuid.uuid4()), report_id, requester_subject, requested_kind, int(allowed), json.dumps(report["readiness"])),
        )
    return report, allowed


DISPLAY_LABELS = {
    "SYSTEM_GENERATED_DRAFT": "System-generated draft",
    "DRAFT_REQUIRES_REVIEW": "Draft requires review",
    "ADDITIONAL_EVIDENCE_REQUIRED": "Additional evidence required",
    "AGGREGATE_FACT": "Aggregate fact",
    "TICKET_FIELD": "Ticket field",
    "WORK_NOTE": "Work note",
    "VALIDATED": "Validated",
    "REJECTED": "Rejected",
    "REVISED": "Revised",
    "DUPLICATE": "Duplicate",
    "PENDING": "Pending",
}


def _display_label(value: str) -> str:
    if value in DISPLAY_LABELS:
        return DISPLAY_LABELS[value]
    return " / ".join(part.replace("_", " ").strip().title() for part in value.split("."))


def _format_fact_value(value: str) -> str:
    """Keep technical JSON out of the business report while retaining traceability."""
    try:
        parsed = json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return value
    if isinstance(parsed, list):
        readable = []
        for item in parsed:
            if isinstance(item, dict) and "label" in item and "count" in item:
                readable.append(f"{item['label']}: {item['count']}")
            else:
                readable.append(str(item))
        return "; ".join(readable)
    if isinstance(parsed, dict):
        return "; ".join(f"{key.replace('_', ' ')}: {item}" for key, item in parsed.items())
    return str(parsed)


def _render_narrative_html(body: str) -> str:
    """Render stored plain text safely as readable paragraphs or simple bullet lists."""
    blocks = [block.strip() for block in body.split("\n\n") if block.strip()]
    rendered = []
    for block in blocks:
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        if lines and all(line.startswith(("- ", "* ")) for line in lines):
            items = "".join(f"<li>{html.escape(line[2:].replace('_', ' '))}</li>" for line in lines)
            rendered.append(f"<ul>{items}</ul>")
        else:
            rendered.append(f"<p>{'<br>'.join(html.escape(line.replace('_', ' ')) for line in lines)}</p>")
    return "".join(rendered) or "<p></p>"


def render_html(report: dict[str, Any], final: bool) -> str:
    scope = " / ".join(value for value in (report["client_account"], report["category"]) if value) or "General snapshot"
    title = "Sanford Snapshot Operational Briefing" if report["client_account"] else "Snapshot Operational Briefing"
    status_label = "Reviewed export" if final else "Draft for review"
    blocks = []
    for insight in report["insights"]:
        citations = "".join(
            f"<li><strong>{html.escape(_display_label(item['source_locator']))}</strong><span>{html.escape(_format_fact_value(item['excerpt']))}</span></li>"
            for item in insight["citations"]
        )
        blocks.append(
            f"<section><h2>{html.escape(insight['title'])}</h2>{_render_narrative_html(insight['body'])}"
            f"<p class='review-status'><strong>Review status:</strong> {html.escape(_display_label(insight['current_disposition']))}</p>"
            f"<details><summary>Supporting facts</summary><ul>{citations}</ul></details></section>"
        )
    notices = "".join(f"<li>{html.escape(item)}</li>" for item in report["disclaimers"])
    readiness = report["readiness"]
    readiness_text = f"{readiness['validated']} validated, {readiness['excluded']} excluded, {readiness['pending']} pending out of {readiness['total_material']} material insights"
    styles = """
body{font-family:Arial,sans-serif;max-width:900px;margin:40px auto;padding:0 24px;color:#202124;line-height:1.55}
header{border-bottom:4px solid #002677;padding-bottom:24px;margin-bottom:32px}h1{font-size:32px;line-height:1.2;color:#002677;margin:0 0 12px}h2{font-size:22px;line-height:1.3;color:#002677;margin:0 0 12px}h3{font-size:16px}.meta{color:#4b4d4f;margin:4px 0}.status{display:inline-block;background:#eef4ff;color:#224aa0;border-radius:16px;padding:4px 10px;font-weight:bold;font-size:14px}.readiness{background:#fafafa;border-left:4px solid #0c55b8;padding:12px 16px;margin:24px 0}section{border:1px solid #e5e5e6;border-radius:8px;padding:24px;margin:20px 0}section p{margin:12px 0}.review-status{font-size:14px;color:#4b4d4f}details{margin-top:16px;border-top:1px solid #e5e5e6;padding-top:12px}summary{color:#0c55b8;font-weight:bold;cursor:pointer}li{margin:8px 0}li span{display:block;color:#4b4d4f;margin-top:2px}.limitations{background:#fafafa;padding:16px 24px;border-radius:8px} @media(max-width:600px){body{margin:20px auto;padding:0 16px}section{padding:16px}h1{font-size:28px}}
"""
    return f"<!doctype html><html><head><meta charset='utf-8'><title>{html.escape(title)}</title><style>{styles}</style></head><body><header><p class='status'>{html.escape(status_label)}</p><h1>{html.escape(title)}</h1><p class='meta'><strong>Scope:</strong> {html.escape(scope)}</p><p class='meta'><strong>As of:</strong> {html.escape(report['as_of_week'])}</p></header><div class='readiness'><strong>Review readiness:</strong> {html.escape(readiness_text)}</div>{''.join(blocks)}<section class='limitations'><h2>Data confidence and limitations</h2><ul>{notices}</ul></section></body></html>"
