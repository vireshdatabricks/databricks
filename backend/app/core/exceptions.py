import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("app.errors")


class AppError(Exception):
    """Base application error. Raise this (or a subclass) anywhere; the global handler responds."""

    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    message: str = "Internal server error"

    def __init__(self, message: str | None = None, *, status_code: int | None = None, details: dict | None = None):
        self.message = message or self.message
        if status_code is not None:
            self.status_code = status_code
        self.details = details
        super().__init__(self.message)


class BadRequestError(AppError):
    status_code = status.HTTP_400_BAD_REQUEST
    message = "Bad request"


class UnauthorizedError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    message = "Unauthorized"


class ForbiddenError(AppError):
    status_code = status.HTTP_403_FORBIDDEN
    message = "Forbidden"


class NotFoundError(AppError):
    status_code = status.HTTP_404_NOT_FOUND
    message = "Resource not found"


class ConflictError(AppError):
    status_code = status.HTTP_409_CONFLICT
    message = "Conflict"


class UnprocessableEntityError(AppError):
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    message = "Unprocessable entity"


class ServiceUnavailableError(AppError):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    message = "Upstream data service unavailable"


class QueryFailedError(ServiceUnavailableError):
    """The warehouse was reachable but rejected or failed the query (e.g. an unknown column).

    Subclasses ServiceUnavailableError so existing callers keep their 503 behaviour; callers that
    need to tell a broken query from an unreachable service catch this first.
    """

    message = "The analytics query failed"


def _error_body(status_code: int, message: str, path: str) -> dict:
    return {"status_code": status_code, "message": message, "path": path}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError):
        context = {"method": request.method, "path": request.url.path, "status_code": exc.status_code}
        if exc.status_code >= 500:
            logger.error(exc.message, extra=context)
        else:
            logger.warning(exc.message, extra=context)

        body = _error_body(exc.status_code, exc.message, request.url.path)
        if exc.details:
            body["details"] = exc.details
        return JSONResponse(status_code=exc.status_code, content=body)

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        context = {"method": request.method, "path": request.url.path, "status_code": exc.status_code}
        if exc.status_code >= 500:
            logger.error("HTTP error handling request", extra=context)
        else:
            logger.warning("HTTP error handling request", extra=context)

        # Structured details ({code, message, errors, ...}) are passed through as `detail` so clients
        # can read field errors and codes; `message` stays a plain sentence.
        if isinstance(exc.detail, dict):
            message = str(exc.detail.get("message") or "Request failed.")
            body = _error_body(exc.status_code, message, request.url.path)
            body["detail"] = exc.detail
            return JSONResponse(status_code=exc.status_code, content=body)
        message = "The requested resource was not found." if exc.status_code == 404 else str(exc.detail)
        return JSONResponse(status_code=exc.status_code, content=_error_body(exc.status_code, message, request.url.path))

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        logger.warning(
            "Request validation failed",
            extra={"method": request.method, "path": request.url.path, "errors": exc.errors()},
        )
        return JSONResponse(
            status_code=422,
            content={"status_code": 422, "message": "Validation error", "path": request.url.path, "errors": exc.errors()},
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        logger.exception(
            "Unhandled server error",
            extra={"method": request.method, "path": request.url.path},
        )
        return JSONResponse(status_code=500, content=_error_body(500, "Internal server error", request.url.path))
