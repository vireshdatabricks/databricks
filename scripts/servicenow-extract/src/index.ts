import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config";
import { login } from "./login";
import { downloadReportCsv } from "./extractReportTable";
import { uploadFileToDatabricksVolume } from "./uploadToDatabricks";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  await mkdir(config.outputDir, { recursive: true });

  // Dedicated, persistent Edge profile so the SSO session survives across runs
  // (log in manually once; subsequent runs, including headless, reuse the saved session).
  const userDataDir = path.join(__dirname, "..", ".edge-profile");
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "msedge",
    headless: config.headless,
    acceptDownloads: true,
  });
  const page = context.pages()[0] ?? (await context.newPage());

  try {
    await login(page, config.instanceUrl, config.username);

    // ServiceNow keeps background polling (AMB) alive, so "networkidle" never resolves.
    await page.goto(config.reportUrl, { waitUntil: "domcontentloaded" });
    console.log(`Report page URL: ${page.url()}`);
    console.log(`Report page title: ${await page.title()}`);

    let csvPath: string;
    try {
      csvPath = await downloadReportCsv(page, config.outputDir);
    } catch (error) {
      const debugPath = path.join(config.outputDir, `debug-${Date.now()}.png`);
      await page.screenshot({ path: debugPath, fullPage: true });
      console.error(`Could not export the CSV. Saved a screenshot for debugging: ${debugPath}`);
      throw error;
    }

    console.log(`Downloaded CSV to ${csvPath}`);

    if (config.uploadToDatabricks) {
      await uploadFileToDatabricksVolume(csvPath, path.join("cases", path.basename(csvPath)));
    }
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
