#!/usr/bin/env node
// Search a Playwright HAR file for entries whose URL matches a pattern, printing
// method, status, request postData, and a preview of the response body for each match.
//
// Usage: node tools/har-search.mjs <urlSubstring> [harPath]
import { readFile } from "node:fs/promises";
import path from "node:path";

const [, , pattern, harPathArg] = process.argv;

if (!pattern) {
  console.error("Usage: node tools/har-search.mjs <urlSubstring> [harPath]");
  process.exit(1);
}

const harPath = harPathArg ?? path.join(process.cwd(), "output", "network.har");
const har = JSON.parse(await readFile(harPath, "utf-8"));

const matches = har.log.entries.filter((entry) => entry.request.url.includes(pattern));

console.log(`Found ${matches.length} entr${matches.length === 1 ? "y" : "ies"} matching "${pattern}" in ${harPath}\n`);

for (const entry of matches) {
  const { request, response } = entry;
  console.log("=".repeat(80));
  console.log(`${request.method} ${request.url}`);
  console.log(`Status: ${response.status}`);

  if (request.postData?.text) {
    console.log(`\n--- Request body ---\n${request.postData.text}`);
  }

  const body = response.content?.text;
  if (body) {
    const decoded = response.content.encoding === "base64" ? Buffer.from(body, "base64").toString("utf-8") : body;
    const preview = decoded.length > 2000 ? `${decoded.slice(0, 2000)}\n...[truncated]` : decoded;
    console.log(`\n--- Response body (${response.content.mimeType}) ---\n${preview}`);
  }
  console.log();
}
