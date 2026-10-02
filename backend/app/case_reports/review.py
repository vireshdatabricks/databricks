"""Application-side review of promptbook report versions (reference/44 §9, decisions O3, O5, O7, O8).

A snapshot package imported from Databricks becomes an immutable report version, split into
reviewable items (findings, themes, scope decisions, generated sections, accepted evidence
queries). Reviewers append decisions; decisions and sign-offs can never be changed or deleted.
Kept in SQLite for the pilot with a portable schema (O8). Separate ``case_report_*`` tables are
used because the older ``report_*`` workflow fixes its citation source types in a CHECK constraint.
"""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DISPOSITIONS = ("VALIDATED", "REVISED", "REJECTED")
FINDING_FIELDS = ("what_happened", "what_failed", "where_it_occurred", "how_detected", "resolution", "prevention_opportunity", "likely_causes")


def initialize(database_path: Path) -> None:
    database_path.parent.mkdir(parents=True, exist_ok=True)
    with _connect(database_path) as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS case_report_version (
              report_version_id TEXT PRIMARY KEY, analysis_run_id TEXT NOT NULL, package_version INTEGER NOT NULL,
              package_hash TEXT NOT NULL UNIQUE, promptbook_id TEXT NOT NULL, promptbook_version INTEGER NOT NULL,
              clients_json TEXT NOT NULL, title TEXT NOT NULL,
              status TEXT NOT NULL CHECK (status IN ('IN_REVIEW', 'REVIEWED', 'SIGNED_OFF', 'SUPERSEDED')),
              package_json TEXT NOT NULL, imported_by TEXT NOT NULL, imported_at TEXT NOT NULL, superseded_by TEXT
            );
            CREATE TABLE IF NOT EXISTS case_report_item (
              item_id TEXT PRIMARY KEY, report_version_id TEXT NOT NULL REFERENCES case_report_version(report_version_id),
              item_key TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('FINDING', 'THEME', 'SCOPE_DECISION', 'SECTION', 'QUERY_RESULT')),
              case_number TEXT, theme_id TEXT, title TEXT NOT NULL, body_text TEXT NOT NULL, citations_json TEXT NOT NULL,
              sequence INTEGER NOT NULL, current_status TEXT NOT NULL DEFAULT 'UNVALIDATED',
              UNIQUE (report_version_id, item_key)
            );
            CREATE TABLE IF NOT EXISTS case_report_decision (
              decision_id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES case_report_item(item_id),
              report_version_id TEXT NOT NULL, reviewer_subject TEXT NOT NULL,
              disposition TEXT NOT NULL CHECK (disposition IN ('VALIDATED', 'REVISED', 'REJECTED')),
              revised_text TEXT, comment TEXT, prefilled_from TEXT, created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS case_report_signoff (
              signoff_id TEXT PRIMARY KEY, report_version_id TEXT NOT NULL REFERENCES case_report_version(report_version_id),
              reviewer_subject TEXT NOT NULL, statement TEXT NOT NULL, created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS case_report_export_audit (
              audit_id TEXT PRIMARY KEY, report_version_id TEXT NOT NULL REFERENCES case_report_version(report_version_id),
              requester_subject TEXT NOT NULL, export_format TEXT NOT NULL, validated_only INTEGER NOT NULL,
              status_counts_json TEXT NOT NULL, created_at TEXT NOT NULL
            );
            CREATE TRIGGER IF NOT EXISTS case_report_version_frozen BEFORE UPDATE OF package_json, package_hash ON case_report_version
            BEGIN SELECT RAISE(ABORT, 'report versions are frozen snapshots'); END;
            CREATE TRIGGER IF NOT EXISTS case_report_item_frozen BEFORE UPDATE OF item_key, body_text, citations_json, title ON case_report_item
            BEGIN SELECT RAISE(ABORT, 'report items are frozen snapshots'); END;
            CREATE TRIGGER IF NOT EXISTS case_report_decision_no_update BEFORE UPDATE ON case_report_decision
            BEGIN SELECT RAISE(ABORT, 'review decisions are immutable'); END;
            CREATE TRIGGER IF NOT EXISTS case_report_decision_no_delete BEFORE DELETE ON case_report_decision
            BEGIN SELECT RAISE(ABORT, 'review decisions are immutable'); END;
            CREATE TRIGGER IF NOT EXISTS case_report_signoff_no_update BEFORE UPDATE ON case_report_signoff
            BEGIN SELECT RAISE(ABORT, 'sign-offs are immutable'); END;
            CREATE TRIGGER IF NOT EXISTS case_report_signoff_no_delete BEFORE DELETE ON case_report_signoff
            BEGIN SELECT RAISE(ABORT, 'sign-offs are immutable'); END;
            """
        )
        # Additive upgrade (G21): request scope and report family on each version, backfilled from
        # the frozen package. The frozen trigger covers package_json/package_hash only.
        version_columns = {row["name"] for row in connection.execute("PRAGMA table_info(case_report_version)")}
        for name in ("date_from", "date_to", "filters_json", "family_key"):
            if name not in version_columns:
                connection.execute(f"ALTER TABLE case_report_version ADD COLUMN {name} TEXT")
        _backfill_scope(connection)
        # Additive upgrade: frozen package columns and existing decisions are never rewritten.
        columns = {row["name"] for row in connection.execute("PRAGMA table_info(case_report_item)")}
        migrated = False
        for name, declaration in (("section_id", "TEXT"), ("origin", "TEXT"), ("detail_json", "TEXT")):
            if name not in columns:
                connection.execute(f"ALTER TABLE case_report_item ADD COLUMN {name} {declaration}")
                migrated = True
        trigger = connection.execute("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'case_report_item_frozen'").fetchone()
        trigger_sql = trigger["sql"] if trigger else ""
        replace_trigger = migrated or any(name not in trigger_sql for name in ("section_id", "origin", "detail_json"))
        if replace_trigger:
            connection.execute("DROP TRIGGER IF EXISTS case_report_item_frozen")
            _backfill_items(connection)
            connection.execute(
                "CREATE TRIGGER case_report_item_frozen BEFORE UPDATE OF item_key, body_text, citations_json, title, section_id, origin, detail_json "
                "ON case_report_item BEGIN SELECT RAISE(ABORT, 'report items are frozen snapshots'); END"
            )


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


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _template_sections(package: dict[str, Any]) -> list[dict[str, Any]]:
    return [s for s in package.get("sections") or [] if isinstance(s, dict) and s.get("id")]


def _scope_section(package: dict[str, Any]) -> str:
    sections = _template_sections(package)
    return next((s["id"] for s in sections if s.get("kind") == "scope_appendix"), "scope")


def _normalise_citation(citation: dict[str, Any], extract_week: str | None = None) -> dict[str, Any]:
    """Map notebook 07 citation structs into the stable UI citation contract."""
    children = citation.get("attachment_citations") or citation.get("children") or []
    sheet = citation.get("page_or_sheet") or citation.get("page_or_sheet_reference")
    result = {
        "source_type": citation.get("source_type"),
        "record": citation.get("record_number") or citation.get("case_number"),
        "field": citation.get("field_name"),
        "file": citation.get("attachment_name") or citation.get("file"),
        "sheet": sheet,
        "quote": citation.get("excerpt") or citation.get("quote"),
        "extract_week": citation.get("extract_week") or extract_week,
        "children": [_normalise_citation(child, extract_week) for child in children if isinstance(child, dict)],
    }
    return result


def _item_metadata(package: dict[str, Any], item: dict[str, Any]) -> dict[str, Any]:
    section_id = item.get("section_id")
    if not section_id:
        if item["kind"] in ("THEME", "FINDING"):
            section_id = next((s["id"] for s in _template_sections(package) if s.get("kind") == "themes"), "themes")
        elif item["kind"] == "SCOPE_DECISION":
            section_id = _scope_section(package)
        elif item["kind"] == "SECTION":
            section_id = item.get("item_key", "section:").partition(":")[2]
        elif item["kind"] == "QUERY_RESULT":
            section_id = (item.get("detail") or {}).get("section_id") or ""
    detail = item.get("detail")
    if item["kind"] == "QUERY_RESULT":
        detail = detail or {}
    return {
        "section_id": section_id,
        "origin": item.get("origin") or ("COMPUTED" if item["kind"] == "QUERY_RESULT" else "MODEL"),
        "detail_json": json.dumps(detail, default=str) if detail is not None else None,
    }


def package_scope(package: dict[str, Any]) -> dict[str, Any]:
    """Requested period, filters, and family key of a frozen package (G21).

    A family is every version requested with the same promptbook, clients, period, and filters,
    so re-running a report adds a version to the same family.
    """
    run = package.get("run") or {}
    filters = {key: value for key, value in sorted((run.get("filters") or {}).items()) if value}
    identity = {"promptbook_id": (package.get("promptbook") or {}).get("promptbook_id"),
                "clients": sorted(run.get("clients") or []), "date_from": run.get("date_from"),
                "date_to": run.get("date_to"), "filters": filters}
    family_key = hashlib.sha256(json.dumps(identity, sort_keys=True, default=str).encode()).hexdigest()[:32]
    return {"date_from": run.get("date_from"), "date_to": run.get("date_to"),
            "filters_json": json.dumps(filters, sort_keys=True, default=str), "family_key": family_key}


def _backfill_scope(connection: sqlite3.Connection) -> None:
    rows = connection.execute("SELECT report_version_id, package_json FROM case_report_version WHERE family_key IS NULL").fetchall()
    for row in rows:
        scope = package_scope(json.loads(row["package_json"]))
        connection.execute("UPDATE case_report_version SET date_from = ?, date_to = ?, filters_json = ?, family_key = ? "
                           "WHERE report_version_id = ?",
                           (scope["date_from"], scope["date_to"], scope["filters_json"], scope["family_key"], row["report_version_id"]))


def _backfill_items(connection: sqlite3.Connection) -> None:
    rows = connection.execute(
        "SELECT i.item_id, i.report_version_id, i.item_key, i.kind, i.title, i.body_text, i.citations_json, "
        "i.case_number, i.theme_id, i.section_id, i.origin, i.detail_json, v.package_json "
        "FROM case_report_item i JOIN case_report_version v USING(report_version_id) "
        "WHERE i.section_id IS NULL OR i.origin IS NULL"
    ).fetchall()
    for row in rows:
        package = json.loads(row["package_json"])
        item = next((x for x in items_from_package(package) if x["item_key"] == row["item_key"]), None)
        if item is None:
            item = {"item_key": row["item_key"], "kind": row["kind"], "title": row["title"],
                    "body_text": row["body_text"], "citations": json.loads(row["citations_json"]),
                    "case_number": row["case_number"], "theme_id": row["theme_id"]}
        metadata = _item_metadata(package, item)
        connection.execute(
            "UPDATE case_report_item SET section_id = COALESCE(section_id, ?), origin = COALESCE(origin, ?), "
            "detail_json = COALESCE(detail_json, ?) WHERE item_id = ?",
            (metadata["section_id"], metadata["origin"], metadata["detail_json"], row["item_id"]),
        )


# --------------------------------------------------------------------------- items
def items_from_package(package: dict[str, Any]) -> list[dict[str, Any]]:
    """Reviewable items. ``item_key`` values match the export review keys in ``exports.py``."""
    items: list[dict[str, Any]] = []
    themes_by_case: dict[str, list[str]] = {}
    extract_week = (package.get("run") or {}).get("as_of_extract_week")
    themes_section = next((s["id"] for s in _template_sections(package) if s.get("kind") == "themes"), "themes")
    scope_section = _scope_section(package)
    for theme in package["themes"]:
        for case_number in theme["case_numbers"]:
            themes_by_case.setdefault(case_number, []).append(theme["theme_id"])
        items.append({"item_key": f"theme:{theme['theme_id']}", "kind": "THEME", "theme_id": theme["theme_id"],
                      "section_id": themes_section, "origin": "MODEL",
                      "title": f"Theme: {theme['theme_name_plain']}",
                      "body_text": f"{theme['problem_statement_plain']}\nKey systemic action: {theme['key_systemic_action_plain']}",
                      # Theme case membership is an association, not source evidence. Do not
                      # manufacture quote-less citations that the UI presents as unverifiable.
                      "citations": []})
    for case in package["cases"].values():
        lens = case.get("lens") or {}
        if lens:
            decision = "in scope" if lens["in_scope"] else f"out of scope: {lens.get('exclusion_reason')}"
            items.append({"item_key": f"scope:{case['case_number']}", "kind": "SCOPE_DECISION", "case_number": case["case_number"],
                          "section_id": scope_section, "origin": "MODEL",
                          "title": f"{case['case_number']} scope", "body_text": f"{decision}. {lens.get('scope_rationale') or ''}".strip(),
                          "citations": [_normalise_citation(c, extract_week) for c in lens.get("citations") or []]})
        finding = case.get("finding") or {}
        if not finding or not lens.get("in_scope"):
            continue  # findings are reviewed where the report shows them: under themes, for in-scope cases
        for field in FINDING_FIELDS:
            if field == "likely_causes":
                value = "; ".join(f"{c['cause']} ({c['cause_kind']})" for c in finding.get("likely_causes") or [])
            else:
                value = finding.get(field)
            items.append({"item_key": f"finding:{case['case_number']}:{field}", "kind": "FINDING", "case_number": case["case_number"],
                          "section_id": themes_section, "origin": "MODEL",
                          "theme_id": ",".join(themes_by_case.get(case["case_number"], [])),
                          "title": f"{case['case_number']} {field.replace('_', ' ')}",
                          "body_text": value or "(omitted: no verifiable citation)",
                          "citations": [_normalise_citation(c, extract_week) for c in finding.get("citations") or []
                                        if c.get("section") == field]})
    for section in package["sections"]:
        if section.get("generated"):
            items.append({"item_key": f"section:{section['id']}", "kind": "SECTION", "section_id": section["id"],
                          "origin": "MODEL", "title": section["heading"],
                          "body_text": section.get("text") or "(not generated)", "citations": []})
    for query in package.get("queries") or []:
        if query.get("check_status") == "ACCEPTED":
            detail = {"question": query.get("question"), "generated_sql": query.get("generated_sql"),
                      "check_status": query.get("check_status"), "check_detail": query.get("check_detail"),
                      "result_columns": query.get("result_columns") or [], "rows": query.get("rows") or [],
                      "row_count": query.get("result_row_count", len(query.get("rows") or [])),
                      "section_id": query.get("section_id")}
            items.append({"item_key": f"query:{query['query_id']}", "kind": "QUERY_RESULT",
                          "section_id": query.get("section_id"), "origin": "COMPUTED", "detail": detail,
                          "title": query.get("question") or "Evidence query",
                          "body_text": f"{detail['row_count']} rows returned.", "citations": []})
    return items


# --------------------------------------------------------------------------- versions
def import_package(database_path: Path, package_json: str, package_hash: str, imported_by: str) -> dict[str, Any]:
    """Create a frozen report version; importing the same package again returns the existing version."""
    package = json.loads(package_json)
    with _connect(database_path) as connection:
        existing = connection.execute("SELECT report_version_id FROM case_report_version WHERE package_hash = ?", (package_hash,)).fetchone()
        if existing:
            return {"report_version_id": existing["report_version_id"], "created": False}
        version_id = str(uuid.uuid4())
        run = package["run"]
        scope = package_scope(package)
        connection.execute(
            "INSERT INTO case_report_version (report_version_id, analysis_run_id, package_version, package_hash, promptbook_id, "
            "promptbook_version, clients_json, title, status, package_json, imported_by, imported_at, "
            "date_from, date_to, filters_json, family_key) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'IN_REVIEW', ?, ?, ?, ?, ?, ?, ?)",
            (version_id, run["analysis_run_id"], package["package_version"], package_hash, package["promptbook"]["promptbook_id"],
             package["promptbook"]["version"], json.dumps(run["clients"]), package["promptbook"]["title"], package_json, imported_by, _now(),
             scope["date_from"], scope["date_to"], scope["filters_json"], scope["family_key"]),
        )
        for sequence, item in enumerate(items_from_package(package), 1):
            metadata = _item_metadata(package, item)
            connection.execute(
                "INSERT INTO case_report_item (item_id, report_version_id, item_key, kind, case_number, theme_id, title, body_text, "
                "citations_json, sequence, section_id, origin, detail_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), version_id, item["item_key"], item["kind"], item.get("case_number"), item.get("theme_id"),
                 item["title"], item["body_text"], json.dumps(item["citations"], default=str), sequence,
                 metadata["section_id"], metadata["origin"], metadata["detail_json"]),
            )
        # An older package of the same run is superseded by the new one.
        connection.execute(
            "UPDATE case_report_version SET status = 'SUPERSEDED', superseded_by = ? "
            "WHERE analysis_run_id = ? AND report_version_id <> ? AND status <> 'SUPERSEDED' AND package_version < ?",
            (version_id, run["analysis_run_id"], version_id, package["package_version"]),
        )
    return {"report_version_id": version_id, "created": True}


def _version_row(connection: sqlite3.Connection, version_id: str) -> sqlite3.Row:
    row = connection.execute("SELECT * FROM case_report_version WHERE report_version_id = ?", (version_id,)).fetchone()
    if row is None:
        raise LookupError(f"report version {version_id} not found")
    return row


def _refresh_status(connection: sqlite3.Connection, version_id: str) -> str:
    pending = connection.execute(
        "SELECT COUNT(*) FROM case_report_item WHERE report_version_id = ? AND current_status = 'UNVALIDATED'", (version_id,)
    ).fetchone()[0]
    status = "REVIEWED" if pending == 0 else "IN_REVIEW"
    connection.execute("UPDATE case_report_version SET status = ? WHERE report_version_id = ? AND status IN ('IN_REVIEW', 'REVIEWED')",
                       (status, version_id))
    return status


def record_decision(database_path: Path, version_id: str, item_id: str, reviewer: str, disposition: str,
                    comment: str | None = None, revised_text: str | None = None, prefilled_from: str | None = None) -> dict[str, Any]:
    if disposition not in DISPOSITIONS:
        raise ValueError(f"disposition must be one of {DISPOSITIONS}")
    if disposition == "REVISED" and not (revised_text or "").strip():
        raise ValueError("a revision needs the revised text")
    if disposition == "REJECTED" and not (comment or "").strip():
        raise ValueError("a rejection needs a comment explaining why")
    with _connect(database_path) as connection:
        version = _version_row(connection, version_id)
        if version["status"] in ("SIGNED_OFF", "SUPERSEDED"):
            raise PermissionError(f"report version is {version['status']}; decisions are closed")
        item = connection.execute("SELECT item_id, kind FROM case_report_item WHERE item_id = ? AND report_version_id = ?",
                                  (item_id, version_id)).fetchone()
        if item is None:
            raise LookupError(f"item {item_id} is not part of report version {version_id}")
        if item["kind"] == "QUERY_RESULT" and disposition == "REVISED":
            # A computed result cannot be reworded (reference/49 RP3e, S21).
            raise ValueError("Evidence answers can be validated or rejected")
        decision_id = str(uuid.uuid4())
        connection.execute(
            "INSERT INTO case_report_decision (decision_id, item_id, report_version_id, reviewer_subject, disposition, revised_text, "
            "comment, prefilled_from, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (decision_id, item_id, version_id, reviewer, disposition, revised_text, comment, prefilled_from, _now()),
        )
        connection.execute("UPDATE case_report_item SET current_status = ? WHERE item_id = ?", (disposition, item_id))
        status = _refresh_status(connection, version_id)
    return {"decision_id": decision_id, "item_id": item_id, "disposition": disposition, "report_status": status}


def prefill_from(database_path: Path, version_id: str, from_version_id: str, reviewer: str) -> dict[str, Any]:
    """Copy the latest decision of items whose key and text are identical in an earlier version (O7: explicit only)."""
    with _connect(database_path) as connection:
        target = _version_row(connection, version_id)
        source = _version_row(connection, from_version_id)
        if target["status"] in ("SIGNED_OFF", "SUPERSEDED"):
            raise PermissionError(f"report version is {target['status']}; pre-fill is closed")
        if not _same_scope(target, source):
            raise ValueError("pre-fill source must have the same promptbook and clients")
        if source["imported_at"] >= target["imported_at"]:
            raise ValueError("pre-fill source must be an earlier report version")
        pairs = connection.execute(
            """
            SELECT new.item_id AS new_item, d.decision_id, d.disposition, d.revised_text, d.comment
            FROM case_report_item new
            JOIN case_report_item old ON old.item_key = new.item_key AND old.body_text = new.body_text AND old.report_version_id = ?
            JOIN case_report_decision d ON d.item_id = old.item_id
              AND d.rowid = (SELECT rowid FROM case_report_decision WHERE item_id = old.item_id ORDER BY created_at DESC, rowid DESC LIMIT 1)
            WHERE new.report_version_id = ? AND new.current_status = 'UNVALIDATED'
            """,
            (from_version_id, version_id),
        ).fetchall()
        for pair in pairs:
            note = f"Pre-filled by {reviewer} from report version {from_version_id} (identical text)."
            connection.execute(
                "INSERT INTO case_report_decision (decision_id, item_id, report_version_id, reviewer_subject, disposition, "
                "revised_text, comment, prefilled_from, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), pair["new_item"], version_id, reviewer, pair["disposition"], pair["revised_text"],
                 f"{note} {pair['comment'] or ''}".strip(), pair["decision_id"], _now()),
            )
            connection.execute("UPDATE case_report_item SET current_status = ? WHERE item_id = ?",
                               (pair["disposition"], pair["new_item"]))
        status = _refresh_status(connection, version_id)
    copied = len(pairs)
    return {"report_version_id": version_id, "prefilled_items": copied, "report_status": status}


def _same_scope(left: sqlite3.Row, right: sqlite3.Row) -> bool:
    return left["promptbook_id"] == right["promptbook_id"] and set(json.loads(left["clients_json"])) == set(json.loads(right["clients_json"]))


def prefill_preview(database_path: Path, version_id: str, from_version_id: str) -> dict[str, Any]:
    with _connect(database_path) as connection:
        target = _version_row(connection, version_id)
        source = _version_row(connection, from_version_id)
        if not _same_scope(target, source):
            raise ValueError("pre-fill source must have the same promptbook and clients")
        if source["imported_at"] >= target["imported_at"]:
            raise ValueError("pre-fill source must be an earlier report version")
        matches = connection.execute(
            """SELECT COUNT(*) FROM case_report_item new
               JOIN case_report_item old ON old.item_key = new.item_key AND old.body_text = new.body_text AND old.report_version_id = ?
               JOIN case_report_decision d ON d.item_id = old.item_id
                 AND d.rowid = (SELECT rowid FROM case_report_decision WHERE item_id = old.item_id ORDER BY created_at DESC, rowid DESC LIMIT 1)
               WHERE new.report_version_id = ? AND new.current_status = 'UNVALIDATED'
                 AND d.disposition IN ('VALIDATED', 'REVISED', 'REJECTED')""",
            (from_version_id, version_id),
        ).fetchone()[0]
        remaining = connection.execute(
            "SELECT COUNT(*) FROM case_report_item WHERE report_version_id = ? AND current_status = 'UNVALIDATED'",
            (version_id,),
        ).fetchone()[0]
    return {"copyable": matches, "remaining": remaining - matches, "from_report_version_id": from_version_id}


def prefill_sources(database_path: Path, version_id: str) -> list[dict[str, Any]]:
    with _connect(database_path) as connection:
        target = _version_row(connection, version_id)
        rows = connection.execute(
            "SELECT report_version_id, title, status, imported_at, clients_json, promptbook_id FROM case_report_version "
            "WHERE report_version_id <> ? ORDER BY imported_at DESC", (version_id,)
        ).fetchall()
    return [{"report_version_id": r["report_version_id"], "title": r["title"], "status": r["status"],
             "imported_at": r["imported_at"], "clients": json.loads(r["clients_json"])}
            for r in rows if _same_scope(target, r) and r["imported_at"] < target["imported_at"]]


def validate_theme(database_path: Path, version_id: str, theme_id: str, reviewer: str,
                   comment: str | None = None, exclude_item_ids: list[str] | None = None) -> dict[str, Any]:
    excluded_ids = set(exclude_item_ids or [])
    with _connect(database_path) as connection:
        version = _version_row(connection, version_id)
        if version["status"] in ("SIGNED_OFF", "SUPERSEDED"):
            raise PermissionError(f"report version is {version['status']}; decisions are closed")
        findings = [row for row in connection.execute(
            "SELECT item_id, current_status, theme_id FROM case_report_item "
            "WHERE report_version_id = ? AND kind = 'FINDING' ORDER BY sequence", (version_id,)
        ).fetchall() if theme_id in (row["theme_id"] or "").split(",")]
        known_ids = {r["item_id"] for r in findings}
        invalid = excluded_ids - known_ids
        if invalid:
            raise ValueError("exclude_item_ids must identify findings in this theme")
        validated = skipped_decided = excluded = 0
        cases_decided: list[str] = []
        for finding in findings:
            if finding["item_id"] in excluded_ids:
                excluded += 1
            elif finding["current_status"] != "UNVALIDATED":
                skipped_decided += 1
            else:
                connection.execute(
                    "INSERT INTO case_report_decision (decision_id, item_id, report_version_id, reviewer_subject, disposition, "
                    "comment, created_at) VALUES (?, ?, ?, ?, 'VALIDATED', ?, ?)",
                    (str(uuid.uuid4()), finding["item_id"], version_id, reviewer, comment, _now()),
                )
                connection.execute("UPDATE case_report_item SET current_status = 'VALIDATED' WHERE item_id = ?",
                                   (finding["item_id"],))
                validated += 1
                case_number = connection.execute("SELECT case_number FROM case_report_item WHERE item_id = ?",
                                                 (finding["item_id"],)).fetchone()[0]
                if case_number and case_number not in cases_decided:
                    cases_decided.append(case_number)
        report_status = _refresh_status(connection, version_id)
    return {"validated": validated, "skipped_decided": skipped_decided, "excluded": excluded,
            "report_status": report_status, "cases": cases_decided}


def decide_case(database_path: Path, version_id: str, case_number: str, reviewer: str, disposition: str | None,
                comment: str | None = None, field_overrides: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Record a case-level action as immutable field decisions in one transaction.

    With ``disposition`` None (RP3e, G18 amendment) only ``field_overrides`` are recorded; that is
    allowed when every other field of the case already has a decision.
    """
    if disposition is not None and disposition not in ("VALIDATED", "REJECTED"):
        raise ValueError("case disposition must be VALIDATED or REJECTED")
    if disposition is None and not field_overrides:
        raise ValueError("Choose Validate or Reject for the case, or change at least one field")
    if disposition == "REJECTED" and not (comment or "").strip():
        raise ValueError("a rejection needs a comment explaining why")
    overrides = field_overrides or []
    override_by_id: dict[str, dict[str, Any]] = {}
    for override in overrides:
        item_id = override.get("item_id")
        if not item_id or item_id in override_by_id:
            raise ValueError("field_overrides must contain unique item ids")
        override_disposition = override.get("disposition")
        if override_disposition not in ("REVISED", "REJECTED"):
            raise ValueError("field override disposition must be REVISED or REJECTED")
        if override_disposition == "REVISED" and not (override.get("revised_text") or "").strip():
            raise ValueError("a revision needs the revised text")
        if override_disposition == "REJECTED" and not (override.get("comment") or "").strip():
            raise ValueError("a rejection needs a comment explaining why")
        override_by_id[item_id] = override

    with _connect(database_path) as connection:
        version = _version_row(connection, version_id)
        if version["status"] in ("SIGNED_OFF", "SUPERSEDED"):
            raise PermissionError(f"report version is {version['status']}; decisions are closed")
        rows = connection.execute(
            "SELECT item_id, current_status FROM case_report_item WHERE report_version_id = ? AND kind = 'FINDING' AND case_number = ? ORDER BY sequence",
            (version_id, case_number),
        ).fetchall()
        if not rows:
            raise LookupError(f"case {case_number} has no finding items in report version {version_id}")
        item_ids = {row["item_id"] for row in rows}
        invalid = set(override_by_id) - item_ids
        if invalid:
            raise ValueError("field_overrides must identify finding fields for this case")
        if disposition is None:
            undecided = [row for row in rows if row["item_id"] not in override_by_id and row["current_status"] == "UNVALIDATED"]
            if undecided:
                raise ValueError(f"field_overrides alone need the case decided first; {len(undecided)} other field(s) are undecided. "
                                 "Choose Validate or Reject for the case")
            rows = [row for row in rows if row["item_id"] in override_by_id]
        for row in rows:
            item_id = row["item_id"]
            override = override_by_id.get(item_id)
            item_disposition = override.get("disposition") if override else disposition
            item_comment = override.get("comment") if override else comment
            revised_text = override.get("revised_text") if override else None
            connection.execute(
                "INSERT INTO case_report_decision (decision_id, item_id, report_version_id, reviewer_subject, disposition, revised_text, comment, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), item_id, version_id, reviewer, item_disposition, revised_text, item_comment, _now()),
            )
            connection.execute("UPDATE case_report_item SET current_status = ? WHERE item_id = ?",
                               (item_disposition, item_id))
        report_status = _refresh_status(connection, version_id)
    return {"decided": len(rows), "report_status": report_status}


def sign_off(database_path: Path, version_id: str, reviewer: str, statement: str) -> dict[str, Any]:
    if not statement.strip():
        raise ValueError("a sign-off statement is required")
    with _connect(database_path) as connection:
        version = _version_row(connection, version_id)
        if version["status"] != "REVIEWED":
            pending = connection.execute("SELECT COUNT(*) FROM case_report_item WHERE report_version_id = ? AND current_status = 'UNVALIDATED'",
                                         (version_id,)).fetchone()[0]
            raise PermissionError(f"report version is {version['status']} with {pending} undecided items; every item needs a decision first")
        signoff_id = str(uuid.uuid4())
        connection.execute("INSERT INTO case_report_signoff (signoff_id, report_version_id, reviewer_subject, statement, created_at) "
                           "VALUES (?, ?, ?, ?, ?)", (signoff_id, version_id, reviewer, statement, _now()))
        connection.execute("UPDATE case_report_version SET status = 'SIGNED_OFF' WHERE report_version_id = ?", (version_id,))
    return {"report_version_id": version_id, "signoff_id": signoff_id, "status": "SIGNED_OFF"}


# --------------------------------------------------------------------------- reads
def list_versions(database_path: Path) -> list[dict[str, Any]]:
    with _connect(database_path) as connection:
        rows = connection.execute(
            """
            SELECT v.report_version_id, v.analysis_run_id, v.package_version, v.promptbook_id, v.promptbook_version, v.clients_json,
                   v.title, v.status, v.imported_at, v.date_from, v.date_to, v.filters_json, v.family_key,
                   SUM(i.current_status = 'UNVALIDATED') AS pending, COUNT(i.item_id) AS items,
                   (SELECT MAX(d.created_at) FROM case_report_decision d WHERE d.report_version_id = v.report_version_id) AS last_decision_at,
                   (SELECT MAX(s.created_at) FROM case_report_signoff s WHERE s.report_version_id = v.report_version_id) AS signed_off_at
            FROM case_report_version v LEFT JOIN case_report_item i USING (report_version_id)
            GROUP BY v.report_version_id ORDER BY v.imported_at DESC
            """
        ).fetchall()
    result = []
    for r in rows:
        row = {**dict(r), "clients": json.loads(r["clients_json"]), "filters": json.loads(r["filters_json"] or "{}"),
               "pending": r["pending"] or 0}
        row["last_activity_at"] = max(v for v in (r["imported_at"], r["last_decision_at"], r["signed_off_at"]) if v)
        result.append(row)
    return result


def list_families(database_path: Path) -> dict[str, Any]:
    """Versions grouped by report family, newest activity first (G21)."""
    families: dict[str, dict[str, Any]] = {}
    for version in list_versions(database_path):  # newest import first
        entry = {"report_version_id": version["report_version_id"], "status": version["status"],
                 "decided": version["items"] - version["pending"], "total": version["items"],
                 "imported_at": version["imported_at"], "last_activity_at": version["last_activity_at"],
                 "analysis_run_id": version["analysis_run_id"], "package_version": version["package_version"]}
        family = families.get(version["family_key"])
        if family is None:
            families[version["family_key"]] = {
                "family_key": version["family_key"], "title": version["title"], "clients": version["clients"],
                "date_from": version["date_from"], "date_to": version["date_to"], "filters": version["filters"],
                "promptbook": {"id": version["promptbook_id"], "version": version["promptbook_version"]},
                "latest": entry, "versions": [], "last_activity_at": version["last_activity_at"]}
        else:
            family["versions"].append(entry)
            family["last_activity_at"] = max(family["last_activity_at"], version["last_activity_at"])
    ordered = sorted(families.values(), key=lambda f: f["last_activity_at"], reverse=True)
    status_counts: dict[str, int] = {}
    for family in ordered:
        status_counts[family["latest"]["status"]] = status_counts.get(family["latest"]["status"], 0) + 1
    return {"families": ordered, "status_counts": status_counts}


def get_version(database_path: Path, version_id: str) -> dict[str, Any]:
    with _connect(database_path) as connection:
        version = dict(_version_row(connection, version_id))
        items = [dict(r) for r in connection.execute(
            "SELECT * FROM case_report_item WHERE report_version_id = ? ORDER BY sequence", (version_id,))]
        decisions = [dict(r) for r in connection.execute(
            "SELECT * FROM case_report_decision WHERE report_version_id = ? ORDER BY created_at", (version_id,))]
        signoffs = [dict(r) for r in connection.execute(
            "SELECT * FROM case_report_signoff WHERE report_version_id = ? ORDER BY created_at", (version_id,))]
        package = json.loads(version["package_json"])
        section_counts = connection.execute(
            "SELECT section_id, current_status, COUNT(*) AS item_count FROM case_report_item "
            "WHERE report_version_id = ? GROUP BY section_id, current_status", (version_id,)
        ).fetchall()
    counts_by_section: dict[str, dict[str, int]] = {}
    for row in section_counts:
        counts_by_section.setdefault(row["section_id"] or "", {})[row["current_status"]] = row["item_count"]
    sections = []
    seen_sections = set()
    item_by_key = {item["item_key"]: item for item in items}
    # Use the export package's ordered content builder so the review document follows the
    # exact same frozen section order and source content as the export renderers.
    from app.case_reports import exports
    section_sources = exports.build_section_data(package)
    built_sections = {source["template"].get("id"): source for source in section_sources}
    for section in _template_sections(package):
        section_id = section["id"]
        seen_sections.add(section_id)
        counts = counts_by_section.get(section_id, {})
        heading_source = section.get("heading") or section_id
        match = re.match(r"^\s*(\d+)\.\s*(.*)$", heading_source)
        number = match.group(1) if match else None
        heading = match.group(2) if match else heading_source
        section_items = [item for item in items if item.get("section_id") == section_id]
        total = len(section_items)
        decided = sum(item["current_status"] != "UNVALIDATED" for item in section_items)
        origin_values = {item.get("origin") for item in section_items if item.get("origin")}
        origin_note = None
        if origin_values == {"MODEL"}:
            origin_note = "Generated by the model; every item needs a decision."
        elif origin_values == {"COMPUTED"}:
            origin_note = "Computed from source data; shown for context."
        elif origin_values:
            origin_note = "Model-generated items need a decision; computed content is shown for context."
        source_blocks = (built_sections.get(section_id) or {}).get("blocks", [])
        blocks: list[dict[str, Any]] = []
        for block in source_blocks:
            block = dict(block)
            if block["type"] == "theme_group":
                theme = item_by_key.get(block.pop("theme_item_key", ""))
                block["theme_item_id"] = theme["item_id"] if theme else None
                for case in block.get("cases", []):
                    ids, summary = [], {"undecided": 0, "validated": 0, "revised": 0, "rejected": 0}
                    for key in case.pop("item_keys", []):
                        item = item_by_key.get(key)
                        if not item:
                            continue
                        ids.append(item["item_id"])
                        status_key = item["current_status"].lower()
                        summary[status_key if status_key != "unvalidated" else "undecided"] += 1
                    case["item_ids"] = ids
                    case["summary"] = summary
                blocks.append(block)
            else:
                key = block.pop("item_key", None)
                if key:
                    item = item_by_key.get(key)
                    block["item_id"] = item["item_id"] if item else None
                blocks.append(block)
        sections.append({"id": section_id, "number": number, "heading": heading,
                         "kind": section.get("kind") or "unknown", "origin_note": origin_note,
                         "review": {"decided": decided, "total": total, "needs_review": total > 0},
                         "blocks": blocks,
                         "item_counts": {s: counts.get(s, 0) for s in ("UNVALIDATED", *DISPOSITIONS)}})
    # Defensive fallback for items whose section was not in an older frozen package.
    for section_id, counts in counts_by_section.items():
        if section_id and section_id not in seen_sections:
            sections.append({"id": section_id, "number": None, "heading": section_id, "kind": "unknown",
                             "origin_note": None, "review": {"decided": sum(v for k, v in counts.items() if k != "UNVALIDATED"),
                                                                "total": sum(counts.values()), "needs_review": sum(counts.values()) > 0},
                             "blocks": [],
                             "item_counts": {s: counts.get(s, 0) for s in ("UNVALIDATED", *DISPOSITIONS)}})
    history: dict[str, list[dict[str, Any]]] = {}
    for d in decisions:
        history.setdefault(d["item_id"], []).append(d)
    for item in items:
        item["citations"] = json.loads(item.pop("citations_json"))
        item["detail"] = json.loads(item.pop("detail_json")) if item.get("detail_json") else None
        item["decisions"] = history.get(item["item_id"], [])
    version.pop("package_json")
    version["clients"] = json.loads(version.pop("clients_json"))
    return {**version, "payload_version": 2, "items": items, "sections": sections, "signoffs": signoffs,
            "status_counts": {s: sum(i["current_status"] == s for i in items) for s in ("UNVALIDATED", *DISPOSITIONS)}}


def export_inputs(database_path: Path, version_id: str) -> tuple[dict[str, Any], dict[str, dict[str, Any]], dict[str, int]]:
    """The frozen package plus the latest decision per item key, for ``exports.render_*``."""
    with _connect(database_path) as connection:
        version = _version_row(connection, version_id)
        rows = connection.execute(
            """
            SELECT i.item_key, i.current_status, d.revised_text, d.comment, d.reviewer_subject
            FROM case_report_item i
            LEFT JOIN case_report_decision d ON d.item_id = i.item_id
              AND d.created_at = (SELECT MAX(created_at) FROM case_report_decision WHERE item_id = i.item_id)
            WHERE i.report_version_id = ?
            """, (version_id,)).fetchall()
    decisions = {r["item_key"]: {"status": r["current_status"], "revised_text": r["revised_text"], "comment": r["comment"],
                                 "reviewer": r["reviewer_subject"]} for r in rows}
    counts: dict[str, int] = {}
    for r in rows:
        counts[r["current_status"]] = counts.get(r["current_status"], 0) + 1
    return json.loads(version["package_json"]), decisions, counts


def record_export(database_path: Path, version_id: str, requester: str, export_format: str, validated_only: bool,
                  counts: dict[str, int]) -> str:
    audit_id = str(uuid.uuid4())
    with _connect(database_path) as connection:
        connection.execute(
            "INSERT INTO case_report_export_audit (audit_id, report_version_id, requester_subject, export_format, validated_only, "
            "status_counts_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (audit_id, version_id, requester, export_format, int(validated_only), json.dumps(counts), _now()),
        )
    return audit_id


def list_exports(database_path: Path, version_id: str) -> list[dict[str, Any]]:
    with _connect(database_path) as connection:
        _version_row(connection, version_id)
        rows = connection.execute(
            "SELECT audit_id, report_version_id, requester_subject, export_format, validated_only, status_counts_json, created_at "
            "FROM case_report_export_audit WHERE report_version_id = ? ORDER BY created_at DESC, rowid DESC", (version_id,)
        ).fetchall()
    return [{**dict(row), "validated_only": bool(row["validated_only"]),
             "status_counts": json.loads(row["status_counts_json"])} for row in rows]
