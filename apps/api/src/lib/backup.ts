import { spawn, type ChildProcess } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { createGzip, createGunzip } from "node:zlib";
import os from "node:os";
import path from "node:path";
import { env } from "../config/env";

function libpq(raw: string) {
  const url = new URL(raw);
  for (const key of ["schema", "connection_limit", "pool_timeout", "pgbouncer"])
    url.searchParams.delete(key);
  const password = decodeURIComponent(url.password);
  url.password = "";
  return { url: url.toString(), env: { ...process.env, PGPASSWORD: password } };
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
export function createBackup() {
  return writeBackup();
}

export async function createEncryptedBackup(recipient: string | undefined) {
  if (!recipient || !/^age1[023456789acdefghjklmnpqrstuvwxyz]{58}$/.test(recipient)) {
    throw new Error("A valid age public recipient is required");
  }
  return writeBackup(recipient);
}

async function writeBackup(
  recipient?: string,
): Promise<{ file: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "oosta-backup-"));
  const cleanup = () => rm(dir, { recursive: true, force: true });
  const extension = recipient ? ".sql.gz.age" : ".sql.gz";
  const file = path.join(
    dir,
    `oosta-${new Date().toISOString().replace(/[:.]/g, "-")}${extension}`,
  );
  const database = libpq(env.DATABASE_URL);
  const child = spawn(
    "pg_dump",
    ["--clean", "--if-exists", "--no-owner", "--no-privileges", database.url],
    { env: database.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  const age = recipient
    ? spawn("age", ["--encrypt", "--recipient", recipient], {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      })
    : null;
  const output = createWriteStream(file, { flags: "wx", mode: 0o600 });
  const tasks = age
    ? [
        exited(child),
        exited(age),
        pipeline(child.stdout!, createGzip(), age.stdin),
        pipeline(age.stdout, output),
      ]
    : [exited(child), pipeline(child.stdout!, createGzip(), output)];
  try {
    await Promise.all(tasks);
    return { file, cleanup };
  } catch (error) {
    child.kill();
    age?.kill();
    output.destroy();
    await Promise.allSettled(tasks);
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
    const database = libpq(env.DATABASE_URL);
    const child = spawn(
      "psql",
      [
        "--single-transaction",
        "--set",
        "ON_ERROR_STOP=on",
        "-f",
        file.endsWith(".gz") ? sql : file,
        database.url,
      ],
      { env: database.env, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
    );
    await exited(child);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
