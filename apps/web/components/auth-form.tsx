"use client";

import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error-message";
import { latinDigits, safeReturnPath } from "@/lib/navigation";
import { rememberPlanReturn } from "@/lib/storefront-metrics";
import { AuthShell } from "@/components/auth-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AccountRecoveryEmail } from "@/components/account-recovery-email";
import { PasswordStrength } from "@/components/password-strength";
import { PasswordInput } from "@/components/password-input";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import styles from "./auth.module.css";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-muted">{label}</span>
      {children}
    </label>
  );
}

export function AuthForm({
  mode,
  locale,
  dict,
}: {
  mode: "login" | "signup";
  locale: Locale;
  dict: Dictionary;
}) {
  const { login, signup, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const a = dict.auth;

  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveryRequested, setDeliveryRequested] = useState<boolean>();
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const verifySignup =
    mode === "signup" && user?.role === "USER" && user.email && !user.recoveryEmailVerified;
  const fa = locale === "fa";

  const next = searchParams.get("next");
  const destination = safeReturnPath(next, `/${locale}/dashboard`);

  function finish() {
    rememberPlanReturn(destination);
    router.replace(destination);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (mode === "signup" && new TextEncoder().encode(password).length > 72) {
      setError(a.passwordMax);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "login") {
        await login(
          identifier.includes("@") ? identifier.trim() : latinDigits(identifier.trim()),
          password,
        );
      } else {
        await signup({
          name,
          email: email.trim(),
          phone: latinDigits(phone.trim()) || undefined,
          password,
        });
        setPassword("");
        try {
          const result = await api.post<{ deliveryRequested?: boolean }>(
            "/auth/recovery-email/request",
            {
              currentPassword: password,
              locale,
            },
          );
          setDeliveryRequested(result.deliveryRequested);
        } catch (err) {
          setVerificationError(
            apiErrorMessage(
              err,
              locale,
              fa
                ? "درخواست کد انجام نشد. از فرم زیر دوباره کد بگیر."
                : "The code request failed. Request another code below.",
            ),
          );
        } finally {
          setSubmitting(false);
        }
        return;
      }
      finish();
    } catch (err) {
      setError(apiErrorMessage(err, locale, dict.common.somethingWrong, mode));
      setSubmitting(false);
    }
  }

  return (
    <AuthShell auth={a} locale={locale} offer={mode === "signup"}>
      {!verifySignup && (
        <nav className={styles.switcher} aria-label={fa ? "ورود و ثبت‌نام" : "Sign in and sign up"}>
          {(["login", "signup"] as const).map((route) => (
            <Link
              key={route}
              href={`/${locale}/${route}?next=${encodeURIComponent(destination)}`}
              aria-current={route === mode ? "page" : undefined}
            >
              {route === "login" ? a.loginCta : a.signupCta}
            </Link>
          ))}
        </nav>
      )}
      {verifySignup && <p className={styles.step}>{fa ? "مرحله ۲ از ۲" : "Step 2 of 2"}</p>}
      <h1>
        {verifySignup
          ? fa
            ? "تکمیل ثبت‌نام"
            : "Finish signing up"
          : mode === "login"
            ? a.loginTitle
            : a.signupTitle}
      </h1>
      {verifySignup ? (
        <div className="mt-5 space-y-3">
          {verificationError && (
            <p role="alert" className="text-sm text-danger">
              {verificationError}
            </p>
          )}
          <AccountRecoveryEmail
            locale={locale}
            onboarding
            initialDeliveryRequested={deliveryRequested}
            requesting={submitting}
            onVerified={finish}
          />
        </div>
      ) : (
        <form method="post" onSubmit={onSubmit} className="mt-6 space-y-3">
          {mode === "signup" && (
            <Field label={a.name}>
              <Input
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </Field>
          )}

          {mode === "login" ? (
            <Field label={a.emailOrPhone}>
              <Input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoComplete="username"
              />
            </Field>
          ) : (
            <>
              <Field label={fa ? "ایمیل" : "Email address"}>
                <Input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="name@example.com"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field label={a.phone}>
                <Input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder={a.phoneExample}
                  dir="ltr"
                  maxLength={20}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Field>
            </>
          )}

          <div>
            <div className={styles.passwordLabel}>
              <label htmlFor="auth-password" className="text-sm text-muted">
                {a.password}
              </label>
              {mode === "login" && (
                <Link href={`/${locale}/forgot-password`} className={styles.forgot}>
                  {a.recovery.forgot}
                </Link>
              )}
            </div>
            <PasswordInput
              id="auth-password"
              locale={locale}
              label={a.password}
              minLength={mode === "signup" ? 8 : undefined}
              aria-describedby={
                mode === "signup"
                  ? password
                    ? "auth-password-hint auth-password-strength"
                    : "auth-password-hint"
                  : undefined
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
            {mode === "signup" && (
              <>
                <p id="auth-password-hint" className="mt-2 text-sm text-muted">
                  {a.passwordHint}
                </p>
                {password && (
                  <PasswordStrength
                    id="auth-password-strength"
                    locale={locale}
                    password={password}
                  />
                )}
              </>
            )}
          </div>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? (
              <>
                <Spinner /> {a.submitting}
              </>
            ) : mode === "login" ? (
              a.loginCta
            ) : (
              a.signupCta
            )}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
