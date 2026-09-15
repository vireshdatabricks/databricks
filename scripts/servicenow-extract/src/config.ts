import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  instanceUrl: required("SN_INSTANCE_URL").replace(/\/+$/, ""),
  reportUrl: required("SN_REPORT_URL"),
  username: required("SN_USERNAME"),
  password: required("SN_PASSWORD"),
  outputDir: process.env.SN_OUTPUT_DIR || "output",
  // Defaults to headful (visible browser) until the flow is verified; set SN_HEADLESS=true to run headless.
  headless: process.env.SN_HEADLESS === "true",
};
