import { createHash, randomBytes } from "node:crypto";
import { Prisma, type PasswordReset, type RecoveryChallengeKind } from "@prisma/client";
import { env } from "../../config/env";
import type { SendMail } from "../../lib/mailer";
import { renderEmail } from "../../lib/email-design";
import { isMaintenance, trackMaintenanceWork } from "../../lib/maintenance";
import { hashPassword, verifyPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/httpError";
import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from "./auth.schemas";

const RESET_LIFETIME_MS = 15 * 60 * 1000;
const RESEND_DELAY_MS = 60 * 1000;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function passwordResetBaseUrl(): URL | undefined {
  try {
    const url = new URL(env.WEB_BASE_URL);
    if (url.username || url.password) return;
    if (url.protocol === "https:" || (!env.isProduction && url.protocol === "http:")) return url;
  } catch {
    return;
  }
}

async function storeChallenge(kind: RecoveryChallengeKind, eligibleAccount: Prisma.Sql) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiry = new Date(now.getTime() + RESET_LIFETIME_MS);
  const retryBefore = new Date(now.getTime() - RESEND_DELAY_MS);

  // A single conditional insert keeps the account throttle atomic across API instances.
  const issued = await trackMaintenanceWork(
    () => prisma.$queryRaw<{ email: string }[]>`
    INSERT INTO "password_resets" ("userId", "tokenHash", "kind", "email", "sessionVersion", "requestedAt", "expiresAt")
    SELECT "id", ${hashToken(token)}, ${kind}::"RecoveryChallengeKind", "email", "sessionVersion", ${now}, ${expiry}
    FROM "users" WHERE "role" = 'USER' AND ${eligibleAccount}
    ON CONFLICT ("userId") DO UPDATE SET
      "tokenHash" = EXCLUDED."tokenHash", "kind" = EXCLUDED."kind", "email" = EXCLUDED."email",
      "sessionVersion" = EXCLUDED."sessionVersion", "requestedAt" = EXCLUDED."requestedAt",
      "expiresAt" = EXCLUDED."expiresAt", "usedAt" = NULL
    WHERE "password_resets"."kind" <> EXCLUDED."kind"
      OR "password_resets"."email" <> EXCLUDED."email"
      OR "password_resets"."sessionVersion" <> EXCLUDED."sessionVersion"
      OR ("password_resets"."requestedAt" <= ${retryBefore}
          AND ("password_resets"."expiresAt" <= ${now} OR "password_resets"."usedAt" IS NOT NULL))
    RETURNING "email"
  `,
  );
  return issued.length ? { token, email: issued[0].email } : undefined;
}

async function deliverChallenge(
  send: SendMail,
  challenge: { token: string; email: string },
  message: Omit<Parameters<SendMail>[0], "to">,
) {
  try {
    await send({ to: challenge.email, ...message });
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    // Definite SMTP rejection can be retried after the account cooldown. An uncertain
    // delivery keeps its link valid because the recipient may already have it.
    if ((code === "EAUTH" || code === "EENVELOPE") && !isMaintenance()) {
      await trackMaintenanceWork(() =>
        prisma.passwordReset.updateMany({
          where: { tokenHash: hashToken(challenge.token), usedAt: null },
          data: { expiresAt: new Date() },
        }),
      );
    }
    console.error("[password-reset] Could not deliver an account recovery email");
  }
}

export async function issuePasswordReset(
  { email, locale }: ForgotPasswordInput,
  baseUrl: URL,
  send: SendMail,
): Promise<void> {
  const challenge = await storeChallenge(
    "RESET",
    Prisma.sql`"email" = ${email} AND "verifiedRecoveryEmail" = "email"`,
  );
  if (!challenge) return;

  const link = new URL(`/${locale}/reset-password`, baseUrl);
  link.hash = new URLSearchParams({ token: challenge.token }).toString();
  const subject = locale === "fa" ? "بازیابی رمز عبور اوستا" : "Reset your Oosta password";
  const instructions =
    locale === "fa"
      ? "برای تعیین رمز جدید از این پیوند استفاده کنید. پیوند تا ۱۵ دقیقه اعتبار دارد و فقط یک‌بار قابل استفاده است. اگر درخواست بازیابی نداده‌اید، این پیام را نادیده بگیرید."
      : "Use the link to set a new password. It expires in 15 minutes and can be used once. If you did not request a reset, you can ignore this email.";
  await deliverChallenge(
    send,
    challenge,
    renderEmail({
      locale,
      kind: "security",
      subject,
      body: instructions,
      action: { label: locale === "fa" ? "تعیین رمز جدید" : "Set a new password", url: link.href },
    }),
  );
}

