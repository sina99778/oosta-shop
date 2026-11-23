// Device sessions. Every browser login gets a user_sessions row and its id travels in
// the JWT (`sid`), so a customer can list signed-in devices and revoke one or all of
// the others. Only a coarse IP prefix and a truncated user agent are stored.

import { randomBytes } from "node:crypto";
import { unauthorized } from "../utils/httpError";
import { prisma } from "./prisma";
import { signAccessToken, verifyAccessToken } from "./jwt";
import type { Role } from "@prisma/client";

export type SessionMeta = { userAgent?: string | null; ip?: string | null };

const MAX_ACTIVE_SESSIONS = 20;
const RETAIN_ENDED_MS = 30 * 24 * 60 * 60 * 1000;
export const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

// "85.185.12.9" -> "85.185.x.x"; IPv6 keeps the first two groups.
export function ipPrefix(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const value = ip.replace(/^::ffff:/i, "").trim();
  const v4 = value.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (v4) return `${v4[1]}.${v4[2]}.x.x`;
  if (value.includes(":")) {
    const groups = value.split(":").filter(Boolean).slice(0, 2);
    return groups.length ? `${groups.join(":")}:…` : null;
  }
  return null;
}

export function cleanUserAgent(value: string | null | undefined): string | null {
  if (!value) return null;
  // Control characters never reach the database or the account page.
  const cleaned = value
    // eslint-disable-next-line no-control-regex -- control characters are removed on purpose.
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, 200);
  return cleaned || null;
}

// A short, human label derived from the user agent; never echoes the raw header.
export function describeDevice(userAgent: string | null): { browser: string; os: string } {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Unknown";
  return { browser, os };
}

// Signs a token bound to a new session row. The row expires with the token.
export async function issueSessionToken(
  user: { id: string; role: Role; sessionVersion: number },
  meta: SessionMeta,
): Promise<string> {
  const sid = randomBytes(16).toString("base64url");
  const token = signAccessToken({ sub: user.id, role: user.role, sv: user.sessionVersion, sid });
  const { exp } = verifyAccessToken(token);
  const now = Date.now();
  const expiresAt = new Date(exp ? exp * 1000 : now + 7 * 24 * 60 * 60 * 1000);
  await prisma.$transaction(async (tx) => {
    // Serialize issuance with the account's session-version update during recovery.
    const current = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users
      WHERE id = ${user.id} AND "sessionVersion" = ${user.sessionVersion}
      FOR NO KEY UPDATE
    `;
    if (!current.length) throw unauthorized("Session has been revoked");
    await tx.userSession.deleteMany({
      where: {
        userId: user.id,
        OR: [
          { expiresAt: { lt: new Date(now - RETAIN_ENDED_MS) } },
          { revokedAt: { lt: new Date(now - RETAIN_ENDED_MS) } },
        ],
      },
    });
    await tx.userSession.create({
      data: {
        id: sid,
        userId: user.id,
        userAgent: cleanUserAgent(meta.userAgent),
        ipPrefix: ipPrefix(meta.ip),
        expiresAt,
      },
    });
    // Keep the newest sessions; older browsers beyond the cap are signed out.
    const active = await tx.userSession.findMany({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date(now) } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
      skip: MAX_ACTIVE_SESSIONS,
    });
    if (active.length)
      await tx.userSession.updateMany({
        where: { id: { in: active.map((row) => row.id) } },
        data: { revokedAt: new Date(now) },
      });
  });
  return token;
}

export async function revokeSessions(
  userId: string,
  options: { only?: string; except?: string } = {},
): Promise<number> {
  const result = await prisma.userSession.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(options.only ? { id: options.only } : {}),
      ...(options.except ? { id: { not: options.except } } : {}),
    },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

export async function listActiveSessions(userId: string, currentId?: string) {
  const rows = await prisma.userSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
    take: MAX_ACTIVE_SESSIONS,
    select: { id: true, userAgent: true, ipPrefix: true, createdAt: true, lastSeenAt: true },
  });
  return rows.map((row) => ({
    id: row.id,
    ...describeDevice(row.userAgent),
    ipPrefix: row.ipPrefix,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    current: row.id === currentId,
  }));
}
