// Zod schemas for authentication requests.

import { z } from "zod";

const passwordField = z.string().min(8, "Password must be at least 8 characters").max(100);

export const signupSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100),
    email: z.email("Invalid email address").optional(),
    phone: z
      .string()
      .trim()
      .min(5, "Phone number is too short")
      .max(20, "Phone number is too long")
      .regex(/^\+?[0-9]+$/, "Phone may contain only digits and an optional leading +")
      .optional(),
    password: passwordField,
  })
  .refine((data) => Boolean(data.email) || Boolean(data.phone), {
    message: "Provide either an email or a phone number",
    path: ["email"],
  });

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Email or phone is required"),
  password: z.string().min(1, "Password is required"),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
