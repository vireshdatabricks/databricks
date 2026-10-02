"""Promptbook report review API (reference/44 §9-10).

Reviewer identity uses the same local placeholder header as the other review workflows until
Entra ID claims are mapped to ``insight.review.decide`` (open question).
"""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Header, HTTPException, Query, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field
from fastapi.routing import APIRoute

from app.case_reports import exports, review, requests as report_requests
from app.core.config import settings
from app.core.databricks_client import run_query
from app.promptbooks import store as promptbook_store

class StructuredErrorRoute(APIRoute):
    def get_route_handler(self):
        original = super().get_route_handler()

        async def handler(request: Request):
            try:
                return await original(request)
            except RequestValidationError as exc:
                errors = [{"path": ".".join(str(part) for part in error.get("loc", ())[1:]),
                           "message": error.get("msg", "Invalid value")} for error in exc.errors()]
                return JSONResponse(status_code=422, content={"detail": {"code": "INVALID_INPUT",
                    "message": "Request validation failed", "errors": errors}})

        return handler


router = APIRouter(route_class=StructuredErrorRoute)
router.include_router(report_requests.router)


def _db():
    review.initialize(settings.report_workflow_db_path)
    return settings.report_workflow_db_path


def _actor(x_report_reviewer: str | None) -> str:
    return x_report_reviewer or "LOCAL_DEVELOPMENT_BUSINESS_REVIEWER"


class ImportRequest(BaseModel):
    analysis_run_id: str = Field(min_length=36, max_length=36)


class DecisionRequest(BaseModel):
    disposition: Literal["VALIDATED", "REVISED", "REJECTED"]
    comment: str | None = Field(default=None, max_length=4000)
    revised_text: str | None = Field(default=None, max_length=20000)


class PrefillRequest(BaseModel):
    from_report_version_id: str = Field(min_length=1)


class BulkThemeDecisionRequest(BaseModel):
    disposition: Literal["VALIDATED"]
    comment: str | None = Field(default=None, max_length=4000)
    exclude_item_ids: list[str] = Field(default_factory=list)


class CaseFieldOverride(BaseModel):
    item_id: str = Field(min_length=1)
    disposition: Literal["REVISED", "REJECTED"]
    revised_text: str | None = Field(default=None, max_length=20000)
    comment: str | None = Field(default=None, max_length=4000)


class CaseDecisionRequest(BaseModel):
    # None: save field overrides only, allowed once the rest of the case is decided (RP3e).
    disposition: Literal["VALIDATED", "REJECTED"] | None = None
    comment: str | None = Field(default=None, max_length=4000)
    field_overrides: list[CaseFieldOverride] = Field(default_factory=list)


class SignoffRequest(BaseModel):
    statement: str = Field(min_length=1, max_length=4000)


def _errors(exc: Exception) -> HTTPException:
    if isinstance(exc, LookupError):
        return HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": str(exc)})
    if isinstance(exc, PermissionError):
        return HTTPException(status_code=409, detail={"code": "STATE_CONFLICT", "message": str(exc)})
    message = str(exc)
    path = next((candidate for marker, candidate in (
        ("revised text", "revised_text"), ("rejection", "comment"), ("disposition", "disposition"),
        ("evidence answers", "disposition"), ("choose validate or reject", "disposition"),
        ("pre-fill source", "from_report_version_id"), ("exclude_item_ids", "exclude_item_ids"),
        ("sign-off statement", "statement"),
        ("field_overrides", "field_overrides"), ("field override", "field_overrides"),
    ) if marker in message.lower()), "")
    return HTTPException(status_code=422, detail={"code": "INVALID_INPUT", "message": message,
                                                   "errors": [{"path": path, "message": message}]})


@router.post("/import", status_code=status.HTTP_201_CREATED)
def import_report(request: ImportRequest, x_report_reviewer: str | None = Header(default=None)):
    rows = run_query(
        f"SELECT package_json, package_hash FROM {settings.databricks_catalog}.{settings.databricks_schema}.gold_report_snapshot_package "
        "WHERE analysis_run_id = :run_id ORDER BY package_version DESC LIMIT 1",
        {"run_id": request.analysis_run_id},
    )
    if not rows:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND",
            "message": f"No snapshot package for analysis run {request.analysis_run_id}."})
    return review.import_package(_db(), rows[0]["package_json"], rows[0]["package_hash"], _actor(x_report_reviewer))


