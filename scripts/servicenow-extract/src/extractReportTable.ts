import type { Frame, Page } from "playwright";
import path from "node:path";

async function findFrameWithText(page: Page, text: string, timeoutMs: number): Promise<Page | Frame> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (await frame.getByText(text, { exact: true }).count()) {
        return frame;
      }
    }
    await page.waitForTimeout(1000);
  }
  console.log(
    `Could not find "${text}" in any frame. Frames on page: ${page
      .frames()
      .map((f) => f.url())
      .join(", ")}`
  );
  return page;
}

const INTERESTING_URL_PATTERN = /export|attachment|download|report/i;

export async function downloadReportCsv(page: Page, outputDir: string): Promise<string> {
  // Log the underlying REST/servlet calls so we can potentially replace UI automation
  // with direct HTTP calls later.
  page.on("request", (req) => {
    if (INTERESTING_URL_PATTERN.test(req.url())) {
      console.log(`[net] -> ${req.method()} ${req.url()}`);
    }
  });
  page.on("response", (res) => {
    if (INTERESTING_URL_PATTERN.test(res.url())) {
      console.log(`[net] <- ${res.status()} ${res.url()}`);
    }
  });

  await page
    .getByText("Loading report", { exact: false })
    .waitFor({ state: "hidden", timeout: 120000 })
    .catch(() => {
      /* loading indicator may not exist for fast reports */
    });

  // The grid may live inside a nested iframe; find whichever frame actually contains it.
  const target = await findFrameWithText(page, "Assignment Group", 120000);

  const headerCell = target.getByText("Assignment Group", { exact: true }).first();
  await headerCell.waitFor({ state: "visible", timeout: 10000 });
  await headerCell.scrollIntoViewIfNeeded();
  // Left-click sorts the column; the export menu is on the right-click context menu.
  await headerCell.click({ button: "right" });

  // The dropdown menu can render in the top-level page even when the grid itself is framed.
  let exportItem = page.getByText("Export", { exact: true }).first();
  if (!(await exportItem.count())) {
    exportItem = target.getByText("Export", { exact: true }).first();
  }
  await exportItem.waitFor({ state: "visible", timeout: 10000 });
  await exportItem.hover();

  let csvItem = page.getByText("CSV", { exact: true }).first();
  if (!(await csvItem.count())) {
    csvItem = target.getByText("CSV", { exact: true }).first();
  }
  await csvItem.waitFor({ state: "visible", timeout: 10000 });
  await csvItem.click();

  if (process.env.SN_CAPTURE_ONLY === "true") {
    // Diagnostic mode: stop right after triggering the export so the HAR (written on
    // context.close()) captures the report_viewer.do payload without a multi-minute wait.
    await page.waitForTimeout(3000);
    throw new Error("SN_CAPTURE_ONLY set - stopping after triggering export for HAR capture.");
  }

  // ServiceNow shows an "Export in Progress" dialog with a Download button that only
  // enables once all rows have been server-side exported. It may render in a different
  // frame than the grid itself, so search across all frames again.
  const dialogFrame = await findFrameWithText(page, "Download", 30000);
  const downloadButton = dialogFrame.getByText("Download", { exact: true }).first();
  await downloadButton.waitFor({ state: "visible", timeout: 10000 });

  await dialogFrame.waitForFunction(
    () => {
      const el = [...document.querySelectorAll("button, a")].find((b) => b.textContent?.trim() === "Download");
      return !!el && !(el as HTMLButtonElement).disabled && el.getAttribute("aria-disabled") !== "true";
    },
    undefined,
    { timeout: 600000, polling: 1000 }
  );

  const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
  await downloadButton.click();
  const download = await downloadPromise;
  console.log(`[net] download URL: ${download.url()}`);

  const outputPath = path.join(outputDir, `servicenow-report-${Date.now()}.csv`);
  await download.saveAs(outputPath);
  return outputPath;
}
