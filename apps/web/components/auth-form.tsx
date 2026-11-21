"use client";

import { useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { apiErrorMessage } from "@/lib/api-error-message";
import { latinDigits, safeReturnPath } from "@/lib/navigation";
import { rememberPlanReturn } from "@/lib/storefront-metrics";
import { Container } from "@/components/ui/container";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
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
  const { login, signup } = useAuth();
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
  const [contactMissing, setContactMissing] = useState(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const showContactError = contactMissing && !email.trim() && !phone.trim();

  const next = searchParams.get("next");
  const destination = safeReturnPath(next, `/${locale}/dashboard`);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (mode === "signup" && !email.trim() && !phone.trim()) {
      setContactMissing(true);
      setError(null);
      emailInput.current?.focus();
      return;
    }
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
          email: email.trim() || undefined,
          phone: latinDigits(phone.trim()) || undefined,
          password,
        });
      }
      rememberPlanReturn(destination);
      router.replace(destination);
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
          <h1>{mode === "login" ? a.loginTitle : a.signupTitle}</h1>
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
              <fieldset
                className="space-y-2"
                aria-describedby={showContactError ? "contact-error" : undefined}
              >
                <legend className="text-sm font-medium">{a.contactHint}</legend>
                <Field label={a.email}>
                  <Input
                    ref={emailInput}
                    type="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                    dir="ltr"
                    aria-invalid={showContactError || undefined}
                    aria-describedby={showContactError ? "contact-error" : undefined}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Field label={a.phone}>
                  <Input
                    type="tel"
                    aria-invalid={showContactError || undefined}
                    aria-describedby={showContactError ? "contact-error" : undefined}
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder={a.phoneExample}
                    dir="ltr"
                    maxLength={20}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </Field>
                {showContactError && (
                  <p id="contact-error" role="alert" className="text-sm text-danger">
                    {locale === "fa"
                      ? "یک راه تماس برای ساخت حساب وارد کنید."
                      : "Enter a contact method to create your account."}
                  </p>
                )}
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
                  aria-describedby={mode === "signup" ? "auth-password-hint" : undefined}
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
                <p id="auth-password-hint" className="mt-2 text-sm text-muted">
                  {a.passwordHint}
                </p>
              )}
              {mode === "login" && (
                <Link
                  href={`/${locale}/forgot-password`}
                  className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline"
                >
                  {a.recovery.forgot}
                </Link>
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

          <p className="mt-4 text-center text-sm text-muted">
            {mode === "login" ? a.noAccount : a.haveAccount}{" "}
            <Link
              href={`/${locale}/${mode === "login" ? "signup" : "login"}?next=${encodeURIComponent(destination)}`}
              className="inline-flex min-h-11 items-center px-1 font-semibold text-primary underline-offset-4 hover:underline"
            >
              {mode === "login" ? a.signupCta : a.loginCta}
            </Link>
          </p>
        </div>
      </div>
    </Container>
  );
}
