"""Local append-only store for case diagnostic candidates and their reviews.

The workflow stores selected, bounded case evidence for traceability. It is a local
development implementation; production requires authenticated authorization before
raw case evidence can be exposed or a reviewer identity can be treated as verified.
"""
from __future__ import annotations

import sqlite3
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any


ALLOWED_DISPOSITIONS = {"VALIDATED", "REJECTED", "REVISED", "DUPLICATE", "ADDITIONAL_EVIDENCE_REQUIRED"}


def initialize_diagnostic_workflow(database_path: Path) -> None:
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path)
    try:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS case_diagnostic_candidate (
              diagnostic_id TEXT PRIMARY KEY,
              case_number TEXT NOT NULL, as_of_week TEXT NOT NULL,
              client_account TEXT, status TEXT NOT NULL DEFAULT 'CANDIDATE_REQUIRES_REVIEW',
              observed_issue TEXT NOT NULL, candidate_contributing_factor TEXT NOT NULL,
              detection_gap TEXT NOT NULL, candidate_owner TEXT NOT NULL,
              proposed_action TEXT NOT NULL, created_by_subject TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_case_diagnostic_candidate_case
              ON case_diagnostic_candidate(case_number, as_of_week, created_at DESC);
            CREATE TABLE IF NOT EXISTS case_diagnostic_evidence (
              evidence_id TEXT PRIMARY KEY,
              diagnostic_id TEXT NOT NULL REFERENCES case_diagnostic_candidate(diagnostic_id),
              segment_id TEXT NOT NULL, record_level TEXT NOT NULL, task_number TEXT,
              segment_type TEXT NOT NULL, source_column TEXT NOT NULL, source_file TEXT,
              extract_week TEXT, excerpt TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              UNIQUE(diagnostic_id, segment_id)
            );
            CREATE TABLE IF NOT EXISTS case_diagnostic_review_decision (
              decision_id TEXT PRIMARY KEY,
              diagnostic_id TEXT NOT NULL REFERENCES case_diagnostic_candidate(diagnostic_id),
              reviewer_subject TEXT NOT NULL, disposition TEXT NOT NULL,
              rationale TEXT NOT NULL, revision_text TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TRIGGER IF NOT EXISTS case_diagnostic_review_immutable_update
            BEFORE UPDATE ON case_diagnostic_review_decision BEGIN SELECT RAISE(ABORT, 'diagnostic review decisions are immutable'); END;
            CREATE TRIGGER IF NOT EXISTS case_diagnostic_review_immutable_delete
            BEFORE DELETE ON case_diagnostic_review_decision BEGIN SELECT RAISE(ABORT, 'diagnostic review decisions are immutable'); END;
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


def _diagnostic(connection: sqlite3.Connection, diagnostic_id: str) -> dict[str, Any] | None:
    candidate = connection.execute("SELECT * FROM case_diagnostic_candidate WHERE diagnostic_id = ?", (diagnostic_id,)).fetchone()
    if candidate is None:
        return None
    evidence = [dict(row) for row in connection.execute("SELECT * FROM case_diagnostic_evidence WHERE diagnostic_id = ? ORDER BY created_at, evidence_id", (diagnostic_id,))]
    decisions = [dict(row) for row in connection.execute("SELECT * FROM case_diagnostic_review_decision WHERE diagnostic_id = ? ORDER BY created_at, decision_id", (diagnostic_id,))]
    return {**dict(candidate), "evidence": evidence, "decisions": decisions}


def list_diagnostics(database_path: Path, case_number: str, as_of_week: str) -> list[dict[str, Any]]:
    with _connect(database_path) as connection:
        rows = connection.execute(
            "SELECT diagnostic_id FROM case_diagnostic_candidate WHERE case_number = ? AND as_of_week = ? ORDER BY created_at DESC, diagnostic_id DESC",
            (case_number, as_of_week),
        ).fetchall()
        return [_diagnostic(connection, row["diagnostic_id"]) for row in rows]


def list_diagnostics_by_client(database_path: Path, client_account: str, as_of_week: str) -> list[dict[str, Any]]:
    with _connect(database_path) as connection:
        rows = connection.execute(
            "SELECT diagnostic_id FROM case_diagnostic_candidate WHERE client_account = ? AND as_of_week = ? ORDER BY created_at DESC, diagnostic_id DESC",
            (client_account, as_of_week),
        ).fetchall()
        return [_diagnostic(connection, row["diagnostic_id"]) for row in rows]


def create_diagnostic(database_path: Path, case_number: str, as_of_week: str, client_account: str | None, actor: str, payload: Any, evidence_rows: list[dict[str, Any]]) -> dict[str, Any]:
    diagnostic_id = str(uuid.uuid4())
    with _connect(database_path) as connection:
        connection.execute(
            """INSERT INTO case_diagnostic_candidate(
                 diagnostic_id, case_number, as_of_week, client_account, observed_issue,
                 candidate_contributing_factor, detection_gap, candidate_owner, proposed_action, created_by_subject)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (diagnostic_id, case_number, as_of_week, client_account, payload.observed_issue.strip(),
             payload.candidate_contributing_factor.strip(), payload.detection_gap.strip(),
             payload.candidate_owner.strip(), payload.proposed_action.strip(), actor),
        )
        for row in evidence_rows:
            connection.execute(
                """INSERT INTO case_diagnostic_evidence(
                     evidence_id, diagnostic_id, segment_id, record_level, task_number, segment_type,
                     source_column, source_file, extract_week, excerpt)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (str(uuid.uuid4()), diagnostic_id, row["segment_id"], row["record_level"], row.get("task_number"),
                 row["segment_type"], row["source_column"], row.get("source_file"),
                 str(row["extract_week"]) if row.get("extract_week") else None, row["excerpt"]),
            )
        return _diagnostic(connection, diagnostic_id)


def review_diagnostic(database_path: Path, diagnostic_id: str, actor: str, disposition: str, rationale: str, revision_text: str | None) -> dict[str, Any] | None:
    if disposition not in ALLOWED_DISPOSITIONS:
        raise ValueError("Unsupported diagnostic disposition.")
    with _connect(database_path) as connection:
        if connection.execute("SELECT 1 FROM case_diagnostic_candidate WHERE diagnostic_id = ?", (diagnostic_id,)).fetchone() is None:
            return None
        connection.execute(
            """INSERT INTO case_diagnostic_review_decision(decision_id, diagnostic_id, reviewer_subject, disposition, rationale, revision_text)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (str(uuid.uuid4()), diagnostic_id, actor, disposition, rationale, revision_text),
        )
        connection.execute("UPDATE case_diagnostic_candidate SET status = ? WHERE diagnostic_id = ?", (disposition, diagnostic_id))
        return _diagnostic(connection, diagnostic_id)
