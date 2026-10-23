// Auth routes: signup + login (rate-limited & validated) and the authenticated /me.

import { Router } from "express";
import { authRateLimiter } from "../../middleware/rateLimit";
import { validate } from "../../middleware/validate";
import { authenticate } from "../../middleware/auth";
import { loginSchema, signupSchema } from "./auth.schemas";
import { login, logout, me, session, signup } from "./auth.controller";

export const authRouter = Router();

authRouter.post("/signup", authRateLimiter, validate({ body: signupSchema }), signup);
authRouter.post("/login", authRateLimiter, validate({ body: loginSchema }), login);
authRouter.post("/logout", logout);
authRouter.get("/me", authenticate, me);
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
