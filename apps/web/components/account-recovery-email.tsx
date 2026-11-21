"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error-message";
import { useAuth } from "@/lib/auth";
import type { Locale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import styles from "./account.module.css";

export function AccountRecoveryEmail({ locale }: { locale: Locale }) {
  const { retrySession, token, user } = useAuth();
  const [codeSent, setCodeSent] = useState(false);
  const [deliveryRequested, setDeliveryRequested] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fa = locale === "fa";
  if (user?.role !== "USER" || !user.email) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setError(null);
    setBusy(true);
    try {
      if (codeSent) {
        await api.post(
          "/auth/recovery-email/verify",
          { token: String(data.get("code") ?? "").replace(/\s/g, ""), locale },
          token ?? undefined,
        );
        retrySession();
      } else {
        const result = await api.post<{ deliveryRequested?: boolean }>(
          "/auth/recovery-email/request",
          { currentPassword: data.get("password"), locale },
          token ?? undefined,
        );
        setDeliveryRequested(result.deliveryRequested);
        setCodeSent(true);
      }
    } catch (err) {
      const invalidCode = codeSent && err instanceof ApiError && err.code === "VALIDATION_ERROR";
      setError(
        invalidCode
          ? fa
            ? "کد تأیید ناقص یا نامعتبر است. کد را کامل از ایمیل کپی کنید."
            : "The verification code is incomplete or invalid. Copy the full code from your email."
          : apiErrorMessage(err, locale, fa ? "انجام نشد. دوباره تلاش کنید." : "Please try again."),
      );
    } finally {
      setBusy(false);
    }
  }

  const codeGuidance =
    deliveryRequested === false
      ? fa
        ? "درخواست ارسال تازه ثبت نشد. کد قبلی را امتحان کنید. اگر آن را دریافت نکرده‌اید، پس از پایان مهلت ۱۵ دقیقه‌ای دوباره درخواست بدهید."
        : "No new send was requested. Try your previous code. If it did not arrive, try again after the 15-minute window."
      : fa
        ? "صندوق ورودی و پوشهٔ هرزنامه را برای کد بررسی کنید. کد تا ۱۵ دقیقه اعتبار دارد."
        : "Check your inbox and spam folder for the code. It expires after 15 minutes.";

  return (
    <section className={styles.panel} aria-labelledby="recovery-email-title">
      <h2 id="recovery-email-title" className="text-lg font-bold">
        {fa ? "ایمیل بازیابی حساب" : "Recovery email"}
      </h2>
      {user.recoveryEmailVerified ? (
        <p role="status" className="mt-2 text-sm text-success">
          {fa ? "ایمیل بازیابی تأیید شد." : "Recovery email verified."} <bdi>{user.email}</bdi>
        </p>
      ) : (
        <form
          key={String(codeSent)}
          method="post"
          onSubmit={submit}
          className="mt-2 max-w-sm space-y-3"
        >
          <p role={codeSent ? "status" : undefined} className="text-sm leading-relaxed text-muted">
            {codeSent
              ? codeGuidance
              : fa
                ? "برای فعال کردن بازیابی رمز، ایمیل حسابتان را تأیید کنید."
                : "Verify your account email to enable password recovery."}{" "}
            <bdi>{user.email}</bdi>
          </p>
          {codeSent ? (
            <label className="block">
              <span className="mb-1 block text-sm text-muted">
                {fa ? "کد تأیید" : "Verification code"}
              </span>
              <Input name="code" autoComplete="one-time-code" dir="ltr" required />
            </label>
          ) : (
            <label className="block">
              <span className="mb-1 block text-sm text-muted">
                {fa ? "رمز عبور فعلی" : "Current password"}
              </span>
              <Input name="password" type="password" autoComplete="current-password" required />
            </label>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={busy} aria-busy={busy}>
              {codeSent ? (fa ? "تأیید ایمیل" : "Verify email") : fa ? "ارسال کد" : "Send code"}
            </Button>
            {codeSent && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setCodeSent(false);
                  setError(null);
                }}
              >
                {fa ? "بازگشت" : "Back"}
              </Button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
