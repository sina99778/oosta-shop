"use client";

// The buyer's account: display name and password.

import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import { Container } from "@/components/ui/container";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { DashboardTabs } from "@/components/dashboard-tabs";
import { TelegramConnect } from "@/components/telegram-connect";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/app/[locale]/dictionaries";

type Status = { tone: "ok" | "error"; text: string } | null;

function StatusLine({ status }: { status: Status }) {
  if (!status) return null;
  return (
    <p
      role={status.tone === "error" ? "alert" : "status"}
      className={status.tone === "error" ? "text-sm text-danger" : "text-sm text-success"}
    >
      {status.text}
    </p>
  );
}

export function AccountSettings({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { user, token, updateName } = useAuth();
  const t = dict.account;

  const [name, setName] = useState(user?.name ?? "");
  const [nameBusy, setNameBusy] = useState(false);
  const [nameStatus, setNameStatus] = useState<Status>(null);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwStatus, setPwStatus] = useState<Status>(null);

  async function saveName(event: FormEvent) {
    event.preventDefault();
    setNameBusy(true);
    setNameStatus(null);
    try {
      await updateName(name.trim());
      setNameStatus({ tone: "ok", text: t.saved });
    } catch (e) {
      setNameStatus({
        tone: "error",
        text: e instanceof ApiError ? e.message : dict.common.somethingWrong,
      });
    } finally {
      setNameBusy(false);
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    if (next !== repeat) {
      setPwStatus({ tone: "error", text: t.mismatch });
      return;
    }
    setPwBusy(true);
    setPwStatus(null);
    try {
      await api.post(
        "/auth/password",
        { currentPassword: current, newPassword: next },
        token ?? undefined,
      );
      setCurrent("");
      setNext("");
      setRepeat("");
      setPwStatus({ tone: "ok", text: t.passwordChanged });
    } catch (e) {
      const text =
        e instanceof ApiError && e.code === "WRONG_PASSWORD"
          ? t.wrongPassword
          : e instanceof ApiError
            ? e.message
            : dict.common.somethingWrong;
      setPwStatus({ tone: "error", text });
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <Container className="max-w-3xl py-10 animate-fade-in">
      <DashboardTabs locale={locale} dict={dict} />
      <header className="mt-6">
        <h1 className="text-3xl font-black">{t.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.subtitle}</p>
      </header>

      <section
        aria-labelledby="profile-title"
        className="mt-6 rounded-[14px] border border-border bg-card p-5 shadow-card"
      >
        <h2 id="profile-title" className="font-extrabold">
          {t.profile}
        </h2>
        <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[8rem_1fr]">
          {user?.email && (
            <>
              <dt className="text-muted">{t.email}</dt>
              <dd>
                <bdi dir="ltr">{user.email}</bdi>
              </dd>
            </>
          )}
          {user?.phone && (
            <>
              <dt className="text-muted">{t.phone}</dt>
              <dd>
                <bdi dir="ltr">{user.phone}</bdi>
              </dd>
            </>
          )}
        </dl>
        <form onSubmit={saveName} className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-bold">{t.name}</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              autoComplete="name"
            />
          </label>
          <StatusLine status={nameStatus} />
          <Button
            type="submit"
            className="self-start"
            disabled={nameBusy || !name.trim() || name.trim() === user?.name}
          >
            {nameBusy ? <Spinner /> : t.save}
          </Button>
        </form>
      </section>

      <section
        aria-labelledby="password-title"
        className="mt-6 rounded-[14px] border border-border bg-card p-5 shadow-card"
      >
        <h2 id="password-title" className="font-extrabold">
          {t.password}
        </h2>
        <form onSubmit={savePassword} className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-bold">{t.currentPassword}</span>
            <Input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              autoComplete="current-password"
              dir="ltr"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-bold">{t.newPassword}</span>
              <Input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
                minLength={8}
                maxLength={100}
                autoComplete="new-password"
                dir="ltr"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-bold">{t.repeatPassword}</span>
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
          </div>
          <p className="text-xs text-muted">{t.passwordHint}</p>
          <StatusLine status={pwStatus} />
          <Button type="submit" className="self-start" disabled={pwBusy}>
            {pwBusy ? <Spinner /> : t.changePassword}
          </Button>
        </form>
      </section>

      <TelegramConnect locale={locale} dict={dict} />
    </Container>
  );
}
