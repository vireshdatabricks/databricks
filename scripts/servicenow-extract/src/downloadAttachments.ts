import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config";
import { login } from "./login";
import { getCsrfToken } from "./restApi";
import { csvToObjects } from "./csv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "..", "output");

interface Attachment {
  sys_id: string;
  file_name: string;
}

async function loadTaskNumbersFromCsvs(): Promise<string[]> {
  const entries = await readdir(OUTPUT_DIR, { withFileTypes: true });
  const csvFiles = entries.filter((e) => e.isFile() && e.name.endsWith(".csv")).map((e) => e.name);

  const taskNumbers = new Set<string>();
  for (const file of csvFiles) {
    const text = await readFile(path.join(OUTPUT_DIR, file), "utf-8");
    for (const row of csvToObjects(text)) {
      if (row.number) taskNumbers.add(row.number);
    }
  }
  return [...taskNumbers];
}

async function main() {
  // Task numbers can be passed directly as CLI args (e.g. `tsx src/downloadAttachments.ts TSK007783281`);
  // otherwise process every unique task number found across all case report CSVs in output/.
  const cliTaskNumbers = process.argv.slice(2).filter(Boolean);

  let taskNumbers: string[];
  if (cliTaskNumbers.length > 0) {
    taskNumbers = cliTaskNumbers;
    console.log(`Processing ${taskNumbers.length} task number(s) from command line.`);
  } else {
    taskNumbers = await loadTaskNumbersFromCsvs();
    console.log(`Processing ${taskNumbers.length} unique task numbers found across CSVs in output/.`);
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
    let tasksWithAttachments = 0;
    const casesWithAttachments = new Set<string>();

    for (const [index, number] of taskNumbers.entries()) {
      if (index > 0 && index % 50 === 0) {
        console.log(`--- Progress: ${index}/${taskNumbers.length} tasks processed ---`);
      }

      try {
        const lookupRes = await context.request.get(`${config.instanceUrl}/api/now/table/u_case_task`, {
        headers,
        params: {
          sysparm_query: `number=${number}`,
          sysparm_fields: "sys_id,number,parent.number",
          sysparm_display_value: "true",
          sysparm_limit: "1",
        },
      });

      if (!lookupRes.ok()) {
        console.error(`[${number}] lookup failed: ${lookupRes.status()} ${await lookupRes.text()}`);
        continue;
      }

      const lookupBody = (await lookupRes.json()) as { result: { sys_id: string; "parent.number"?: string }[] };
      const record = lookupBody.result[0];
      const sysId = record?.sys_id;
      if (!sysId) {
        console.log(`[${number}] no matching record found, skipping.`);
        continue;
      }

      const caseNumber = record["parent.number"] || "unknown-case";

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
        console.log(`[${caseNumber}/${number}] no attachments.`);
        continue;
      }

      const taskDir = path.join(__dirname, "..", "output", "attachments", caseNumber, number);
      await mkdir(taskDir, { recursive: true });
      tasksWithAttachments++;
      casesWithAttachments.add(caseNumber);

      for (const attachment of attachments) {
        const fileName = attachment.file_name || `${attachment.sys_id}.bin`;
        const filePath = path.join(taskDir, fileName);

        if (existsSync(filePath)) {
          console.log(`[${caseNumber}/${number}] already downloaded, skipping ${fileName}`);
          continue;
        }

        try {
          const fileRes = await context.request.get(
            `${config.instanceUrl}/api/now/attachment/${attachment.sys_id}/file`,
            { headers, timeout: 180000 }
          );

          if (!fileRes.ok()) {
            console.error(`[${number}] failed to download ${fileName}: ${fileRes.status()}`);
            continue;
          }

          await writeFile(filePath, await fileRes.body());
          totalAttachments++;
          console.log(`[${caseNumber}/${number}] downloaded ${fileName}`);
        } catch (error) {
          console.error(`[${caseNumber}/${number}] error downloading ${fileName}:`, error instanceof Error ? error.message : error);
        }
      }
      } catch (error) {
        console.error(`[${number}] unexpected error processing task:`, error instanceof Error ? error.message : error);
      }
    }

    console.log(
      `\nDone. Downloaded ${totalAttachments} attachment(s) from ${tasksWithAttachments} task(s) across ${casesWithAttachments.size} case(s) (out of ${taskNumbers.length} task(s) checked).`
    );
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
