import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config";
import { login } from "./login";
import { getCsrfToken } from "./restApi";
import { csvToObjects } from "./csv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test batch size; bump this (or remove the slice) once validated.
const TEST_BATCH_SIZE = 15;
const SOURCE_CSV = path.join(__dirname, "..", "output", "servicenow-report-1788782802342.csv");

interface Attachment {
  sys_id: string;
  file_name: string;
}

async function main() {
  // Task numbers can be passed directly as CLI args (e.g. `tsx src/downloadAttachments.ts TSK007783281`);
  // otherwise fall back to the first TEST_BATCH_SIZE unique numbers from the exported CSV.
  const cliTaskNumbers = process.argv.slice(2).filter(Boolean);

  let taskNumbers: string[];
  if (cliTaskNumbers.length > 0) {
    taskNumbers = cliTaskNumbers;
    console.log(`Processing ${taskNumbers.length} task number(s) from command line.`);
  } else {
    const csvText = await readFile(SOURCE_CSV, "utf-8");
    const rows = csvToObjects(csvText);
    taskNumbers = [...new Set(rows.map((r) => r.number).filter(Boolean))].slice(0, TEST_BATCH_SIZE);
    console.log(`Loaded ${rows.length} rows from CSV, processing ${taskNumbers.length} unique task numbers.`);
  }

  const userDataDir = path.join(__dirname, "..", ".edge-profile");
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "msedge",
    headless: config.headless,
  });
  const page = context.pages()[0] ?? (await context.newPage());

  try {
    await login(page, config.instanceUrl, config.username);
    await page.goto(config.instanceUrl, { waitUntil: "domcontentloaded" });
    const csrfToken = await getCsrfToken(page);
    const headers = { "X-UserToken": csrfToken };

    let totalAttachments = 0;

    for (const number of taskNumbers) {
      const lookupRes = await context.request.get(`${config.instanceUrl}/api/now/table/u_case_task`, {
        headers,
        params: {
          sysparm_query: `number=${number}`,
          sysparm_fields: "sys_id,number",
          sysparm_limit: "1",
        },
      });

      if (!lookupRes.ok()) {
        console.error(`[${number}] lookup failed: ${lookupRes.status()} ${await lookupRes.text()}`);
        continue;
      }

      const lookupBody = (await lookupRes.json()) as { result: { sys_id: string }[] };
      const sysId = lookupBody.result[0]?.sys_id;
      if (!sysId) {
        console.log(`[${number}] no matching record found, skipping.`);
        continue;
      }

      const attachmentsRes = await context.request.get(`${config.instanceUrl}/api/now/attachment`, {
        headers,
        params: {
          sysparm_query: `table_name=u_case_task^table_sys_id=${sysId}`,
          sysparm_fields: "sys_id,file_name",
        },
      });

      if (!attachmentsRes.ok()) {
        console.error(`[${number}] attachment list failed: ${attachmentsRes.status()} ${await attachmentsRes.text()}`);
        continue;
      }

      const attachmentsBody = (await attachmentsRes.json()) as { result: Attachment[] };
      const attachments = attachmentsBody.result;

      if (attachments.length === 0) {
        console.log(`[${number}] no attachments.`);
        continue;
      }

      const taskDir = path.join(__dirname, "..", "output", "attachments", number);
      await mkdir(taskDir, { recursive: true });

      for (const attachment of attachments) {
        const fileRes = await context.request.get(
          `${config.instanceUrl}/api/now/attachment/${attachment.sys_id}/file`,
          { headers }
        );

        if (!fileRes.ok()) {
          console.error(`[${number}] failed to download ${attachment.file_name}: ${fileRes.status()}`);
          continue;
        }

        const fileName = attachment.file_name || `${attachment.sys_id}.bin`;
        const filePath = path.join(taskDir, fileName);
        await writeFile(filePath, await fileRes.body());
        totalAttachments++;
        console.log(`[${number}] downloaded ${fileName}`);
      }
    }

    console.log(`\nDone. Downloaded ${totalAttachments} attachment(s) across ${taskNumbers.length} task(s).`);
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
