import json
import logging
import sys
from datetime import datetime, timezone

_RESERVED = frozenset(vars(logging.makeLogRecord({})))


class JsonFormatter(logging.Formatter):
    """Render log records as single-line JSON for log ingestion."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        # Anything passed via logger.<level>(..., extra={...}) is attached here.
        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                payload[key] = value

        return json.dumps(payload, default=str)


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)

    # Route uvicorn/gunicorn loggers through the same JSON handler.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access", "gunicorn.error"):
        target = logging.getLogger(name)
        target.handlers = [handler]
        target.propagate = False
