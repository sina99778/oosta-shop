"use client";

import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/app/[locale]/dictionaries";

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = searchParams.get("next");
  const destination = next && next.startsWith("/") ? next : `/${locale}/dashboard`;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "login") {
        await login(identifier, password);
      } else {
        await signup({ name, email: email || undefined, phone: phone || undefined, password });
      }
      router.replace(destination);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : dict.common.somethingWrong);
      setSubmitting(false);
    }
  }

  return (
    <Container className="flex justify-center py-16 animate-fade-in">
      <Card className="w-full max-w-sm glass-panel shadow-glow">
        <h1 className="text-xl font-bold">{mode === "login" ? a.loginTitle : a.signupTitle}</h1>
        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          {mode === "signup" && (
            <Field label={a.name}>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
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
              <Field label={a.email}>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label={a.phone}>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              <p className="text-xs text-muted">{a.contactHint}</p>
            </>
          )}

          <Field label={a.password}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </Field>

          {error && <p className="text-sm text-danger">{error}</p>}

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
            href={`/${locale}/${mode === "login" ? "signup" : "login"}`}
            className="text-primary hover:underline"
          >
            {mode === "login" ? a.signupCta : a.loginCta}
          </Link>
        </p>
      </Card>
    </Container>
  );
}
