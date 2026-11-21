"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error-message";
import type { Locale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Input } from "@/components/ui/input";
import styles from "./auth.module.css";

const textLink =
  "inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline";

export function PasswordRecoveryForm({
  mode,
  locale,
  dict,
}: {
  mode: "request" | "reset";
  locale: Locale;
  dict: Pick<Dictionary, "auth" | "common">;
}) {
  const { retrySession } = useAuth();
  const { recovery, passwordHint, passwordMax, submitting } = dict.auth;
  const [token, setToken] = useState<string | null>();
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string>();
  const isReset = mode === "reset";

  useEffect(() => {
    if (!isReset) return;
    const { hash, pathname, search } = window.location;
    const value = new URLSearchParams(hash.slice(1)).get("token");
    if (value !== null) window.history.replaceState(window.history.state, "", pathname + search);
    // The fragment only exists in the browser and is scrubbed before rendering the form.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken((current) => (current === undefined ? value : current));
  }, [isReset]);

  const badLink =
    isReset && (!token || !/^[A-Za-z0-9_-]{43}$/.test(token) || errorCode === "INVALID_RESET_LINK");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);
    setErrorCode(undefined);
    const newPassword = String(data.get("newPassword") ?? "");
    if (isReset && newPassword !== data.get("confirmation")) {
      setError(recovery.mismatch);
      return;
    }
    if (isReset && new TextEncoder().encode(newPassword).length > 72) {
      setError(passwordMax);
      return;
    }

    setPending(true);
    try {
      if (isReset) {
        await api.post("/auth/reset-password", { token, newPassword });
        setToken(null);
        retrySession();
      } else {
        await api.post("/auth/forgot-password", {
          email: String(data.get("email") ?? "").trim(),
          locale,
        });
      }
      setSuccess(true);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      setErrorCode(code);
      setError(
        code === "PASSWORD_RESET_UNAVAILABLE"
          ? recovery.unavailable
          : apiErrorMessage(err, locale, dict.common.somethingWrong),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Container className="flex justify-center py-10 sm:py-16">
      <div
        className={`${styles.form} w-full max-w-lg rounded-2xl border border-border border-t-4 border-t-primary bg-card`}
      >
        <h1>{isReset ? recovery.resetTitle : recovery.requestTitle}</h1>
        {success ? (
          <p role="status" className="mt-4 text-sm text-muted">
            {isReset ? recovery.saved : recovery.sent}
          </p>
        ) : isReset && token === undefined ? (
          <p role="status" className="mt-4 text-sm text-muted">
            {submitting}
          </p>
        ) : badLink ? (
          <div className="mt-4 text-sm">
            <p role="status" className="text-muted">
              {recovery.invalid}
            </p>
            <Link href={`/${locale}/forgot-password`} className={textLink}>
              {recovery.requestAgain}
            </Link>
          </div>
        ) : (
          <form method="post" onSubmit={submit} className="mt-4 space-y-4">
            {isReset ? (
              <>
                <label className="block text-sm">
                  <span className="mb-1 block">{recovery.newPassword}</span>
                  <Input
                    type="password"
                    name="newPassword"
                    minLength={8}
                    autoComplete="new-password"
                    aria-describedby="reset-password-hint"
                    required
                  />
                </label>
                <p id="reset-password-hint" className="text-sm text-muted">
                  {passwordHint}
                </p>
                <label className="block text-sm">
                  <span className="mb-1 block">{recovery.confirmPassword}</span>
                  <Input
                    type="password"
                    name="confirmation"
                    minLength={8}
                    autoComplete="new-password"
                    required
                  />
                </label>
              </>
            ) : (
              <>
                <p className="text-sm text-muted">{recovery.requestHint}</p>
                <label className="block text-sm">
                  <span className="mb-1 block">{recovery.email}</span>
                  <Input
                    type="email"
                    name="email"
                    dir="ltr"
                    maxLength={320}
                    autoComplete="email"
                    required
                  />
                </label>
              </>
            )}
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            {errorCode === "PASSWORD_RESET_UNAVAILABLE" && (
              <a className={textLink} href="#footer-contact">
                {recovery.contact}
              </a>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? submitting : isReset ? recovery.save : recovery.send}
            </Button>
          </form>
        )}
        <Link href={`/${locale}/login`} className={`${textLink} mt-2 text-sm`}>
          {recovery.back}
        </Link>
      </div>
    </Container>
  );
}
