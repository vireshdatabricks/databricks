import type { Page } from "playwright";

// Exact SN-hosted paths used mid-flight during the SSO handshake — not yet a real
// authenticated page. Deliberately exact-match (not "contains login") since pages
// like login_messages.do are a genuine post-login landing screen.
const TRANSITIONAL_PATHS = new Set([
  "/login.do",
  "/login_locate_sso.do",
  "/login_with_sso.do",
  "/auth_redirect.do",
]);

function isPastLogin(pageUrl: string, origin: string): boolean {
  const current = new URL(pageUrl);
  return current.origin === origin && !TRANSITIONAL_PATHS.has(current.pathname.toLowerCase());
}

export async function login(page: Page, instanceUrl: string, username: string): Promise<void> {
  const origin = new URL(instanceUrl).origin;
  await page.goto(`${instanceUrl}/login.do`, { waitUntil: "domcontentloaded" });

  if (isPastLogin(page.url(), origin)) {
    // Already authenticated (existing SSO session).
    return;
  }

  const ssoLink = page.getByRole("link", { name: /sso/i }).or(page.locator('a:has-text("SSO")'));
  if (await ssoLink.count()) {
    await ssoLink.first().click();
    await page.waitForTimeout(1500);
  }

  const principalField = page.getByLabel("Principal Name");
  if (await principalField.count()) {
    await principalField.fill(username);
    await page.getByRole("button", { name: "Submit" }).click();
  }

  console.log(`Complete the Microsoft login (password/MFA) in the browser window... current URL: ${page.url()}`);

  const timeoutMs = 180000;
  const pollIntervalMs = 1000;
  const start = Date.now();
  let lastLoggedUrl = "";
  let candidateUrl = "";
  let candidateHits = 0;

  while (Date.now() - start < timeoutMs) {
    const currentUrl = page.url();
    if (currentUrl !== lastLoggedUrl) {
      console.log(`Waiting for login... current URL: ${currentUrl}`);
      lastLoggedUrl = currentUrl;
    }
    if (isPastLogin(currentUrl, origin)) {
      candidateHits = currentUrl === candidateUrl ? candidateHits + 1 : 1;
      candidateUrl = currentUrl;
      // Require the same qualifying URL twice in a row, since some SSO
      // redirect hops briefly land on an SN-hosted URL before continuing on.
      if (candidateHits >= 2) {
        console.log("Login detected, continuing.");
        return;
      }
    } else {
      candidateHits = 0;
      candidateUrl = "";
    }
    await page.waitForTimeout(pollIntervalMs);
  }

  throw new Error(`Timed out waiting for login to complete. Last seen URL: ${page.url()}`);
}