export async function issueRecoveryVerification(
  userId: string,
  currentPassword: string,
  locale: ForgotPasswordInput["locale"],
  base: URL,
  send: SendMail,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user?.role !== "USER" || !user.email || user.email === user.verifiedRecoveryEmail) {
    throw new AppError(
      409,
      "RECOVERY_EMAIL_NOT_ELIGIBLE",
      "This email cannot be verified for recovery",
    );
  }
  if (forgotPasswordSchema.shape.email.safeParse(user.email).data !== user.email) {
    throw new AppError(
      409,
      "RECOVERY_EMAIL_NOT_ELIGIBLE",
      "This email cannot be verified for recovery",
    );
  }
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AppError(400, "INVALID_CURRENT_PASSWORD", "Current password is incorrect");
  }
  const challenge = await storeChallenge(
    "VERIFY",
    Prisma.sql`
    "id" = ${userId} AND "email" = ${user.email} AND "sessionVersion" = ${user.sessionVersion}
      AND "verifiedRecoveryEmail" IS DISTINCT FROM "email"
  `,
  );
  if (!challenge) return false;
  const subject =
    locale === "fa" ? "تأیید ایمیل بازیابی اوستا" : "Verify your Oosta recovery email";
  const instructions =
    locale === "fa"
      ? "این کد را در بخش امنیت حساب اوستا وارد کنید. کد تا ۱۵ دقیقه اعتبار دارد."
      : "Enter this code in Oosta account security. The code expires in 15 minutes.";
  void deliverChallenge(
    send,
    challenge,
    renderEmail({
      locale,
      kind: "security",
      subject,
      body: instructions,
      code: challenge.token,
      action: {
        label: locale === "fa" ? "رفتن به فرم ورود کد" : "Open the verification form",
        url: new URL(`/${locale}/dashboard/security#recovery-code`, base).href,
      },
    }),
  ).catch(() => {
    console.error("[password-reset] Could not record the recovery email delivery result");
  });
  return true;
}

function invalidChallenge(kind: RecoveryChallengeKind) {
  return kind === "RESET"
    ? new AppError(400, "INVALID_RESET_LINK", "The password reset link is invalid or expired")
    : new AppError(
        400,
        "INVALID_RECOVERY_CODE",
        "The recovery verification code is invalid or expired",
      );
}

async function findUsableChallenge(token: string, kind: RecoveryChallengeKind, userId?: string) {
  const tokenHash = hashToken(token);
  const reset = await prisma.passwordReset.findUnique({ where: { tokenHash } });
  if (
    !reset ||
    reset.kind !== kind ||
    reset.usedAt ||
    reset.expiresAt <= new Date() ||
    (userId && reset.userId !== userId)
  ) {
    throw invalidChallenge(kind);
  }
  return reset;
}

async function consumeChallenge(reset: PasswordReset, data: Prisma.UserUpdateManyMutationInput) {
  const { tokenHash, kind, userId, email, sessionVersion } = reset;
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const redeemed = await tx.passwordReset.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (!redeemed.count) throw invalidChallenge(kind);
    const before =
      kind === "VERIFY"
        ? await tx.user.findUnique({
            where: { id: userId },
            select: { verifiedRecoveryEmail: true },
          })
        : null;
    const updated = await tx.user.updateMany({
      where: {
        id: userId,
        email,
        role: "USER",
        sessionVersion,
        ...(kind === "RESET" ? { verifiedRecoveryEmail: email } : {}),
      },
      data,
    });
    if (!updated.count) throw invalidChallenge(kind);
    return before?.verifiedRecoveryEmail === null ? email : null;
  });
}

export async function redeemPasswordReset({ token, newPassword }: ResetPasswordInput) {
  const reset = await findUsableChallenge(token, "RESET");
  const passwordHash = await hashPassword(newPassword);
  await consumeChallenge(reset, { passwordHash, sessionVersion: { increment: 1 } });
}

export async function verifyRecoveryEmail(userId: string, token: string) {
  const verification = await findUsableChallenge(token, "VERIFY", userId);
  return consumeChallenge(verification, { verifiedRecoveryEmail: verification.email });
}
