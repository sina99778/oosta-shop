// API keys for programmatic admin access (e.g. an external AI assistant).
// Only the SHA-256 hash is stored; the raw key is shown once at creation.

import { createHash, randomBytes } from "node:crypto";
import type { Role } from "@prisma/client";
import { prisma } from "./prisma";

const PREFIX = "oosta_sk_";

export function looksLikeApiKey(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = PREFIX + randomBytes(24).toString("base64url");
  return { raw, hash: hashKey(raw), prefix: raw.slice(0, PREFIX.length + 6) + "…" };
}

// Resolve a raw key to its owning user (and bump lastUsedAt). null if unknown.
export async function resolveApiKey(raw: string): Promise<{ userId: string; role: Role } | null> {
  const key = await prisma.apiKey.findUnique({
    where: { keyHash: hashKey(raw) },
    include: { user: { select: { id: true, role: true } } },
  });
  if (!key) return null;
  void prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
  return { userId: key.user.id, role: key.user.role };
}
