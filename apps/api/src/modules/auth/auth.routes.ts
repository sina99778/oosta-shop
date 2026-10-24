// Auth routes: signup + login (rate-limited & validated) and the authenticated /me.

import { Router } from "express";
import { authRateLimiter } from "../../middleware/rateLimit";
import { validate } from "../../middleware/validate";
import { authenticate } from "../../middleware/auth";
import {
  changePasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  updateProfileSchema,
} from "./auth.schemas";
import {
  changeMyPassword,
  login,
  logout,
  me,
  resetMyPassword,
  session,
  signup,
  updateMe,
} from "./auth.controller";

export const authRouter = Router();

authRouter.post("/signup", authRateLimiter, validate({ body: signupSchema }), signup);
authRouter.post("/login", authRateLimiter, validate({ body: loginSchema }), login);
authRouter.post("/logout", logout);
// One-time link made by an admin (see admin "customers").
authRouter.post(
  "/reset-password",
  authRateLimiter,
  validate({ body: resetPasswordSchema }),
  resetMyPassword,
);
authRouter.get("/me", authenticate, me);
authRouter.patch("/me", authenticate, validate({ body: updateProfileSchema }), updateMe);
// Rate-limited like login: it checks a password.
authRouter.post(
  "/password",
  authRateLimiter,
  authenticate,
  validate({ body: changePasswordSchema }),
  changeMyPassword,
);
// Like /me, but a signed-out visitor gets 200 { user: null } instead of a 401 —
// the web app calls it on every page load to restore the cookie session.
authRouter.get("/session", (req, res, next) => {
  void authenticate(req, res, (error?: unknown) => {
    if (error) {
      res.json({ user: null });
      return;
    }
    session(req, res).catch(next);
  });
});
