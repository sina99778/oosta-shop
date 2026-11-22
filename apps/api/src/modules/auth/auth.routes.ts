// Auth routes: signup + login (rate-limited & validated), the authenticated /me,
// password change, and logout (this browser) / logout-all (every device).

import { Router } from "express";
import type { SendMail } from "../../lib/mailer";
import { authRateLimiter, createAuthRateLimiter } from "../../middleware/rateLimit";
import { validate } from "../../middleware/validate";
import { authenticate, requireRole } from "../../middleware/auth";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  verifyRecoveryEmailRequestSchema,
  verifyRecoveryEmailSchema,
} from "./auth.schemas";
import {
  changePassword,
  confirmRecoveryEmailVerification,
  createForgotPassword,
  createRequestRecoveryEmailVerification,
  inbox,
  login,
  logout,
  logoutAll,
  me,
  resetPassword,
  revokeOtherSessions,
  revokeSession,
  sessions,
  signup,
} from "./auth.controller";
import { z } from "zod";

const sessionParams = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/) });

export const authRouter = Router();

authRouter.post("/signup", authRateLimiter, validate({ body: signupSchema }), signup);
authRouter.post("/login", authRateLimiter, validate({ body: loginSchema }), login);
authRouter.get("/me", authenticate, me);
authRouter.get("/inbox", authenticate, inbox);
authRouter.post(
  "/change-password",
  authRateLimiter,
  authenticate,
  validate({ body: changePasswordSchema }),
  changePassword,
);
authRouter.post("/logout", logout);
authRouter.post("/logout-all", authenticate, logoutAll);
authRouter.get("/sessions", authenticate, sessions);
authRouter.post("/sessions/revoke-others", authRateLimiter, authenticate, revokeOtherSessions);
authRouter.delete(
  "/sessions/:id",
  authRateLimiter,
  authenticate,
  validate({ params: sessionParams }),
  revokeSession,
);

export function createPasswordResetRouter(send?: SendMail) {
  const router = Router();
  router.post(
    "/forgot-password",
    createAuthRateLimiter(),
    validate({ body: forgotPasswordSchema }),
    createForgotPassword(send),
  );
  router.post(
    "/reset-password",
    createAuthRateLimiter(),
    validate({ body: resetPasswordSchema }),
    resetPassword,
  );
  router.post(
    "/recovery-email/request",
    createAuthRateLimiter(),
    authenticate,
    requireRole("USER"),
    validate({ body: verifyRecoveryEmailRequestSchema }),
    createRequestRecoveryEmailVerification(send),
  );
  router.post(
    "/recovery-email/verify",
    createAuthRateLimiter(),
    authenticate,
    requireRole("USER"),
    validate({ body: verifyRecoveryEmailSchema }),
    confirmRecoveryEmailVerification(send),
  );
  return router;
}
