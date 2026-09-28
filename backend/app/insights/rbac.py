"""Portable SQLite seed migration for insight-workflow authorization.

The schema intentionally stores external identities as opaque subject IDs. It does
not authenticate a request; production enforcement begins only after the identity
provider maps verified claims to ``principal_roles``.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path


MIGRATION_VERSION = "001_insight_rbac"

ROLES: dict[str, str] = {
    "analytics_viewer": "View aggregate snapshot analytics and system-generated candidates.",
    "insight_reviewer": "Review and decide candidate insights with a recorded rationale.",
    "action_owner": "Record progress and completion evidence for assigned remediation actions.",
    "data_owner": "Validate outcome measurements, baselines, and calculation context.",
    "finance_risk_approver": "Validate Finance/Risk values and approval evidence.",
    "platform_admin": "Assign application roles and inspect authorization audit events.",
}

PERMISSIONS: dict[str, str] = {
    "analytics.read": "Read aggregate snapshot analytics.",
    "insight.candidate.read": "Read system-generated insight candidates.",
    "insight.review.decide": "Validate, reject, or request more evidence for an insight.",
    "action.write": "Create or update remediation action progress/evidence.",
    "outcome.write": "Create or validate an outcome measurement.",
    "financial.validate": "Validate an estimated or realized Finance/Risk value.",
    "case_evidence.read": "Read authorized case-level evidence.",
    "attachment_evidence.read": "Read authorized attachment-derived evidence.",
    "role.assign": "Assign or revoke application roles.",
    "audit.read": "Read insight-workflow authorization audit events.",
}

ROLE_PERMISSIONS: dict[str, tuple[str, ...]] = {
    "analytics_viewer": ("analytics.read", "insight.candidate.read"),
    "insight_reviewer": ("analytics.read", "insight.candidate.read", "insight.review.decide", "case_evidence.read"),
    "action_owner": ("analytics.read", "insight.candidate.read", "action.write"),
    "data_owner": ("analytics.read", "insight.candidate.read", "outcome.write", "case_evidence.read"),
    "finance_risk_approver": ("analytics.read", "insight.candidate.read", "financial.validate"),
    "platform_admin": tuple(PERMISSIONS),
}


def initialize_sqlite(database_path: Path) -> None:
    """Create an idempotent local RBAC database and seed roles/permissions only."""
    database_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(database_path) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS schema_migration (
              version TEXT PRIMARY KEY,
              applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS role (
              role_id INTEGER PRIMARY KEY,
              role_key TEXT NOT NULL UNIQUE,
              description TEXT NOT NULL,
              is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS permission (
              permission_id INTEGER PRIMARY KEY,
              permission_key TEXT NOT NULL UNIQUE,
              description TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS role_permission (
              role_id INTEGER NOT NULL REFERENCES role(role_id),
              permission_id INTEGER NOT NULL REFERENCES permission(permission_id),
              granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (role_id, permission_id)
            );
            CREATE TABLE IF NOT EXISTS principal (
              principal_id INTEGER PRIMARY KEY,
              external_subject TEXT NOT NULL UNIQUE,
              display_name TEXT,
              is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS principal_role (
              principal_id INTEGER NOT NULL REFERENCES principal(principal_id),
              role_id INTEGER NOT NULL REFERENCES role(role_id),
              assigned_by_subject TEXT NOT NULL,
              assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              revoked_at TEXT,
              PRIMARY KEY (principal_id, role_id, assigned_at)
            );
            CREATE TABLE IF NOT EXISTS authorization_audit_event (
              audit_event_id INTEGER PRIMARY KEY,
              actor_subject TEXT NOT NULL,
              action TEXT NOT NULL,
              target_type TEXT NOT NULL,
              target_id TEXT NOT NULL,
              outcome TEXT NOT NULL CHECK (outcome IN ('ALLOWED', 'DENIED', 'RECORDED')),
              rationale TEXT,
              occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TRIGGER IF NOT EXISTS authorization_audit_event_immutable_update
            BEFORE UPDATE ON authorization_audit_event BEGIN SELECT RAISE(ABORT, 'audit events are immutable'); END;
            CREATE TRIGGER IF NOT EXISTS authorization_audit_event_immutable_delete
            BEFORE DELETE ON authorization_audit_event BEGIN SELECT RAISE(ABORT, 'audit events are immutable'); END;
            """
        )
        connection.executemany(
            "INSERT OR IGNORE INTO role(role_key, description) VALUES (?, ?)", ROLES.items()
        )
        connection.executemany(
            "INSERT OR IGNORE INTO permission(permission_key, description) VALUES (?, ?)", PERMISSIONS.items()
        )
        for role_key, permission_keys in ROLE_PERMISSIONS.items():
            for permission_key in permission_keys:
                connection.execute(
                    """
                    INSERT OR IGNORE INTO role_permission(role_id, permission_id)
                    SELECT r.role_id, p.permission_id FROM role r CROSS JOIN permission p
                    WHERE r.role_key = ? AND p.permission_key = ?
                    """,
                    (role_key, permission_key),
                )
        connection.execute("INSERT OR IGNORE INTO schema_migration(version) VALUES (?)", (MIGRATION_VERSION,))


def seed_summary(database_path: Path) -> dict[str, int]:
    """Return seed counts for deployment verification without exposing principals."""
    with sqlite3.connect(database_path) as connection:
        return {
            "roles": connection.execute("SELECT COUNT(*) FROM role").fetchone()[0],
            "permissions": connection.execute("SELECT COUNT(*) FROM permission").fetchone()[0],
            "role_permissions": connection.execute("SELECT COUNT(*) FROM role_permission").fetchone()[0],
            "principals": connection.execute("SELECT COUNT(*) FROM principal").fetchone()[0],
            "migrations": connection.execute("SELECT COUNT(*) FROM schema_migration").fetchone()[0],
            "audit_immutability_triggers": connection.execute(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'authorization_audit_event_immutable_%'"
            ).fetchone()[0],
        }
