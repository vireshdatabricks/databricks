import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { config } from "./config";
import { login } from "./login";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const parsed = JSON.parse(await readFile(path.join(__dirname, "..", "output", "report_query_parsed.json"), "utf-8"));

  const userDataDir = path.join(__dirname, "..", ".edge-profile");
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "msedge",
    headless: config.headless,
  });
  const page = context.pages()[0] ?? (await context.newPage());

  try {
    await login(page, config.instanceUrl, config.username);

    // ServiceNow REST calls from an authenticated session require the CSRF/session
    // token (window.g_ck) as an X-UserToken header, not just the session cookie.
    const csrfToken = await page.evaluate(() => (window as unknown as { g_ck?: string }).g_ck);
    console.log(`g_ck token present: ${Boolean(csrfToken)}`);

    const url = `${config.instanceUrl}/api/now/table/${parsed.table}`;
    console.log(`Testing direct REST call: GET ${url}`);
    const res = await context.request.get(url, {
      headers: csrfToken ? { "X-UserToken": csrfToken } : {},
      params: {
        sysparm_query: parsed.filter,
        sysparm_fields: parsed.fieldList.join(","),
        sysparm_limit: "5",
        sysparm_display_value: "true",
        sysparm_suppress_pagination_header: "true",
      },
    });

    console.log(`Status: ${res.status()}`);
    const body = await res.text();
    console.log(`Body (first 3000 chars):\n${body.slice(0, 3000)}`);
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
