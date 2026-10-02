"""Publish an ACTIVE promptbook version to Databricks ``ref_promptbook`` (reference/44 §6.4).

Publication is one-way and idempotent: a version already published is left unchanged,
and any other published version of the same promptbook is marked RETIRED.
"""
from __future__ import annotations

import json
from pathlib import Path

from app.core.config import settings
from app.core.databricks_client import run_query
from app.promptbooks.resolve import resolve
from app.promptbooks.store import get_version, mark_published


def _table() -> str:
    return f"{settings.databricks_catalog}.{settings.databricks_schema}.ref_promptbook"


def publish(database_path: Path, promptbook_id: str, version: int, published_by: str) -> dict:
    stored = get_version(database_path, promptbook_id, version)
    if stored.get("published_at"):
        resolved = resolve(database_path, promptbook_id, version)
        return {"promptbook_id": promptbook_id, "version": version, "resolved_hash": resolved["resolved_hash"],
                "lens_hash": resolved["lens_hash"], "published_at": stored["published_at"]}
    resolved = resolve(database_path, promptbook_id, version)
    if resolved["status"] != "ACTIVE":
        raise PermissionError(f"only ACTIVE versions are published; {promptbook_id} v{version} is {resolved['status']}")
    base = resolved["base"] or {}
    run_query(
        f"""
        MERGE INTO {_table()} t
        USING (SELECT :promptbook_id AS promptbook_id, CAST(:version AS INT) AS promptbook_version) s
        ON t.promptbook_id = s.promptbook_id AND t.promptbook_version = s.promptbook_version
        WHEN NOT MATCHED THEN INSERT (promptbook_id, promptbook_version, base_promptbook_id, base_promptbook_version,
          resolved_json, resolved_hash, lens_hash, status, published_by, published_at)
        VALUES (:promptbook_id, CAST(:version AS INT), :base_id, CAST(:base_version AS INT), :resolved_json,
          :resolved_hash, :lens_hash, 'ACTIVE', :published_by, current_timestamp())
        """,
        {"promptbook_id": promptbook_id, "version": version, "base_id": base.get("promptbook_id"),
         "base_version": base.get("version"), "resolved_json": json.dumps(resolved["document"], sort_keys=True),
         "resolved_hash": resolved["resolved_hash"], "lens_hash": resolved["lens_hash"], "published_by": published_by},
    )
    run_query(
        f"UPDATE {_table()} SET status = 'RETIRED' WHERE promptbook_id = :promptbook_id AND promptbook_version <> CAST(:version AS INT)",
        {"promptbook_id": promptbook_id, "version": version},
    )
    mark_published(database_path, promptbook_id, version)
    return {"promptbook_id": promptbook_id, "version": version, "resolved_hash": resolved["resolved_hash"],
            "lens_hash": resolved["lens_hash"]}
