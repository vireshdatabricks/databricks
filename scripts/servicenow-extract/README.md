# servicenow-extract

Standalone Playwright script that logs into ServiceNow, opens a report, and saves the rendered table data as JSON.

## Setup

```powershell
cd scripts/servicenow-extract
npm install
npm run install-browsers
Copy-Item .env.example .env
# edit .env and fill in SN_USERNAME / SN_PASSWORD
```

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `SN_INSTANCE_URL` | yes | ServiceNow instance base URL |
| `SN_REPORT_URL` | yes | Full URL of the report to scrape |
| `SN_USERNAME` / `SN_PASSWORD` | yes | ServiceNow login credentials |
| `SN_OUTPUT_DIR` | no | Local output folder (default `output`) |
| `SN_HEADLESS` | no | `true` to run headless (default `false`) |
| `SN_UPLOAD_TO_DATABRICKS` | no | Set to `false` to skip the post-scrape Databricks upload (default `true`) |
| `AZURE_TENANT_ID` | for upload | Azure AD (Entra ID) tenant ID of the app registration |
| `AZURE_CLIENT_ID` | for upload | Azure AD app registration (client) ID |
| `AZURE_CLIENT_SECRET` | for upload | Azure AD app registration client secret — **never commit this**, set it only in your local `.env` |
| `DATABRICKS_HOST` | for upload | Databricks workspace URL, e.g. `https://adb-xxxx.xx.azuredatabricks.net` |
| `DATABRICKS_VOLUME_PATH` | for upload | Unity Catalog volume path, e.g. `/Volumes/catalog/schema/volume` |

The Azure AD app registration must be added to the Databricks workspace/account as a service principal with
write access on the target volume.

## Run

```powershell
npm run extract
```

Runs headful (visible browser window) by default so you can watch the login/navigation and confirm the table
selectors match. Once the flow is verified, set `SN_HEADLESS=true` in `.env` to run it headless (e.g. in CI or
on a schedule).

Output is written to `output/servicenow-report-<timestamp>.json` (gitignored). After a successful scrape, the
CSV is also uploaded to the configured Databricks Unity Catalog volume unless `SN_UPLOAD_TO_DATABRICKS=false`.

To test the Databricks upload against files already downloaded locally (e.g. `output/attachments/`), run:

```powershell
npm run upload-attachments
```

This walks `output/attachments/` recursively and uploads each file to `<DATABRICKS_VOLUME_PATH>/attachments/...`,
preserving the per-task folder structure.

To (re-)upload the case report CSVs already in `output/` (without re-scraping), run:

```powershell
npm run upload-cases
```

This uploads every `*.csv` directly under `output/` to `<DATABRICKS_VOLUME_PATH>/cases/...`.

## Notes

- Table headers are read dynamically from the report's `<table>` at runtime — no need to hardcode column names.
- If the report renders inside a classic UI frame (`gsft_main`), the script automatically targets that frame.
- If your instance uses SSO instead of the local ServiceNow login form, `src/login.ts` will need to be adapted.
- The Databricks upload authenticates via Azure AD client-credentials (client ID + secret), then calls the
  Databricks Files API to `PUT` the CSV into the volume.
