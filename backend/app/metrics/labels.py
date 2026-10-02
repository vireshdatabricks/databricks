"""Reviewer labels for recurrence match pairs and the precision they produce (reference/51 §4.3, RC-02).

A frozen random sample per rule version and tier fixes the denominator, so a reviewer cannot pick
which pairs count. Labels are append-only (triggers); a changed opinion is a new row and the latest
row per pair and reviewer counts.
"""
from __future__ import annotations

import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

VERDICTS = ("SAME_ISSUE", "DIFFERENT_ISSUE", "UNSURE")
TIERS = ("A", "B")


def initialize(database_path: Path) -> None:
    database_path.parent.mkdir(parents=True, exist_ok=True)
    with _connect(database_path) as con:
        con.executescript("""
            CREATE TABLE IF NOT EXISTS recurrence_label_sample (
              rule_version TEXT NOT NULL, tier TEXT NOT NULL, position INTEGER NOT NULL, pair_id TEXT NOT NULL,
              as_of_week TEXT NOT NULL, sampled_at TEXT NOT NULL,
              PRIMARY KEY (rule_version, tier, position), UNIQUE (rule_version, pair_id)
            );
            CREATE TABLE IF NOT EXISTS recurrence_pair_label (
              label_id TEXT PRIMARY KEY, pair_id TEXT NOT NULL, rule_version TEXT NOT NULL, match_tier TEXT NOT NULL,
              verdict TEXT NOT NULL CHECK (verdict IN ('SAME_ISSUE', 'DIFFERENT_ISSUE', 'UNSURE')),
              comment TEXT, reviewer TEXT NOT NULL, labelled_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS recurrence_pair_label_pair ON recurrence_pair_label(rule_version, pair_id, reviewer);
            CREATE TRIGGER IF NOT EXISTS recurrence_label_sample_no_update BEFORE UPDATE ON recurrence_label_sample
            BEGIN SELECT RAISE(ABORT, 'label samples are frozen'); END;
            CREATE TRIGGER IF NOT EXISTS recurrence_label_sample_no_delete BEFORE DELETE ON recurrence_label_sample
            BEGIN SELECT RAISE(ABORT, 'label samples are frozen'); END;
            CREATE TRIGGER IF NOT EXISTS recurrence_pair_label_no_update BEFORE UPDATE ON recurrence_pair_label
            BEGIN SELECT RAISE(ABORT, 'match labels are immutable'); END;
            CREATE TRIGGER IF NOT EXISTS recurrence_pair_label_no_delete BEFORE DELETE ON recurrence_pair_label
            BEGIN SELECT RAISE(ABORT, 'match labels are immutable'); END;
        """)


@contextmanager
def _connect(database_path: Path):
    con = sqlite3.connect(database_path, timeout=15)
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    finally:
        con.close()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_sample(database_path: Path, rule_version: str, tier: str, as_of_week: str, candidates: Callable[[], list[str]]) -> list[str]:
    """Return the frozen sample, drawing it once from ``candidates`` (an ordered, reproducible list)."""
    with _connect(database_path) as con:
        rows = con.execute("SELECT pair_id FROM recurrence_label_sample WHERE rule_version = ? AND tier = ? ORDER BY position",
                           (rule_version, tier)).fetchall()
    if rows:
        return [row["pair_id"] for row in rows]
    drawn = candidates()
    now = _now()
    with _connect(database_path) as con:
        con.execute("BEGIN IMMEDIATE")
        if con.execute("SELECT 1 FROM recurrence_label_sample WHERE rule_version = ? AND tier = ?", (rule_version, tier)).fetchone() is None:
            con.executemany("INSERT INTO recurrence_label_sample (rule_version, tier, position, pair_id, as_of_week, sampled_at) VALUES (?, ?, ?, ?, ?, ?)",
                            [(rule_version, tier, position, pair_id, as_of_week, now) for position, pair_id in enumerate(drawn, 1)])
        rows = con.execute("SELECT pair_id FROM recurrence_label_sample WHERE rule_version = ? AND tier = ? ORDER BY position",
                           (rule_version, tier)).fetchall()
    return [row["pair_id"] for row in rows]


def sample_tier(database_path: Path, rule_version: str, pair_id: str) -> str | None:
    with _connect(database_path) as con:
        row = con.execute("SELECT tier FROM recurrence_label_sample WHERE rule_version = ? AND pair_id = ?", (rule_version, pair_id)).fetchone()
    return row["tier"] if row else None


