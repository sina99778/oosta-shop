"use client";

// Spends a one-time reset link (issued by support from the admin panel).

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { Container } from "@/components/ui/container";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Envelope } from "@/components/stamp";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/app/[locale]/dictionaries";

export function ResetPasswordForm({
  locale,
  token,
  dict,
}: {
  locale: Locale;
  token: string;
  dict: Dictionary;
}) {
  const a = dict.auth;
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== repeat) {
      setError(a.mismatch);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/reset-password", { token, newPassword: password });
      setDone(true);
    } catch (e) {
      setError(
        e instanceof ApiError && (e.code === "RESET_INVALID" || e.code === "VALIDATION_ERROR")
          ? a.resetInvalid
          : e instanceof ApiError
            ? e.message
            : dict.common.somethingWrong,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container className="max-w-md py-14 animate-fade-in">
      <Envelope>
        <div className="p-6 sm:p-8">
          <h1 className="text-2xl font-black">{a.resetTitle}</h1>
          {done ? (
            <>
              <p role="status" className="mt-3 text-sm text-success">
                {a.resetDone}
              </p>
              <Link
                href={`/${locale}/login`}
                className="mt-5 inline-flex h-11 items-center rounded-[10px] bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary-hover"
              >
                {a.loginCta}
              </Link>
            </>
          ) : (
            <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
              <p className="text-sm text-muted">{a.resetBody}</p>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-bold">{a.newPassword}</span>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  maxLength={100}
                  autoComplete="new-password"
                  dir="ltr"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-bold">{a.repeatPassword}</span>
                <Input
                  type="password"
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                  required
                  minLength={8}
                  maxLength={100}
                  autoComplete="new-password"
                  dir="ltr"
                />
              </label>
              {error && (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={busy}>
                {busy ? <Spinner /> : a.resetCta}
              </Button>
            </form>
          )}
        </div>
      </Envelope>
    </Container>
  );
}
