// Auth routes: signup + login (rate-limited & validated) and the authenticated /me.

import { Router } from "express";
import { authRateLimiter } from "../../middleware/rateLimit";
import { validate } from "../../middleware/validate";
import { authenticate } from "../../middleware/auth";
import { loginSchema, signupSchema } from "./auth.schemas";
import { login, me, signup } from "./auth.controller";

export const authRouter = Router();

authRouter.post("/signup", authRateLimiter, validate({ body: signupSchema }), signup);
authRouter.post("/login", authRateLimiter, validate({ body: loginSchema }), login);
authRouter.get("/me", authenticate, me);
