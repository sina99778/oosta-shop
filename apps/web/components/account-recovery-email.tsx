"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error-message";
import { useAuth } from "@/lib/auth";
import type { Locale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import styles from "./account.module.css";

export function AccountRecoveryEmail({
  locale,
  onboarding = false,
  initialDeliveryRequested,
  requesting = false,
  onVerified,
}: {
  locale: Locale;
  onboarding?: boolean;
  initialDeliveryRequested?: boolean;
  requesting?: boolean;
  onVerified?: () => void;
}) {
  const { retrySession, token, user } = useAuth();
  const [deliveryRequested, setDeliveryRequested] = useState<boolean>();
  const [busy, setBusy] = useState<"verify" | "request" | null>(null);
  const [error, setError] = useState<{ form: "verify" | "request"; message: string } | null>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const resend = useRef<HTMLDetailsElement>(null);
  const fa = locale === "fa";
  const showCode = user?.role === "USER" && Boolean(user.email) && !user.recoveryEmailVerified;
  useEffect(() => {
    if (showCode && (onboarding || window.location.hash === "#recovery-code"))
      codeInput.current?.focus();
  }, [showCode, onboarding]);
  if (user?.role !== "USER" || !user.email) return null;

  async function submit(event: FormEvent<HTMLFormElement>, form: "verify" | "request") {
    event.preventDefault();
    if (busy || requesting) return;
    const element = event.currentTarget;
    const data = new FormData(element);
    setError(null);
    setBusy(form);
    try {
      if (form === "verify") {
        await api.post(
          "/auth/recovery-email/verify",
          { token: String(data.get("code") ?? "").replace(/\s/g, ""), locale },
          token ?? undefined,
        );
        retrySession();
        onVerified?.();
      } else {
        const result = await api.post<{ deliveryRequested?: boolean }>(
          "/auth/recovery-email/request",
          { currentPassword: data.get("password"), locale },
          token ?? undefined,
        );
        setDeliveryRequested(result.deliveryRequested);
        element.reset();
        if (resend.current) resend.current.open = false;
        codeInput.current?.focus();
      }
    } catch (err) {
      const invalidCode =
        form === "verify" && err instanceof ApiError && err.code === "VALIDATION_ERROR";
      setError({
        form,
        message: invalidCode
          ? fa
            ? "کد تأیید ناقص یا نامعتبر است. کد را کامل از ایمیل کپی کنید."
            : "The verification code is incomplete or invalid. Copy the full code from your email."
          : apiErrorMessage(err, locale, fa ? "انجام نشد. دوباره تلاش کنید." : "Please try again."),
      });
    } finally {
      setBusy(null);
    }
  }

  const delivery = deliveryRequested ?? initialDeliveryRequested;
  const codeGuidance =
    delivery === false
      ? fa
        ? "درخواست ارسال تازه ثبت نشد. کد قبلی را امتحان کنید. اگر آن را دریافت نکرده‌اید، پس از پایان مهلت ۱۵ دقیقه‌ای دوباره درخواست بدهید."
        : "No new send was requested. Try your previous code. If it did not arrive, try again after the 15-minute window."
      : fa
        ? "صندوق ورودی و پوشهٔ هرزنامه را برای کد بررسی کنید. کد تا ۱۵ دقیقه اعتبار دارد."
        : "Check your inbox and spam folder for the code. It expires after 15 minutes.";

  return (
    <section
      className={onboarding ? undefined : styles.panel}
      aria-labelledby="recovery-email-title"
    >
      <h2 id="recovery-email-title" className="text-lg font-bold">
        {onboarding
          ? fa
            ? "تأیید ایمیل ثبت‌نام"
            : "Verify your sign-up email"
          : fa
            ? "ایمیل بازیابی حساب"
            : "Recovery email"}
      </h2>
      {user.recoveryEmailVerified ? (
        <p role="status" className="mt-2 text-sm text-success">
          {fa ? "ایمیل بازیابی تأیید شد." : "Recovery email verified."} <bdi>{user.email}</bdi>
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {fa
              ? "کد تأیید این نشانی را همین‌جا وارد کن."
              : "Enter the verification code for this address here."}{" "}
            <bdi>{user.email}</bdi>
          </p>
          {requesting && (
            <p role="status" className="mt-3 text-sm text-muted">
              {fa ? "در حال درخواست کد تأیید…" : "Requesting a verification code…"}
            </p>
          )}
          {delivery !== undefined && (
            <p role="status" className="mt-3 text-sm text-muted">
              {codeGuidance}
            </p>
          )}
          <div className={styles.recoveryGrid}>
            <form
              method="post"
              onSubmit={(event) => void submit(event, "verify")}
              className="space-y-3"
            >
              <label htmlFor="recovery-code" className="block text-sm font-semibold">
                {fa ? "کد تأیید ایمیل" : "Email verification code"}
              </label>
              <Input
                id="recovery-code"
                ref={codeInput}
                name="code"
                autoComplete="one-time-code"
                dir="ltr"
                required
              />
              {error?.form === "verify" && (
                <p role="alert" className="text-sm text-danger">
                  {error.message}
                </p>
              )}
              <Button
                type="submit"
                disabled={busy !== null || requesting}
                aria-busy={busy === "verify"}
              >
                {fa ? "تأیید ایمیل" : "Verify email"}
              </Button>
            </form>
            <details ref={resend} className={styles.resend}>
              <summary>{fa ? "کد نرسید؟ دریافت دوباره" : "No code? Request another"}</summary>
              <form
                method="post"
                onSubmit={(event) => void submit(event, "request")}
                className="space-y-3"
              >
                <label htmlFor="recovery-password" className="block text-sm font-semibold">
                  {fa ? "رمز فعلی برای دریافت کد" : "Current password to request a code"}
                </label>
                <Input
                  id="recovery-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
                {error?.form === "request" && (
                  <p role="alert" className="text-sm text-danger">
                    {error.message}
                  </p>
                )}
                <Button
                  type="submit"
                  variant="outline"
                  disabled={busy !== null || requesting}
                  aria-busy={busy === "request"}
                >
                  {fa ? "ارسال کد به ایمیل" : "Send verification code"}
                </Button>
              </form>
            </details>
          </div>
        </>
      )}
    </section>
  );
}
