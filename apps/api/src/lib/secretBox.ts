// Encryption at rest for deliverable secrets (account passwords, license keys,
// gift card codes) and for database backups.
//
//   field format:  enc:v1:<iv b64url>:<tag b64url>:<ciphertext b64url>   (AES-256-GCM)
//   backup format: "OOSTABK1" | iv(12) | ciphertext… | tag(16)             (AES-256-GCM)
//
// The key comes from CREDENTIALS_KEY (any long random string; it is hashed to 32
// bytes). It is NOT stored in the database, so a leaked dump or backup does not
// leak the credentials. LOSING THE KEY MEANS LOSING THE STORED CREDENTIALS —
// keep it next to your other secrets, outside the server.
//
// Values without the "enc:v1:" prefix are legacy plaintext and are returned as-is;
// encryptLegacyInventory() upgrades them at boot.

import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { env } from "../config/env";

const PREFIX = "enc:v1:";
const BACKUP_MAGIC = Buffer.from("OOSTABK1");
const TAG_LEN = 16;

let cachedKey: Buffer | null = null;
function fieldKey(): Buffer {
  cachedKey ??= createHash("sha256").update(env.CREDENTIALS_KEY, "utf8").digest();
  return cachedKey;
}

function backupKey(): Buffer {
  return Buffer.from(hkdfSync("sha256", fieldKey(), Buffer.alloc(0), "oosta-backup-v1", 32));
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function encryptSecret(plain: string): string;
export function encryptSecret(plain: string | null | undefined): string | null;
export function encryptSecret(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined) return null;
  if (isEncrypted(plain)) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", fieldKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}:${tag.toString("base64url")}:${ct.toString("base64url")}`;
}

export function decryptSecret(value: string): string;
export function decryptSecret(value: string | null | undefined): string | null;
export function decryptSecret(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (!isEncrypted(value)) return value; // legacy plaintext
  const [ivB64, tagB64, ctB64] = value.slice(PREFIX.length).split(":");
  const decipher = createDecipheriv("aes-256-gcm", fieldKey(), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

// Plain view of an inventory row's secrets.
export function decryptCredentials<
  T extends {
    accountPassword: string | null;
    licenseKey: string | null;
    giftCardCode: string | null;
  },
>(item: T): T {
  return {
    ...item,
    accountPassword: decryptSecret(item.accountPassword),
    licenseKey: decryptSecret(item.licenseKey),
    giftCardCode: decryptSecret(item.giftCardCode),
  };
}

// ---- Backups ------------------------------------------------------------------

export async function encryptFile(input: string, output: string): Promise<void> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", backupKey(), iv);
  const out = createWriteStream(output);
  out.write(Buffer.concat([BACKUP_MAGIC, iv]));
  await pipeline(createReadStream(input), cipher, out, { end: false });
  await new Promise<void>((resolve, reject) => {
    out.end(cipher.getAuthTag(), () => resolve());
    out.on("error", reject);
  });
}

export async function isEncryptedBackup(file: string): Promise<boolean> {
  const fh = await open(file, "r");
  try {
    const buf = Buffer.alloc(BACKUP_MAGIC.length);
    await fh.read(buf, 0, buf.length, 0);
    return buf.equals(BACKUP_MAGIC);
  } finally {
    await fh.close();
  }
}

export async function decryptFile(input: string, output: string): Promise<void> {
  const { size } = await stat(input);
  const headerLen = BACKUP_MAGIC.length + 12;
  if (size < headerLen + TAG_LEN) throw new Error("Backup file is truncated");
  const fh = await open(input, "r");
  const header = Buffer.alloc(headerLen);
  const tag = Buffer.alloc(TAG_LEN);
  try {
    await fh.read(header, 0, headerLen, 0);
    await fh.read(tag, 0, TAG_LEN, size - TAG_LEN);
  } finally {
    await fh.close();
  }
  if (!header.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)) {
    throw new Error("Not an encrypted oosta backup");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    backupKey(),
    header.subarray(BACKUP_MAGIC.length),
  );
  decipher.setAuthTag(tag);
  try {
    await pipeline(
      createReadStream(input, { start: headerLen, end: size - TAG_LEN - 1 }),
      decipher,
      createWriteStream(output),
    );
  } catch {
    throw new Error("Backup decryption failed — wrong CREDENTIALS_KEY or the file was modified");
  }
}