def record_label(database_path: Path, rule_version: str, pair_id: str, verdict: str, comment: str | None, reviewer: str) -> dict[str, Any]:
    if verdict not in VERDICTS:
        raise ValueError("verdict must be SAME_ISSUE, DIFFERENT_ISSUE, or UNSURE")
    tier = sample_tier(database_path, rule_version, pair_id)
    if tier is None:
        raise LookupError("Only pairs in the frozen label sample can be labelled.")
    label = {"label_id": str(uuid.uuid4()), "pair_id": pair_id, "rule_version": rule_version, "match_tier": tier,
             "verdict": verdict, "comment": (comment or "").strip() or None, "reviewer": reviewer, "labelled_at": _now()}
    with _connect(database_path) as con:
        con.execute("INSERT INTO recurrence_pair_label (label_id, pair_id, rule_version, match_tier, verdict, comment, reviewer, labelled_at) "
                    "VALUES (:label_id, :pair_id, :rule_version, :match_tier, :verdict, :comment, :reviewer, :labelled_at)", label)
    return label


def _latest(con: sqlite3.Connection, rule_version: str) -> list[sqlite3.Row]:
    return con.execute("""
        SELECT l.pair_id, l.match_tier, l.reviewer, l.verdict FROM recurrence_pair_label l
        JOIN recurrence_label_sample s ON s.rule_version = l.rule_version AND s.pair_id = l.pair_id
        WHERE l.rule_version = ? AND l.labelled_at = (
          SELECT MAX(x.labelled_at) FROM recurrence_pair_label x
          WHERE x.rule_version = l.rule_version AND x.pair_id = l.pair_id AND x.reviewer = l.reviewer)
    """, (rule_version,)).fetchall()


def precision(database_path: Path, rule_version: str, min_labels: int) -> dict[str, dict[str, Any]]:
    with _connect(database_path) as con:
        sampled = {row["tier"]: row["n"] for row in con.execute(
            "SELECT tier, COUNT(*) AS n FROM recurrence_label_sample WHERE rule_version = ? GROUP BY tier", (rule_version,))}
        latest = _latest(con, rule_version)
    result = {}
    for tier in TIERS:
        rows = [row for row in latest if row["match_tier"] == tier]
        same = sum(row["verdict"] == "SAME_ISSUE" for row in rows)
        different = sum(row["verdict"] == "DIFFERENT_ISSUE" for row in rows)
        unsure = sum(row["verdict"] == "UNSURE" for row in rows)
        decided = same + different
        # Agreement: pairs with decided verdicts from two or more reviewers that all match.
        by_pair: dict[str, list[str]] = {}
        for row in rows:
            if row["verdict"] != "UNSURE":
                by_pair.setdefault(row["pair_id"], []).append(row["verdict"])
        multi = [set(verdicts) for verdicts in by_pair.values() if len(verdicts) >= 2]
        measured = decided >= min_labels
        result[tier] = {
            "tier": tier, "sampled_pairs": sampled.get(tier, 0), "labelled_pairs": len({row["pair_id"] for row in rows}),
            "same_issue": same, "different_issue": different, "unsure": unsure, "decided_labels": decided, "min_labels": min_labels,
            "precision": round(same / decided, 4) if decided else None,
            "false_positive_rate": round(different / decided, 4) if decided else None,
            "status": "DIRECT" if measured else "CANDIDATE",
            "reviewer_agreement": round(sum(len(v) == 1 for v in multi) / len(multi), 4) if multi else None,
        }
    return result


def next_pair(database_path: Path, rule_version: str, reviewer: str) -> tuple[str | None, dict[str, dict[str, int]]]:
    """Next sampled pair this reviewer has not labelled, taking the tier where they have done least."""
    with _connect(database_path) as con:
        rows = con.execute("""
            SELECT s.tier, s.position, s.pair_id,
                   EXISTS (SELECT 1 FROM recurrence_pair_label l WHERE l.rule_version = s.rule_version AND l.pair_id = s.pair_id AND l.reviewer = ?) AS done
            FROM recurrence_label_sample s WHERE s.rule_version = ? ORDER BY s.tier, s.position
        """, (reviewer, rule_version)).fetchall()
    progress = {tier: {"labelled": sum(r["done"] for r in rows if r["tier"] == tier), "sampled": sum(r["tier"] == tier for r in rows)} for tier in TIERS}
    open_rows = [row for row in rows if not row["done"]]
    if not open_rows:
        return None, progress
    tier = min({row["tier"] for row in open_rows}, key=lambda t: (progress[t]["labelled"], t))
    return next(row["pair_id"] for row in open_rows if row["tier"] == tier), progress


def reviewer_labels(database_path: Path, rule_version: str, pair_id: str) -> list[dict[str, Any]]:
    with _connect(database_path) as con:
        return [dict(row) for row in con.execute(
            "SELECT verdict, comment, reviewer, labelled_at FROM recurrence_pair_label WHERE rule_version = ? AND pair_id = ? ORDER BY labelled_at",
            (rule_version, pair_id))]
