// Decrypts an encrypted Telegram backup (.sql.gz.enc) back to a .sql.gz file.
// Needs the same CREDENTIALS_KEY the backup was made with (read from the env).
//
//   docker compose -f docker-compose.prod.yml exec api node dist/cli/decrypt-backup.js in.enc out.sql.gz
//   npm run backup:decrypt -w @oosta/api -- in.enc out.sql.gz          (development)

import "dotenv/config";
import { decryptFile } from "../lib/secretBox";

async function main(): Promise<void> {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error("usage: decrypt-backup <backup.sql.gz.enc> <out.sql.gz>");
    process.exit(2);
  }
  await decryptFile(input, output);
  console.log(`decrypted -> ${output}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
