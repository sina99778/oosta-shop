// Zod schemas for authentication requests.

import { z } from "zod";

const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "Password must not exceed 72 UTF-8 bytes",
  );
const emailField = z.string().trim().toLowerCase().pipe(z.email("Invalid email address"));
const currentPasswordField = z.string().min(1, "Current password is required").max(1000);
const recoveryTokenField = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const recoveryLocaleField = z.enum(["fa", "en"]).default("fa");

export const signupSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100),
    email: emailField.optional(),
    phone: z
      .string()
      .trim()
      .transform((value) =>
        value.replace(/[۰-۹٠-٩]/g, (digit) =>
          String(
            "۰۱۲۳۴۵۶۷۸۹".indexOf(digit) >= 0
              ? "۰۱۲۳۴۵۶۷۸۹".indexOf(digit)
              : "٠١٢٣٤٥٦٧٨٩".indexOf(digit),
          ),
        ),
      )
      .pipe(
        z
          .string()
          .min(5, "Phone number is too short")
          .max(20, "Phone number is too long")
          .regex(/^\+?[0-9]+$/, "Phone may contain only digits and an optional leading +"),
      )
      .optional(),
    password: passwordField,
  })
  .refine((data) => Boolean(data.email) || Boolean(data.phone), {
    message: "Provide either an email or a phone number",
    path: ["email"],
  });

export const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, "Email or phone is required")
    .max(320)
    .transform((value) =>
      value.includes("@")
        ? value.toLowerCase()
        : value.replace(/[۰-۹٠-٩]/g, (digit) =>
            String(
              "۰۱۲۳۴۵۶۷۸۹".indexOf(digit) >= 0
                ? "۰۱۲۳۴۵۶۷۸۹".indexOf(digit)
                : "٠١٢٣٤٥٦٧٨٩".indexOf(digit),
            ),
          ),
    ),
  password: z.string().min(1, "Password is required").max(1000),
});

export const changePasswordSchema = z.object({
  currentPassword: currentPasswordField,
  newPassword: passwordField,
});

export const forgotPasswordSchema = z.object({
  email: emailField.pipe(z.string().max(320)),
  locale: recoveryLocaleField,
});

export const resetPasswordSchema = z.object({
  token: recoveryTokenField,
  newPassword: passwordField,
});

export const verifyRecoveryEmailRequestSchema = z.object({
  currentPassword: currentPasswordField,
  locale: recoveryLocaleField,
});

export const verifyRecoveryEmailSchema = z.object({
  token: recoveryTokenField,
  locale: recoveryLocaleField,
});

export type SignupInput = z.infer<typeof signupSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
