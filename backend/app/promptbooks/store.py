"""Versioned promptbook store in the application database (reference/44 §6, decision O1).

A promptbook DRAFT can be edited and each save is retained as a revision.
Activation makes its document immutable and retires the previously active version.
Databricks only ever sees published, resolved versions (see ``publish``).
"""
from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

STATUSES = ("DRAFT", "ACTIVE", "RETIRED")


def initialize_store(database_path: Path) -> None:
    database_path.parent.mkdir(parents=True, exist_ok=True)
    with _connect(database_path) as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS promptbook_version (
              promptbook_id TEXT NOT NULL, version INTEGER NOT NULL,
              status TEXT NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'RETIRED')),
              base_promptbook_id TEXT, base_version INTEGER,
              document_json TEXT NOT NULL, change_note TEXT,
              created_by TEXT NOT NULL, created_at TEXT NOT NULL, activated_at TEXT, published_at TEXT,
              PRIMARY KEY (promptbook_id, version)
            );
            DROP TRIGGER IF EXISTS promptbook_document_immutable;
            CREATE TRIGGER promptbook_document_immutable
            BEFORE UPDATE OF document_json, base_promptbook_id, base_version ON promptbook_version
            WHEN OLD.status <> 'DRAFT' OR NEW.status <> 'DRAFT'
            BEGIN SELECT RAISE(ABORT, 'promptbook versions are immutable; create a new version'); END;
            DROP TRIGGER IF EXISTS promptbook_status_transition;
            CREATE TRIGGER promptbook_status_transition
            BEFORE UPDATE OF status ON promptbook_version
            WHEN (OLD.status IN ('ACTIVE', 'RETIRED') AND NEW.status = 'DRAFT')
              OR (OLD.status = 'RETIRED' AND NEW.status = 'ACTIVE')
            BEGIN SELECT RAISE(ABORT, 'activated promptbook versions cannot return to DRAFT or ACTIVE'); END;
            CREATE TABLE IF NOT EXISTS promptbook_draft_revision (
              promptbook_id TEXT NOT NULL, version INTEGER NOT NULL, revision INTEGER NOT NULL,
              document_json TEXT NOT NULL, saved_by TEXT NOT NULL, saved_at TEXT NOT NULL,
              PRIMARY KEY (promptbook_id, version, revision),
              FOREIGN KEY (promptbook_id, version) REFERENCES promptbook_version(promptbook_id, version)
            );
            CREATE TRIGGER IF NOT EXISTS promptbook_draft_revision_no_update
            BEFORE UPDATE ON promptbook_draft_revision
            BEGIN SELECT RAISE(ABORT, 'draft revisions are append-only'); END;
            CREATE TRIGGER IF NOT EXISTS promptbook_draft_revision_no_delete
            BEFORE DELETE ON promptbook_draft_revision
            BEGIN SELECT RAISE(ABORT, 'draft revisions are append-only'); END;
            CREATE TRIGGER IF NOT EXISTS promptbook_version_no_delete
            BEFORE DELETE ON promptbook_version
            BEGIN SELECT RAISE(ABORT, 'promptbook versions are kept for reproducibility'); END;
            """
        )
        connection.execute(
            "INSERT OR IGNORE INTO promptbook_draft_revision "
            "SELECT promptbook_id, version, 1, document_json, created_by, created_at FROM promptbook_version WHERE status = 'DRAFT'"
        )


@contextmanager
def _connect(database_path: Path):
    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_version(database_path: Path, document: dict[str, Any], created_by: str, change_note: str = "") -> int:
    """Store a new DRAFT version; ``document.meta`` names the promptbook and, for overrides, its base."""
    meta = document.get("meta") or {}
    promptbook_id = meta.get("promptbook_id")
    if not promptbook_id:
        raise ValueError("document.meta.promptbook_id is required")
    base = meta.get("base") or {}
    with _connect(database_path) as connection:
        if base:
            exists = connection.execute(
                "SELECT 1 FROM promptbook_version WHERE promptbook_id = ? AND version = ?",
                (base["promptbook_id"], base["version"]),
            ).fetchone()
            if not exists:
                raise ValueError(f"base promptbook {base['promptbook_id']} v{base['version']} does not exist")
        version = connection.execute(
            "SELECT COALESCE(MAX(version), 0) + 1 FROM promptbook_version WHERE promptbook_id = ?", (promptbook_id,)
        ).fetchone()[0]
        connection.execute(
            "INSERT INTO promptbook_version (promptbook_id, version, status, base_promptbook_id, base_version, "
            "document_json, change_note, created_by, created_at) VALUES (?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?)",
            (promptbook_id, version, base.get("promptbook_id"), base.get("version"),
             json.dumps(document, sort_keys=True), change_note, created_by, _now()),
        )
        connection.execute(
            "INSERT INTO promptbook_draft_revision (promptbook_id, version, revision, document_json, saved_by, saved_at) "
            "VALUES (?, ?, 1, ?, ?, ?)",
            (promptbook_id, version, json.dumps(document, sort_keys=True), created_by, _now()),
        )
    return version


def save_draft(database_path: Path, promptbook_id: str, version: int, document: dict[str, Any],
               saved_by: str, change_note: str | None = None) -> int:
    """Replace a DRAFT document and append a revision in the same transaction."""
    if (document.get("meta") or {}).get("promptbook_id") != promptbook_id:
        raise ValueError("document.meta.promptbook_id must match the promptbook id")
    now = _now()
    with _connect(database_path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        row = connection.execute(
            "SELECT status, base_promptbook_id, base_version FROM promptbook_version WHERE promptbook_id = ? AND version = ?", (promptbook_id, version)
        ).fetchone()
        if row is None:
            raise ValueError(f"promptbook {promptbook_id} v{version} does not exist")
        if row["status"] != "DRAFT":
            raise PermissionError(f"promptbook {promptbook_id} v{version} is {row['status']}; only DRAFT versions can be saved")
        base = (document.get("meta") or {}).get("base") or {}
        if base.get("promptbook_id") != row["base_promptbook_id"] or base.get("version") != row["base_version"]:
            raise ValueError("document.meta.base cannot be changed after draft creation")
        revision = connection.execute(
            "SELECT COALESCE(MAX(revision), 0) + 1 FROM promptbook_draft_revision WHERE promptbook_id = ? AND version = ?",
            (promptbook_id, version),
        ).fetchone()[0]
        encoded = json.dumps(document, sort_keys=True)
        if change_note is None:
            connection.execute("UPDATE promptbook_version SET document_json = ? WHERE promptbook_id = ? AND version = ?",
                               (encoded, promptbook_id, version))
        else:
            connection.execute("UPDATE promptbook_version SET document_json = ?, change_note = ? WHERE promptbook_id = ? AND version = ?",
                               (encoded, change_note, promptbook_id, version))
        connection.execute(
            "INSERT INTO promptbook_draft_revision (promptbook_id, version, revision, document_json, saved_by, saved_at) "
            "VALUES (?, ?, ?, ?, ?, ?)", (promptbook_id, version, revision, encoded, saved_by, now)
        )
    return revision


def list_revisions(database_path: Path, promptbook_id: str, version: int) -> list[dict[str, Any]]:
    with _connect(database_path) as connection:
        rows = connection.execute(
            "SELECT revision, document_json, saved_by, saved_at FROM promptbook_draft_revision "
            "WHERE promptbook_id = ? AND version = ? ORDER BY revision", (promptbook_id, version)
        ).fetchall()
    return [{"revision": row["revision"], "document": json.loads(row["document_json"]),
             "saved_by": row["saved_by"], "saved_at": row["saved_at"]} for row in rows]


def list_promptbooks(database_path: Path) -> list[dict[str, Any]]:
    with _connect(database_path) as connection:
        rows = connection.execute("""
          SELECT p.promptbook_id,
            CASE WHEN MAX(CASE WHEN p.base_promptbook_id IS NULL THEN 1 ELSE 0 END) = 1 THEN 'base' ELSE 'override' END AS kind,
            (SELECT version FROM promptbook_version a WHERE a.promptbook_id = p.promptbook_id AND a.status = 'ACTIVE' ORDER BY version DESC LIMIT 1) AS active_version,
            (SELECT published_at FROM promptbook_version a WHERE a.promptbook_id = p.promptbook_id AND a.status = 'ACTIVE' ORDER BY version DESC LIMIT 1) AS published_at,
            (SELECT version FROM promptbook_version d WHERE d.promptbook_id = p.promptbook_id AND d.status = 'DRAFT' ORDER BY version DESC LIMIT 1) AS latest_draft,
            (SELECT json_extract(n.document_json, '$.meta.name') FROM promptbook_version n WHERE n.promptbook_id = p.promptbook_id
               ORDER BY CASE n.status WHEN 'ACTIVE' THEN 0 ELSE 1 END, n.version DESC LIMIT 1) AS name
          FROM promptbook_version p GROUP BY p.promptbook_id ORDER BY p.promptbook_id
        """).fetchall()
    return [dict(row) for row in rows]


def activate(database_path: Path, promptbook_id: str, version: int) -> None:
    with _connect(database_path) as connection:
        row = connection.execute(
            "SELECT status FROM promptbook_version WHERE promptbook_id = ? AND version = ?", (promptbook_id, version)
        ).fetchone()
        if row is None:
            raise ValueError(f"{promptbook_id} v{version} does not exist")
        if row["status"] == "RETIRED":
            raise PermissionError("a retired version cannot be reactivated; create a new version")
        if row["status"] == "ACTIVE":
            return
        connection.execute(
            "UPDATE promptbook_version SET status = 'RETIRED' WHERE promptbook_id = ? AND status = 'ACTIVE' AND version <> ?",
            (promptbook_id, version),
        )
        connection.execute(
            "UPDATE promptbook_version SET status = 'ACTIVE', activated_at = ? WHERE promptbook_id = ? AND version = ?",
            (_now(), promptbook_id, version),
        )


def mark_published(database_path: Path, promptbook_id: str, version: int) -> None:
    with _connect(database_path) as connection:
        connection.execute(
            "UPDATE promptbook_version SET published_at = ? WHERE promptbook_id = ? AND version = ?",
            (_now(), promptbook_id, version),
        )


def get_version(database_path: Path, promptbook_id: str, version: int | None = None) -> dict[str, Any]:
    """A specific version, or the ACTIVE one when ``version`` is None."""
    with _connect(database_path) as connection:
        if version is None:
            row = connection.execute(
                "SELECT * FROM promptbook_version WHERE promptbook_id = ? AND status = 'ACTIVE'", (promptbook_id,)
            ).fetchone()
        else:
            row = connection.execute(
                "SELECT * FROM promptbook_version WHERE promptbook_id = ? AND version = ?", (promptbook_id, version)
            ).fetchone()
    if row is None:
        raise ValueError(f"promptbook {promptbook_id} {'(active)' if version is None else f'v{version}'} not found")
    record = dict(row)
    record["document"] = json.loads(record.pop("document_json"))
    return record


def display_names(database_path: Path) -> dict[tuple[str, int], str]:
    """``meta.name`` of every promptbook version, keyed by (promptbook_id, version)."""
    return {(row["promptbook_id"], row["version"]): row["name"] for row in list_versions(database_path) if row["name"]}


def list_versions(database_path: Path, promptbook_id: str | None = None) -> list[dict[str, Any]]:
    with _connect(database_path) as connection:
        query = ("SELECT promptbook_id, version, status, base_promptbook_id, base_version, change_note, created_by, "
                 "created_at, activated_at, published_at, json_extract(document_json, '$.meta.name') AS name FROM promptbook_version")
        rows = (connection.execute(query + " WHERE promptbook_id = ? ORDER BY version", (promptbook_id,))
                if promptbook_id else connection.execute(query + " ORDER BY promptbook_id, version"))
        return [dict(r) for r in rows]
