import { chromium } from "playwright";
import { config } from "./config";

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: config.headless });
  const page = await browser.newContext().then((c) => c.newPage());

  await page.goto(`${config.instanceUrl}/login.do`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  console.log(`Current URL: ${page.url()}`);

  const fields = await page.$$eval("input, button", (elements) =>
    elements.map((el) => ({
      tag: el.tagName,
      type: (el as HTMLInputElement).type,
      name: (el as HTMLInputElement).name,
      id: el.id,
      placeholder: (el as HTMLInputElement).placeholder,
      text: el.textContent?.trim().slice(0, 40),
    }))
  );

  console.log(JSON.stringify(fields, null, 2));

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
