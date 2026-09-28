"""Create the local SQLite RBAC foundation for the insight workflow."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.insights.rbac import initialize_sqlite, seed_summary


if __name__ == "__main__":
    database = Path(__file__).resolve().parents[1] / "data" / "insight_workflow.sqlite3"
    initialize_sqlite(database)
    print({"database": str(database), **seed_summary(database)})
