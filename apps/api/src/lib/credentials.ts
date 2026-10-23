// Field-level encryption for deliverable credentials (account email/password,
// license keys, gift-card codes). Values are sealed with AES-256-GCM under
// CREDENTIALS_ENCRYPTION_KEY, so a leaked DB dump or Telegram backup does not
// expose sellable stock. Stored format: "enc:v1:<iv>:<tag>:<ciphertext>" (base64).
//
// Rows written before the key was configured stay plaintext until
// encryptLegacyCredentials() seals them at boot; reads accept both forms.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env";
import { prisma } from "./prisma";

const PREFIX = "enc:v1:";

function loadKey(): Buffer | null {
  const raw = env.CREDENTIALS_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64)");
  }
  return key;
}

const KEY = loadKey();

export function isCredentialEncryptionEnabled(): boolean {
  return KEY !== null;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function sealCredential(value: string): string;
export function sealCredential(value: string | null | undefined): string | null;
export function sealCredential(value: string | null | undefined): string | null {
  if (value == null || value === "") return value ?? null;
  if (!KEY || isEncrypted(value)) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function openCredential(value: string | null): string | null {
  if (value == null || !isEncrypted(value)) return value;
  if (!KEY) {
    throw new Error("Credential is encrypted but CREDENTIALS_ENCRYPTION_KEY is not set");
  }
  const [iv, tag, ciphertext] = value.slice(PREFIX.length).split(":");
  const decipher = createDecipheriv("aes-256-gcm", KEY, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

type CredentialFields = {
  accountEmail: string | null;
  accountPassword: string | null;
  licenseKey: string | null;
  giftCardCode: string | null;
};

export function openCredentials<T extends CredentialFields>(item: T): T {
  return {
    ...item,
    accountEmail: openCredential(item.accountEmail),
    accountPassword: openCredential(item.accountPassword),
    licenseKey: openCredential(item.licenseKey),
    giftCardCode: openCredential(item.giftCardCode),
  };
}

// "abcd1234efgh" -> "••••efgh" — for surfaces that must not see the secret
// (the AI agent, which forwards tool output to a third-party LLM provider).
export function maskSecret(value: string | null): string | null {
  if (value == null) return null;
  return value.length <= 4 ? "••••" : `••••${value.slice(-4)}`;
}

// Seals any plaintext credential rows (written before the key was configured).
// Idempotent; runs at boot in small batches.
export async function encryptLegacyCredentials(): Promise<number> {
  if (!KEY) return 0;
  let sealed = 0;
  for (;;) {
    const rows = await prisma.inventoryItem.findMany({
      // NULL never matches NOT LIKE, and "" is skipped so an empty value
      // (which sealCredential leaves as-is) cannot loop forever.
      where: {
        OR: (["accountEmail", "accountPassword", "licenseKey", "giftCardCode"] as const).map(
          (field) => ({
            AND: [{ [field]: { not: { startsWith: PREFIX } } }, { [field]: { not: "" } }],
          }),
        ),
      },
      select: {
        id: true,
        accountEmail: true,
        accountPassword: true,
        licenseKey: true,
        giftCardCode: true,
      },
      take: 200,
    });
    if (rows.length === 0) return sealed;
    await prisma.$transaction(
      rows.map((row) =>
        prisma.inventoryItem.update({
          where: { id: row.id },
          data: {
            accountEmail: sealCredential(row.accountEmail),
            accountPassword: sealCredential(row.accountPassword),
            licenseKey: sealCredential(row.licenseKey),
            giftCardCode: sealCredential(row.giftCardCode),
          },
        }),
      ),
    );
    sealed += rows.length;
  }
}
