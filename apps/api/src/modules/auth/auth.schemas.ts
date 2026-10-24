// Zod schemas for authentication requests.

import { z } from "zod";

const passwordField = z.string().min(8, "Password must be at least 8 characters").max(100);

// Persian (۰-۹) and Arabic-Indic (٠-٩) digits -> ASCII, so "۰۹۱۲…" from a Persian
// keyboard is the same phone number as "0912…".
export function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

const phoneField = z
  .string()
  .transform((v) => toLatinDigits(v).replace(/[\s-]/g, ""))
  .pipe(
    z
      .string()
      .min(5, "Phone number is too short")
      .max(20, "Phone number is too long")
      .regex(/^\+?[0-9]+$/, "Phone may contain only digits and an optional leading +"),
  );

export const signupSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100),
    // Emails are stored lowercased so "Ali@x.com" and "ali@x.com" are one account.
    email: z.string().trim().toLowerCase().pipe(z.email("Invalid email address")).optional(),
    phone: phoneField.optional(),
    password: passwordField,
  })
  .refine((data) => Boolean(data.email) || Boolean(data.phone), {
    message: "Provide either an email or a phone number",
    path: ["email"],
  });

export const loginSchema = z.object({
  identifier: z
    .string()
    .transform((v) => toLatinDigits(v).trim())
    .pipe(z.string().min(1, "Email or phone is required")),
  password: z.string().min(1, "Password is required"),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordField,
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
