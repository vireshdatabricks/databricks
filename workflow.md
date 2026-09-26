# Analytics and Frontend Endpoint Contracts

## Purpose

This is the implementation handoff for an agent building the API and frontend. It describes the Phase 1 contracts exposed by the Databricks pipeline. It does not claim availability for deferred event, SLA/PG, recurrence-validation, or insight-review use cases.

## Data-ingestion contracts

| Delivery | Destination | Accepted format | Required filename | Grain | Rejection rule |
|---|---|---|---|---|---|
| Case tasks | `/Volumes/trend_analysis/trend_default/uploads/case_tasks/` | CP1252 CSV, 56 canonical columns | `case_tasks_<13-digit-epoch-ms>.csv` | One task row | Reject anything other than a new CSV with the canonical header. |
| Case subtasks | `/Volumes/trend_analysis/trend_default/uploads/case_subtasks/` | UTF-8 CSV, 72 canonical columns, converted from the ServiceNow Excel export | `case_subtasks_<13-digit-epoch-ms>.csv` | One subtask row | Reject `.xlsx`, changed headers, and non-CSV files. |

Both extracts are immutable weekly snapshots. A record missing from a later file is not a deletion. The conversion must preserve quoted multiline text; subtask date values remain Excel serials until a future approved contract changes both source conversion and parser.

## Consumer API boundary

The frontend should call a read-only API service, not Databricks tables directly. The service queries the published Gold tables and returns JSON. All endpoints accept `as_of_week` (`YYYY-MM-DD`); omit it to use the latest complete published week. Return `404` when a requested week is unavailable and `422` for an invalid filter or date.

| Endpoint | Primary Gold source | Required response fields | Supported filters |
|---|---|---|---|
| `GET /api/v1/analytics/summary` | `gold_case_fact`, `gold_task_fact` | `as_of_week`, case/task totals, open totals, closed totals, source coverage note | `client_account`, `line_of_business`, `assignment_group` |
| `GET /api/v1/analytics/case-trends` | `gold_case_trend_monthly` | `report_month`, dimensions, `opened_case_count`, `closed_case_count`, TAT averages | `client_account`, `category`, `case_type`, `subtype`, `root_cause` |
| `GET /api/v1/analytics/task-trends` | `gold_task_trend_monthly` | `report_month`, dimensions, `opened_task_count`, `closed_task_count`, TAT averages | `assignment_group`, `state`, `category`, `type`, `subtype` |
| `GET /api/v1/analytics/themes` | `gold_theme_candidate` | `theme_id`, `theme_label`, `case_count`, `occurrence_rate`, `meets_min_support`, `method_type` | `category`, `root_cause`, `min_support` |
| `GET /api/v1/analytics/themes/{theme_id}/cases` | `gold_theme_case_link`, `gold_case_fact` | `theme_id`, `case_number`, case context, membership basis | `as_of_week` |
| `GET /api/v1/analytics/cases/{case_number}` | `gold_case_fact`, `silver_case_narrative_segments` | case detail, current attributes, durations, source file, narrative evidence | `as_of_week` |
| `GET /api/v1/analytics/metadata` | Published Gold tables | available weeks, refresh timestamp, logic version, supported metrics, data limitations | none |

## Response conventions

Every successful response must include:

```json
{
  "as_of_week": "2026-09-21",
  "logic_version": "phase1-v1",
  "data_quality_status": "LIMITED_TO_SNAPSHOT_CSV",
  "data": []
}
```

Use cursor pagination for detail lists: `limit` defaults to `50`, maximum `200`, and `next_cursor` is omitted when there are no further records. Never expose narrative text unless the caller is authorized to see case-level information.

## Frontend scope

The first frontend should have four views:

1. **Overview** — case/task counts, open workload, period selector, and freshness/data-limit banner.
2. **Trends** — monthly opened/closed volume and duration charts, with shared dimensions and filter state in the URL.
3. **Themes** — ranked deterministic root-cause themes; clearly label them as candidates, not validated findings.
4. **Case evidence** — authorized drill-down from a theme to case facts and source-derived narrative segments.

Do not show controls or claims for first response, assignment timing, inactivity, true handoffs, reopen rate, contractual SLA/PG, financial exposure, or validated recurrence. Those endpoints remain out of scope until their source contracts are delivered and approved.

## Security and operational requirements

- Authenticate every API request and apply role-based access before returning case-level data.
- The API identity is read-only against Gold/Silver consumption views; upload and pipeline-state volumes are never frontend-accessible.
- Publish a week only after the two Bronze jobs, two Silver jobs, and Gold job complete successfully with reconciliation checks.
- Include the source-file reference and logic version in detail responses for traceability.