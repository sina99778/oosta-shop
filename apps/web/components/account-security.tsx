"use client";

import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { AccountFrame } from "@/components/account-frame";
import { AccountRecoveryEmail } from "@/components/account-recovery-email";
import { AccountSessions } from "@/components/account-sessions";
import { PasswordStrength } from "@/components/password-strength";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Locale } from "@/lib/i18n";
import styles from "./account.module.css";

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

// Change password (revokes every other session) and the signed-in device list.
export function AccountSecurity({ locale }: { locale: Locale }) {
  const { changePassword } = useAuth();
  const fa = locale === "fa";
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<"password" | null>(null);
  const [message, setMessage] = useState<{
    area: "password";
    tone: "ok" | "error";
    text: string;
  } | null>(null);
  const labels = fa
    ? { current: "رمز عبور فعلی", next: "رمز عبور جدید", confirm: "تکرار رمز عبور جدید" }
    : { current: "Current password", next: "New password", confirm: "Confirm new password" };

  function errorText(error: unknown): string {
    if (error instanceof ApiError) {
      if (error.code === "INVALID_CURRENT_PASSWORD")
        return fa ? "رمز عبور فعلی درست نیست." : "Your current password is incorrect.";
      if (error.code === "CREDENTIALS_CHANGED")
        return fa
          ? "اطلاعات ورود هم‌زمان تغییر کرده است؛ دوباره وارد حسابت شو."
          : "Your credentials changed during this request. Please sign in again.";
      if (error.code === "VALIDATION_ERROR")
        return fa
          ? "رمز جدید باید دست‌کم ۸ کاراکتر باشد."
          : "The new password must be at least 8 characters.";
      if (error.code === "RATE_LIMITED")
        return fa
          ? "تلاش‌ها زیاد بود؛ کمی بعد دوباره امتحان کنید."
          : "Too many attempts. Please try again later.";
    }
    return fa ? "انجام نشد. دوباره تلاش کنید." : "That didn't work. Please try again.";
  }

  async function onChangePassword(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (next !== confirm) {
      setMessage({
        area: "password",
        tone: "error",
        text: fa ? "تکرار رمز جدید یکسان نیست." : "The new passwords do not match.",
      });
      return;
    }
    setBusy("password");
    setMessage(null);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setMessage({
        area: "password",
        tone: "ok",
        text: fa
          ? "رمز عبور تغییر کرد و همه دستگاه‌های دیگر از حساب خارج شدند."
          : "Password changed. Every other device has been signed out.",
      });
    } catch (error) {
      setMessage({ area: "password", tone: "error", text: errorText(error) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <AccountFrame
      locale={locale}
      section="security"
      title={fa ? "امنیت حساب" : "Account security"}
      detail={
        fa ? "ایمیل بازیابی، تغییر رمز و مدیریت نشست‌ها" : "Recovery email, password and sessions"
      }
    >
      <div className={styles.stack}>
        <AccountRecoveryEmail locale={locale} />
        <section className={styles.panel} aria-labelledby="change-password-title">
          <h2 id="change-password-title" className="text-lg font-bold">
            {fa ? "تغییر رمز عبور" : "Change password"}
          </h2>
          <form method="post" onSubmit={onChangePassword} className="mt-4 max-w-sm space-y-3">
            <Field id="account-current-password" label={labels.current}>
              <PasswordInput
                id="account-current-password"
                locale={locale}
                label={labels.current}
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
                autoComplete="current-password"
              />
            </Field>
            <Field id="account-new-password" label={labels.next}>
              <PasswordInput
                id="account-new-password"
                locale={locale}
                label={labels.next}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                aria-describedby={next ? "account-password-strength" : undefined}
              />
            </Field>
            {next && (
              <PasswordStrength id="account-password-strength" locale={locale} password={next} />
            )}
            <Field id="account-confirm-password" label={labels.confirm}>
              <PasswordInput
                id="account-confirm-password"
                locale={locale}
                label={labels.confirm}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </Field>
            <Button type="submit" disabled={busy !== null}>
              {busy === "password" ? <Spinner /> : null}
              {fa ? "ذخیره رمز جدید" : "Save new password"}
            </Button>
            {message?.area === "password" && (
              <p
                role={message.tone === "error" ? "alert" : "status"}
                className={
                  message.tone === "error" ? "text-sm text-danger" : "text-sm text-success"
                }
              >
                {message.text}
              </p>
            )}
          </form>
        </section>

        <AccountSessions locale={locale} />
      </div>
    </AccountFrame>
  );
}
