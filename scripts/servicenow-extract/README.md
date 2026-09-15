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

## Run

```powershell
npm run extract
```

Runs headful (visible browser window) by default so you can watch the login/navigation and confirm the table
selectors match. Once the flow is verified, set `SN_HEADLESS=true` in `.env` to run it headless (e.g. in CI or
on a schedule).

Output is written to `output/servicenow-report-<timestamp>.json` (gitignored).

## Notes

- Table headers are read dynamically from the report's `<table>` at runtime — no need to hardcode column names.
- If the report renders inside a classic UI frame (`gsft_main`), the script automatically targets that frame.
- If your instance uses SSO instead of the local ServiceNow login form, `src/login.ts` will need to be adapted.
