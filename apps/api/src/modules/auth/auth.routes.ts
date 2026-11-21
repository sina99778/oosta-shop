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
  signup,
} from "./auth.controller";

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
    confirmRecoveryEmailVerification,
  );
  return router;
}
