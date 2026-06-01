// Authentication + authorization middleware.
//   authenticate   — requires a valid Bearer JWT; attaches req.user
//   requireRole(…) — requires req.user to hold one of the given roles

import type { NextFunction, Request, Response } from "express";
import type { Role } from "@prisma/client";
import { verifyAccessToken } from "../lib/jwt";
import { AppError } from "../utils/httpError";

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    next(new AppError(401, "UNAUTHORIZED", "Missing or invalid Authorization header"));
    return;
  }

  try {
    const payload = verifyAccessToken(header.slice("Bearer ".length));
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new AppError(401, "UNAUTHORIZED", "Invalid or expired token"));
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, "UNAUTHORIZED", "Authentication required"));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new AppError(403, "FORBIDDEN", "Insufficient permissions"));
      return;
    }
    next();
  };
}
