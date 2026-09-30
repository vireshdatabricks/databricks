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


def render_html(report: dict[str, Any], final: bool) -> str:
    scope = " / ".join(value for value in (report["client_account"], report["category"]) if value) or "General snapshot"
    title = "Reviewed client briefing" if final else "SYSTEM_GENERATED_DRAFT briefing"
    blocks = []
    for insight in report["insights"]:
        citations = "".join(f"<li><code>{html.escape(item['source_locator'])}</code>: {html.escape(item['excerpt'])}</li>" for item in insight["citations"])
        blocks.append(f"<section><h2>{html.escape(insight['title'])}</h2><p>{html.escape(insight['body'])}</p><p><strong>Review status:</strong> {html.escape(insight['current_disposition'])}</p><h3>Citations</h3><ul>{citations}</ul></section>")
    notices = "".join(f"<li>{html.escape(item)}</li>" for item in report["disclaimers"])
    return f"<!doctype html><html><head><meta charset='utf-8'><title>{html.escape(title)}</title><style>body{{font-family:Arial,sans-serif;max-width:900px;margin:40px auto;line-height:1.5}}section{{border:1px solid #ddd;padding:16px;margin:16px 0}}code{{overflow-wrap:anywhere}}</style></head><body><h1>{html.escape(title)}</h1><p><strong>Scope:</strong> {html.escape(scope)} | <strong>As of:</strong> {html.escape(report['as_of_week'])}</p><p><strong>Review readiness:</strong> {html.escape(json.dumps(report['readiness']))}</p><h2>Limitations</h2><ul>{notices}</ul>{''.join(blocks)}</body></html>"
