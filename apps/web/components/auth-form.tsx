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
import { Container } from "@/components/ui/container";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AccountRecoveryEmail } from "@/components/account-recovery-email";
import { PasswordStrength } from "@/components/password-strength";
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
  const [showPassword, setShowPassword] = useState(false);
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
    <Container className="flex justify-center py-10 animate-fade-in sm:py-16">
      <div className={styles.shell}>
        <aside className={styles.panel} aria-label={a.panelEyebrow}>
          <p className={styles.eyebrow}>{a.panelEyebrow}</p>
          <h2>{a.panelTitle}</h2>
          <ul className={styles.points}>
            {a.panelPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </aside>
        <div className={styles.form}>
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
            <>
              <form onSubmit={onSubmit} className="mt-6 space-y-3">
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
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">
                      {fa ? "اطلاعات تماس" : "Contact details"}
                    </legend>
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
                  </fieldset>
                )}

                <div>
                  <label htmlFor="auth-password" className="mb-1 block text-sm text-muted">
                    {a.password}
                  </label>
                  <div className={styles.passwordWrap}>
                    <Input
                      id="auth-password"
                      type={showPassword ? "text" : "password"}
                      minLength={mode === "signup" ? 8 : undefined}
                      aria-describedby={
                        mode === "signup" ? "auth-password-hint auth-password-strength" : undefined
                      }
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                    />
                    <button
                      type="button"
                      className={styles.reveal}
                      onClick={() => setShowPassword((v) => !v)}
                      aria-pressed={showPassword}
                      aria-label={showPassword ? a.hidePassword : a.showPassword}
                      aria-controls="auth-password"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="20"
                        height="20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                        <circle cx="12" cy="12" r="3" />
                        {showPassword && <path d="M4 4l16 16" />}
                      </svg>
                    </button>
                  </div>
                  {mode === "signup" && (
                    <>
                      <p id="auth-password-hint" className="mt-2 text-sm text-muted">
                        {a.passwordHint}
                      </p>
                      <PasswordStrength
                        id="auth-password-strength"
                        locale={locale}
                        password={password}
                      />
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
                {mode === "login" && (
                  <Link
                    href={`/${locale}/forgot-password`}
                    className="oosta-button flex min-h-11 w-full items-center justify-center px-4 text-sm font-semibold"
                    data-button-variant="outline"
                  >
                    {a.recovery.forgot}
                  </Link>
                )}
              </form>

              <p className="mt-4 text-center text-sm text-muted">
                {mode === "login" ? a.noAccount : a.haveAccount}{" "}
                <Link
                  href={`/${locale}/${mode === "login" ? "signup" : "login"}?next=${encodeURIComponent(destination)}`}
                  className="inline-flex min-h-11 items-center px-1 font-semibold text-primary underline-offset-4 hover:underline"
                >
                  {mode === "login" ? a.signupCta : a.loginCta}
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </Container>
  );
}
