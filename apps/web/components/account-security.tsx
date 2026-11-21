"use client";

import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { AccountFrame } from "@/components/account-frame";
import { AccountRecoveryEmail } from "@/components/account-recovery-email";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { Locale } from "@/lib/i18n";
import styles from "./account.module.css";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-muted">{label}</span>
      {children}
    </label>
  );
}

// Change password (revokes every other session) and "sign out on every device".
export function AccountSecurity({ locale }: { locale: Locale }) {
  const { changePassword, logoutAll } = useAuth();
  const router = useRouter();
  const fa = locale === "fa";
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<"password" | "all" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

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
        tone: "ok",
        text: fa
          ? "رمز عبور تغییر کرد و همه دستگاه‌های دیگر از حساب خارج شدند."
          : "Password changed. Every other device has been signed out.",
      });
    } catch (error) {
      setMessage({ tone: "error", text: errorText(error) });
    } finally {
      setBusy(null);
    }
  }

  async function onLogoutAll() {
    if (busy) return;
    setBusy("all");
    setMessage(null);
    try {
      await logoutAll();
      router.replace(`/${locale}/login`);
    } catch (error) {
      setMessage({ tone: "error", text: errorText(error) });
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
          <form onSubmit={onChangePassword} className="mt-4 max-w-sm space-y-3">
            <Field label={fa ? "رمز عبور فعلی" : "Current password"}>
              <Input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
                autoComplete="current-password"
              />
            </Field>
            <Field label={fa ? "رمز عبور جدید" : "New password"}>
              <Input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </Field>
            <Field label={fa ? "تکرار رمز عبور جدید" : "Confirm new password"}>
              <Input
                type="password"
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
          </form>
        </section>

        <section className={styles.panel} aria-labelledby="sessions-title">
          <h2 id="sessions-title" className="text-lg font-bold">
            {fa ? "خروج از همه دستگاه‌ها" : "Sign out everywhere"}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {fa
              ? "اگر فکر می‌کنید کسی به حساب شما دسترسی دارد، همه نشست‌ها را باطل کنید و بعد رمز را عوض کنید."
              : "If you think someone else has access, end every session and then change your password."}
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={() => void onLogoutAll()}
            disabled={busy !== null}
          >
            {busy === "all" ? <Spinner /> : null}
            {fa ? "خروج از همه دستگاه‌ها" : "Sign out of all devices"}
          </Button>
        </section>

        {message && (
          <p
            role={message.tone === "error" ? "alert" : "status"}
            className={message.tone === "error" ? "text-sm text-danger" : "text-sm text-success"}
          >
            {message.text}
          </p>
        )}
      </div>
    </AccountFrame>
  );
}
