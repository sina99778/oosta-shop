import { spawn, type ChildProcess } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { createGzip, createGunzip } from "node:zlib";
import os from "node:os";
import path from "node:path";
import { env } from "../config/env";

function libpqUrl(raw: string): string {
  const url = new URL(raw);
  for (const key of ["schema", "connection_limit", "pool_timeout", "pgbouncer"])
    url.searchParams.delete(key);
  return url.toString();
}
function exited(child: ChildProcess): Promise<void> {
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr = (stderr + String(chunk)).slice(-8000);
  });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(stderr.trim() || `Database utility exited with code ${code}`)),
    );
  });
}
export async function createBackup(): Promise<{ file: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "oosta-backup-"));
  const cleanup = () => rm(dir, { recursive: true, force: true });
  const file = path.join(dir, `oosta-${new Date().toISOString().replace(/[:.]/g, "-")}.sql.gz`);
  const child = spawn(
    "pg_dump",
    ["--clean", "--if-exists", "--no-owner", "--no-privileges", libpqUrl(env.DATABASE_URL)],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  try {
    await Promise.all([
      exited(child),
      pipeline(child.stdout!, createGzip(), createWriteStream(file, { flags: "wx", mode: 0o600 })),
    ]);
    return { file, cleanup };
  } catch (error) {
    child.kill();
    await cleanup().catch(() => {});
    throw error;
  }
}
export async function restoreFromFile(file: string): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "oosta-restore-"));
  try {
    const sql = path.join(dir, "snapshot.sql");
    if (file.endsWith(".gz"))
      await pipeline(
        createReadStream(file),
        createGunzip(),
        createWriteStream(sql, { flags: "wx", mode: 0o600 }),
      );
    const child = spawn(
      "psql",
      [
        "--single-transaction",
        "--set",
        "ON_ERROR_STOP=on",
        "-f",
        file.endsWith(".gz") ? sql : file,
        libpqUrl(env.DATABASE_URL),
      ],
      { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
    );
    await exited(child);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
