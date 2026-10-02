"""Export a report snapshot package to HTML and Excel (reference/44 §10).

    python scripts/export_case_report.py <analysis_run_id> [--out data/exports] [--validated-only]

The package is read from Databricks ``gold_report_snapshot_package``. Output contains
confidential case text; the default folder ``backend/data/exports`` is git-ignored.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.case_reports.exports import render_excel, render_html  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.databricks_client import run_query  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("analysis_run_id")
    parser.add_argument("--out", default=str(Path(__file__).resolve().parents[1] / "data" / "exports"))
    parser.add_argument("--validated-only", action="store_true")
    args = parser.parse_args()

    rows = run_query(
        f"SELECT package_json, package_version FROM {settings.databricks_catalog}.{settings.databricks_schema}.gold_report_snapshot_package "
        "WHERE analysis_run_id = :run_id ORDER BY package_version DESC LIMIT 1",
        {"run_id": args.analysis_run_id},
    )
    if not rows:
        raise SystemExit(f"No snapshot package for run {args.analysis_run_id}")
    package = json.loads(rows[0]["package_json"])
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    stem = f"report_{args.analysis_run_id[:8]}_v{rows[0]['package_version']}" + ("_validated" if args.validated_only else "")
    (out / f"{stem}.html").write_text(render_html(package), encoding="utf-8")
    (out / f"{stem}.xlsx").write_bytes(render_excel(package, validated_only=args.validated_only))
    print({"html": str(out / f"{stem}.html"), "excel": str(out / f"{stem}.xlsx")})


if __name__ == "__main__":
    main()
