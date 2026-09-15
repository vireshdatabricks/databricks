import { readFile, writeFile } from "node:fs/promises";

const har = JSON.parse(await readFile("output/network.har", "utf-8"));
const entry = har.log.entries.find((e) => e.request.url.includes("report_viewer.do"));
await writeFile("output/report_viewer_request_body.txt", entry.request.postData.text, "utf-8");
console.log("Wrote full request body to output/report_viewer_request_body.txt");
