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
  // Azure AD app registration used to authenticate to Databricks (client credentials flow).
  // Not validated eagerly so scripts that don't upload aren't forced to set them; validated in uploadToDatabricks.ts.
  azureTenantId: process.env.AZURE_TENANT_ID,
  azureClientId: process.env.AZURE_CLIENT_ID,
  azureClientSecret: process.env.AZURE_CLIENT_SECRET,
  databricksHost: process.env.DATABRICKS_HOST,
  databricksVolumePath: (process.env.DATABRICKS_VOLUME_PATH || "/Volumes/trend_anaylsis/trend_default/uploads").replace(
    /[\\/]+$/,
    ""
  ),
  // Set to "false" to skip the post-scrape upload (e.g. when iterating locally).
  uploadToDatabricks: process.env.SN_UPLOAD_TO_DATABRICKS !== "false",
};
