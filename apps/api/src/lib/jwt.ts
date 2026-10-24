// JWT signing/verification for stateless authentication.

import jwt, { type SignOptions } from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { env } from "../config/env";

export type AccessTokenPayload = {
  sub: string; // user id
  role: Role;
};

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload & { iat: number } {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded === "string" || !decoded.sub || !("role" in decoded)) {
    throw new Error("Invalid token payload");
  }
  return { sub: String(decoded.sub), role: decoded.role as Role, iat: decoded.iat ?? 0 };
}

// Cut-off for "log out everywhere", in whole seconds like a JWT's iat, so a
// token issued in the same second (the caller's fresh session) stays valid.
export function sessionCutoff(): Date {
  return new Date(Math.floor(Date.now() / 1000) * 1000);
}
