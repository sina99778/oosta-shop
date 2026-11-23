// JWT signing/verification. Tokens carry the user's sessionVersion (`sv`) so a
// password change or "log out everywhere" revokes every older token server-side.

import jwt, { type SignOptions } from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { env } from "../config/env";

export type AccessTokenPayload = {
  sub: string; // user id
  role: Role;
  sv?: number; // users.sessionVersion at issue time (tokens predating it count as 0)
  sid?: string; // user_sessions.id for browser logins (older tokens have none)
};

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };
  const claims: Record<string, unknown> = {
    sub: payload.sub,
    role: payload.role,
    sv: payload.sv ?? 0,
  };
  if (payload.sid) claims.sid = payload.sid;
  return jwt.sign(claims, env.JWT_SECRET, {
    ...options,
    algorithm: "HS256",
  });
}

export function verifyAccessToken(
  token: string,
): Required<Omit<AccessTokenPayload, "sid">> & { sid?: string; exp: number | undefined } {
  const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
  if (typeof decoded === "string" || !decoded.sub || !("role" in decoded)) {
    throw new Error("Invalid token payload");
  }
  const sv = decoded.sv === undefined ? 0 : decoded.sv;
  if (!Number.isSafeInteger(sv) || sv < 0) throw new Error("Invalid token payload");
  const sid = decoded.sid;
  if (sid !== undefined && (typeof sid !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(sid)))
    throw new Error("Invalid token payload");
  return { sub: String(decoded.sub), role: decoded.role as Role, sv, sid, exp: decoded.exp };
}
