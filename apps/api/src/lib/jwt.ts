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

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded === "string" || !decoded.sub || !("role" in decoded)) {
    throw new Error("Invalid token payload");
  }
  return { sub: String(decoded.sub), role: decoded.role as Role };
}
