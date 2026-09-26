import { readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";

// Well-known first-party resource ID for Azure Databricks AAD auth (public, not a secret).
const DATABRICKS_AAD_RESOURCE_ID = "2ff814a6-3304-4ab8-85cb-cd0e6f879c1d";

function requiredForUpload(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable for Databricks upload: ${name}`);
  }
  return value;
}

// Cached across calls so bulk uploads don't request a fresh token per file.
let cachedToken: { value: string; expiresAt: number } | undefined;

async function getAzureAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  const tenantId = requiredForUpload("AZURE_TENANT_ID", config.azureTenantId);
  const clientId = requiredForUpload("AZURE_CLIENT_ID", config.azureClientId);
  const clientSecret = requiredForUpload("AZURE_CLIENT_SECRET", config.azureClientSecret);

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: `${DATABRICKS_AAD_RESOURCE_ID}/.default`,
  });

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error(`Failed to acquire Azure AD token (${response.status}): ${await response.text()}`);
  }

  const { access_token: accessToken, expires_in: expiresIn } = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
  // Refresh a minute early to avoid using a token that expires mid-request.
  cachedToken = { value: accessToken, expiresAt: Date.now() + (expiresIn - 60) * 1000 };
  return accessToken;
}

/** Uploads a local file to the configured Databricks Unity Catalog volume via the Files API. */
export async function uploadFileToDatabricksVolume(localFilePath: string, remoteRelativePath?: string): Promise<string> {
  const host = requiredForUpload("DATABRICKS_HOST", config.databricksHost).replace(/\/+$/, "");
  const token = await getAzureAccessToken();

  const relativePath = (remoteRelativePath ?? path.basename(localFilePath)).replace(/\\/g, "/");
  const remotePath = `${config.databricksVolumePath}/${relativePath}`;
  const fileBytes = await readFile(localFilePath);

  const uploadUrl = `${host}/api/2.0/fs/files${remotePath}?overwrite=true`;
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
    body: fileBytes,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload ${relativePath} to Databricks volume (${response.status}): ${await response.text()}`);
  }

  console.log(`Uploaded ${relativePath} to Databricks volume at ${remotePath}`);
  return remotePath;
}
