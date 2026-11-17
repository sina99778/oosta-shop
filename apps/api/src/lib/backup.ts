// Database backup & restore helpers (used by the Telegram admin bot).
// Requires pg_dump / psql + gzip in the runtime image (see apps/api/Dockerfile).

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { env } from "../config/env";
import { decryptFile, encryptFile, isEncryptedBackup } from "./secretBox";

// pg_dump/psql use libpq, which rejects Prisma-only query params like
// `?schema=public` with "invalid URI query parameter". Strip them before
// shelling out so backup/restore work against the same DATABASE_URL Prisma uses.
function libpqUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.searchParams.delete("schema");
    url.searchParams.delete("connection_limit");
    url.searchParams.delete("pool_timeout");
    url.searchParams.delete("pgbouncer");
    return url.toString();
  } catch {
    return raw;
  }
}

function run(command: string, extraEnv: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === "win32";
    const shell = isWin ? "cmd.exe" : "sh";
    const finalCommand = isWin
      ? command
          .replace(/\$DATABASE_URL/g, "%DATABASE_URL%")
          .replace(/\$OUT/g, "%OUT%")
          .replace(/\$IN/g, "%IN%")
      : command;
    const args = isWin ? ["/c", finalCommand] : ["-c", finalCommand];

    const child = spawn(shell, args, { env: { ...process.env, ...extraEnv } });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `process exited with code ${code}`));
    });
  });
}

// Creates an ENCRYPTED gzipped SQL snapshot (AES-256-GCM, key derived from
// CREDENTIALS_KEY) and returns { file, cleanup }. The backup leaves the server
// (Telegram), so it must be unreadable without the key. The caller sends `file`
// then awaits `cleanup()` to remove the whole temp directory.
// Offline decryption: npm run backup:decrypt -w @oosta/api -- <in.enc> <out.sql.gz>
export async function createBackup(): Promise<{ file: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "oosta-backup-"));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const plain = path.join(dir, `oosta-${stamp}.sql.gz`);
  const file = `${plain}.enc`;
  await run(
    `pg_dump --clean --if-exists --no-owner --no-privileges "$DATABASE_URL" | gzip -9 > "$OUT"`,
    { DATABASE_URL: libpqUrl(env.DATABASE_URL), OUT: plain },
  );
  await encryptFile(plain, file);
  await rm(plain, { force: true });
  return {
    file,
    cleanup: () => rm(dir, { recursive: true, force: true }).catch(() => {}),
  };
}

// Restores an encrypted backup (.sql.gz.enc) or a plain .sql / .sql.gz dump,
// replacing current data with the snapshot. Encryption is detected from the file
// header, not the name.
export async function restoreFromFile(input: string): Promise<void> {
  let file = input;
  let decrypted: string | null = null;
  if (await isEncryptedBackup(input)) {
    decrypted = `${input}.dec.sql.gz`;
    await decryptFile(input, decrypted);
    file = decrypted;
  }
  try {
    await restorePlain(file, decrypted !== null);
  } finally {
    if (decrypted) await rm(decrypted, { force: true });
  }
}

async function restorePlain(file: string, forceGzip: boolean): Promise<void> {
  const command =
    forceGzip || file.endsWith(".gz")
      ? `gunzip -c "$IN" | psql --set ON_ERROR_STOP=on "$DATABASE_URL"`
      : `psql --set ON_ERROR_STOP=on -f "$IN" "$DATABASE_URL"`;
  await run(command, { DATABASE_URL: libpqUrl(env.DATABASE_URL), IN: file });
}