@router.get("")
def list_reports(group: Literal["version", "family"] = Query(default="version")):
    if group == "family":
        result = review.list_families(_db())
        promptbook_store.initialize_store(_db())
        names = promptbook_store.display_names(_db())
        for family in result["families"]:
            book = family["promptbook"]
            book["name"] = names.get((book["id"], book["version"]))
        return {"data": result}
    return {"data": review.list_versions(_db())}


@router.get("/{report_version_id}")
def get_report(report_version_id: str):
    try:
        return {"data": review.get_version(_db(), report_version_id)}
    except Exception as exc:
        raise _errors(exc) from exc


@router.post("/{report_version_id}/items/{item_id}/decisions", status_code=status.HTTP_201_CREATED)
def post_decision(report_version_id: str, item_id: str, request: DecisionRequest, x_report_reviewer: str | None = Header(default=None)):
    try:
        return review.record_decision(_db(), report_version_id, item_id, _actor(x_report_reviewer), request.disposition,
                                      request.comment, request.revised_text)
    except Exception as exc:
        raise _errors(exc) from exc


@router.post("/{report_version_id}/themes/{theme_id}/decisions")
def post_theme_decisions(report_version_id: str, theme_id: str, request: BulkThemeDecisionRequest,
                         x_report_reviewer: str | None = Header(default=None)):
    try:
        return review.validate_theme(_db(), report_version_id, theme_id, _actor(x_report_reviewer), request.comment,
                                     request.exclude_item_ids)
    except Exception as exc:
        raise _errors(exc) from exc


@router.post("/{report_version_id}/cases/{case_number}/decisions")
def post_case_decisions(report_version_id: str, case_number: str, request: CaseDecisionRequest,
                        x_report_reviewer: str | None = Header(default=None)):
    try:
        return review.decide_case(_db(), report_version_id, case_number, _actor(x_report_reviewer), request.disposition,
                                  request.comment, [override.model_dump() for override in request.field_overrides])
    except Exception as exc:
        raise _errors(exc) from exc


@router.post("/{report_version_id}/prefill")
def post_prefill(report_version_id: str, request: PrefillRequest | None = None,
                 preview: bool = Query(default=False), x_report_reviewer: str | None = Header(default=None)):
    if request is None:
        raise HTTPException(status_code=422, detail={"code": "INVALID_INPUT", "message": "from_report_version_id is required",
                                                     "errors": [{"path": "from_report_version_id", "message": "Field required"}]})
    try:
        if preview:
            return review.prefill_preview(_db(), report_version_id, request.from_report_version_id)
        return review.prefill_from(_db(), report_version_id, request.from_report_version_id, _actor(x_report_reviewer))
    except Exception as exc:
        raise _errors(exc) from exc


@router.get("/{report_version_id}/prefill-sources")
def get_prefill_sources(report_version_id: str):
    try:
        return {"data": review.prefill_sources(_db(), report_version_id)}
    except Exception as exc:
        raise _errors(exc) from exc


@router.post("/{report_version_id}/signoff", status_code=status.HTTP_201_CREATED)
def post_signoff(report_version_id: str, request: SignoffRequest, x_report_reviewer: str | None = Header(default=None)):
    try:
        return review.sign_off(_db(), report_version_id, _actor(x_report_reviewer), request.statement)
    except Exception as exc:
        raise _errors(exc) from exc


@router.get("/{report_version_id}/export")
def get_export(report_version_id: str, export_format: Literal["html", "xlsx"] = Query(alias="format"),
               validated_only: bool = False, x_report_reviewer: str | None = Header(default=None)):
    try:
        package, decisions, counts = review.export_inputs(_db(), report_version_id)
        report_status = review.get_version(_db(), report_version_id)["status"]
    except Exception as exc:
        raise _errors(exc) from exc
    review.record_export(_db(), report_version_id, _actor(x_report_reviewer), export_format, validated_only, counts)
    stem = f"report_{package['run']['analysis_run_id'][:8]}_{report_version_id[:8]}" + ("_validated" if validated_only else "")
    if export_format == "html":
        content = exports.render_html(package, decisions, validated_only, report_status)
        return Response(content, media_type="text/html; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="{stem}.html"'})
    content = exports.render_excel(package, decisions, validated_only, report_status)
    return Response(content, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="{stem}.xlsx"'})


@router.get("/{report_version_id}/exports")
def get_exports(report_version_id: str):
    try:
        return {"data": review.list_exports(_db(), report_version_id)}
    except Exception as exc:
        raise _errors(exc) from exc
