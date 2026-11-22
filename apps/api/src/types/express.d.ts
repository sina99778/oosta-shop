// Augment Express's Request with the authenticated user set by the auth middleware.

import type { Role } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: Role };
      // How `authenticate` identified the caller (API keys cannot manage sessions).
      authMethod?: "bearer" | "cookie" | "api-key";
      // user_sessions.id of the browser login behind this request, when the token has one.
      sessionId?: string;
    }
  }
}

export {};
