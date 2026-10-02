"""Manage promptbooks until the editor UI exists (reference/44 §6).

    python scripts/promptbook_admin.py create  <document.json> --by <user> [--note "..."]
    python scripts/promptbook_admin.py activate <PROMPTBOOK_ID> <version>
    python scripts/promptbook_admin.py publish  <PROMPTBOOK_ID> <version> --by <user>
    python scripts/promptbook_admin.py show     <PROMPTBOOK_ID> [version]     # resolved document
    python scripts/promptbook_admin.py list     [PROMPTBOOK_ID]
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402
from app.promptbooks.resolve import resolve  # noqa: E402
from app.promptbooks.store import activate, create_version, initialize_store, list_versions  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("create")
    create.add_argument("document")
    create.add_argument("--by", required=True)
    create.add_argument("--note", default="")
    act = sub.add_parser("activate")
    act.add_argument("promptbook_id")
    act.add_argument("version", type=int)
    pub = sub.add_parser("publish")
    pub.add_argument("promptbook_id")
    pub.add_argument("version", type=int)
    pub.add_argument("--by", required=True)
    show = sub.add_parser("show")
    show.add_argument("promptbook_id")
    show.add_argument("version", type=int, nargs="?")
    lst = sub.add_parser("list")
    lst.add_argument("promptbook_id", nargs="?")
    args = parser.parse_args()

    database = settings.report_workflow_db_path
    initialize_store(database)
    if args.command == "create":
        document = json.loads(Path(args.document).read_text(encoding="utf-8"))
        version = create_version(database, document, args.by, args.note)
        resolved = resolve(database, document["meta"]["promptbook_id"], version)  # fails fast on an invalid document
        print({"promptbook_id": resolved["promptbook_id"], "version": version, "status": "DRAFT",
               "resolved_hash": resolved["resolved_hash"], "lens_hash": resolved["lens_hash"]})
    elif args.command == "activate":
        activate(database, args.promptbook_id, args.version)
        print({"promptbook_id": args.promptbook_id, "version": args.version, "status": "ACTIVE"})
    elif args.command == "publish":
        from app.promptbooks.publish import publish
        print(publish(database, args.promptbook_id, args.version, args.by))
    elif args.command == "show":
        print(json.dumps(resolve(database, args.promptbook_id, args.version), indent=1))
    else:
        for row in list_versions(database, args.promptbook_id):
            print(row)


if __name__ == "__main__":
    main()
