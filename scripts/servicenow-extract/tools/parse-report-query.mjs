import { readFile, writeFile } from "node:fs/promises";

const body = await readFile("output/report_viewer_request_body.txt", "utf-8");
const params = new URLSearchParams(body);

const table = params.get("sysparm_table") ?? params.get("table");
const filter = params.get("sysparm_query");
const fieldList = params.get("sysparm_field_list");

console.log("Keys present:", [...params.keys()].join(", "));
console.log("\n--- table ---\n", table);
console.log("\n--- filter ---\n", filter);
console.log("\n--- field list ---\n", fieldList);

await writeFile(
  "output/report_query_parsed.json",
  JSON.stringify({ table, filter, fieldList: fieldList?.split(",") }, null, 2),
  "utf-8"
);
