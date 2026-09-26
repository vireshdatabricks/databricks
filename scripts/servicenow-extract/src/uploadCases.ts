import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { uploadFileToDatabricksVolume } from "./uploadToDatabricks";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "..", "output");

async function main() {
  const entries = await readdir(OUTPUT_DIR, { withFileTypes: true });
  const csvFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".csv")).map((entry) => entry.name);

  console.log(`Found ${csvFiles.length} case CSV file(s) under ${OUTPUT_DIR}.`);

  let uploaded = 0;
  for (const fileName of csvFiles) {
    const filePath = path.join(OUTPUT_DIR, fileName);
    const remoteRelativePath = path.join("cases", fileName);
    try {
      await uploadFileToDatabricksVolume(filePath, remoteRelativePath);
      uploaded++;
    } catch (error) {
      console.error(`Failed to upload ${fileName}:`, error);
    }
  }

  console.log(`\nDone. Uploaded ${uploaded}/${csvFiles.length} case CSV file(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
