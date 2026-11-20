// Auth routes: signup + login (rate-limited & validated), the authenticated /me,
// password change, and logout (this browser) / logout-all (every device).

import { Router } from "express";
import { authRateLimiter } from "../../middleware/rateLimit";
import { validate } from "../../middleware/validate";
import { authenticate } from "../../middleware/auth";
import { changePasswordSchema, loginSchema, signupSchema } from "./auth.schemas";
import { changePassword, inbox, login, logout, logoutAll, me, signup } from "./auth.controller";

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
