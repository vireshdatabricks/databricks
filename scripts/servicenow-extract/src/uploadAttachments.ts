import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { uploadFileToDatabricksVolume } from "./uploadToDatabricks";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ATTACHMENTS_DIR = path.join(__dirname, "..", "output", "attachments");

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

async function main() {
  const files = await collectFiles(ATTACHMENTS_DIR);
  console.log(`Found ${files.length} attachment file(s) under ${ATTACHMENTS_DIR}.`);

  let uploaded = 0;
  for (const filePath of files) {
    const relativePath = path.join("attachments", path.relative(ATTACHMENTS_DIR, filePath));
    try {
      await uploadFileToDatabricksVolume(filePath, relativePath);
      uploaded++;
    } catch (error) {
      console.error(`Failed to upload ${relativePath}:`, error);
    }
  }

  console.log(`\nDone. Uploaded ${uploaded}/${files.length} attachment(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
