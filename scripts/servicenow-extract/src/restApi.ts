import type { APIRequestContext, Page } from "playwright";

export interface ReportQuery {
  table: string;
  filter: string;
  fieldList: string[];
}

// ServiceNow REST calls made from an authenticated browser session require the
// CSRF/session token (window.g_ck) as an X-UserToken header, not just the session cookie.
export async function getCsrfToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => (window as unknown as { g_ck?: string }).g_ck);
  if (!token) {
    throw new Error("Could not read window.g_ck CSRF token from the page.");
  }
  return token;
}

/**
 * Fetches all rows for a report's query via the Table API, paging through results
 * with sysparm_limit/sysparm_offset instead of one large request.
 */
export async function fetchAllRows(
  request: APIRequestContext,
  instanceUrl: string,
  csrfToken: string,
  query: ReportQuery,
  pageSize = 200
): Promise<Record<string, unknown>[]> {
  const url = `${instanceUrl}/api/now/table/${query.table}`;
  const rows: Record<string, unknown>[] = [];
  let offset = 0;

  while (true) {
    const res = await request.get(url, {
      headers: { "X-UserToken": csrfToken },
      timeout: 120000,
      params: {
        sysparm_query: query.filter,
        sysparm_fields: query.fieldList.join(","),
        sysparm_limit: String(pageSize),
        sysparm_offset: String(offset),
        sysparm_display_value: "true",
        sysparm_exclude_reference_link: "true",
        sysparm_suppress_pagination_header: "true",
      },
    });

    if (!res.ok()) {
      throw new Error(`REST call failed: ${res.status()} ${await res.text()}`);
    }

    const body = (await res.json()) as { result: Record<string, unknown>[] };
    const page = body.result;
    rows.push(...page);
    console.log(`Fetched rows ${offset + 1}-${offset + page.length}`);

    if (page.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  return rows;
}

function csvEscape(value: unknown): string {
  const str = value == null ? "" : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function rowsToCsv(rows: Record<string, unknown>[], fieldOrder: string[]): string {
  const header = fieldOrder.map(csvEscape).join(",");
  const lines = rows.map((row) => fieldOrder.map((field) => csvEscape(row[field])).join(","));
  return [header, ...lines].join("\r\n");
}
