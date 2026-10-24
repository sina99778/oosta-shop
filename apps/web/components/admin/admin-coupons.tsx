"use client";

// Discount codes: create, pause/resume and delete. Each code is drawn as a
// perforated coupon with its percentage, usage and limits.

import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Container } from "@/components/ui/container";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/app/[locale]/dictionaries";

type Coupon = {
  id: string;
  code: string;
  percent: number;
  maxUses: number | null;
  minAmount: number | null;
  expiresAt: string | null;
  isActive: boolean;
  botOnly: boolean;
  used: number;
};

// Readable random code: no 0/O/1/I to avoid typos when read aloud.
function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export function AdminCoupons({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { token } = useAuth();
  const t = dict.admin.coupons;
  const [reload, setReload] = useState(0);
  const { data, loading } = useApi<{ coupons: Coupon[] }>(
    token ? `/admin/coupons?_r=${reload}` : null,
    token ?? undefined,
  );
  const num = (n: number) => new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(n);

  const [code, setCode] = useState("");
  const [percent, setPercent] = useState("10");
  const [maxUses, setMaxUses] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [botOnly, setBotOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(
        "/admin/coupons",
        {
          code,
          percent: Number(percent),
          maxUses: maxUses ? Number(maxUses) : null,
          minAmount: minAmount ? Number(minAmount) : null,
          // End of the chosen day, local time.
          expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
          botOnly,
        },
        token ?? undefined,
      );
      setCode("");
      setMaxUses("");
      setMinAmount("");
      setExpiresAt("");
      setBotOnly(false);
      setReload((r) => r + 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : dict.common.somethingWrong);
    } finally {
      setBusy(false);
    }
  }

  async function act(id: string, run: () => Promise<unknown>) {
    setRowBusy(id);
    try {
      await run();
      setReload((r) => r + 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : dict.common.somethingWrong);
    } finally {
      setRowBusy(null);
    }
  }

  const coupons = data?.coupons ?? [];

  return (
    <Container className="space-y-6 py-8">
      <header>
        <h1 className="text-2xl font-black">{t.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.subtitle}</p>
      </header>

      <form
        onSubmit={create}
        className="rounded-[14px] border border-border bg-card p-5 shadow-card"
        aria-labelledby="new-coupon"
      >
        <h2 id="new-coupon" className="font-extrabold">
          {t.new}
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="flex flex-col gap-1 text-sm lg:col-span-2">
            <label htmlFor="coupon-code" className="font-bold">
              {t.code}
            </label>
            <span className="flex gap-2">
              <Input
                id="coupon-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required
                minLength={2}
                maxLength={40}
                pattern="[A-Za-z0-9_\-]+"
                dir="ltr"
                className="font-mono uppercase"
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0 whitespace-nowrap"
                onClick={() => setCode(randomCode())}
              >
                {t.generate}
              </Button>
            </span>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-bold">{t.percent}</span>
            <Input
              type="number"
              min={1}
              max={90}
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              required
              dir="ltr"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-bold">{t.maxUses}</span>
            <Input
              type="number"
              min={1}
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              placeholder={t.unlimited}
              dir="ltr"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-bold">{t.minAmount}</span>
            <Input
              type="number"
              min={0}
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              placeholder={t.none}
              dir="ltr"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm lg:col-span-2">
            <span className="font-bold">{t.expiresAt}</span>
            <Input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              dir="ltr"
            />
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={botOnly}
            onChange={(e) => setBotOnly(e.target.checked)}
            className="size-4 accent-[var(--c-primary)]"
          />
          {t.botOnly}
        </label>
        <p className="mt-3 text-xs leading-6 text-muted">{t.rules}</p>
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" className="mt-4" disabled={busy}>
          {busy ? <Spinner /> : t.create}
        </Button>
      </form>

      {loading ? (
        <Spinner className="size-6" />
      ) : coupons.length === 0 ? (
        <p className="text-sm text-muted">{t.empty}</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {coupons.map((c) => {
            const expired = c.expiresAt != null && new Date(c.expiresAt) <= new Date();
            const usedUp = c.maxUses != null && c.used >= c.maxUses;
            const live = c.isActive && !expired && !usedUp;
            const state = !c.isActive ? t.paused : expired ? t.expired : usedUp ? t.usedUp : t.live;
            return (
              <li
                key={c.id}
                className={cn(
                  "flex overflow-hidden rounded-[14px] border border-border bg-card shadow-card",
                  !live && "opacity-75",
                )}
              >
                {/* Stub: the percentage, torn off along a perforated edge */}
                <div
                  className={cn(
                    "relative grid w-24 shrink-0 place-items-center border-e-2 border-dashed border-border text-center",
                    live ? "bg-primary text-primary-foreground" : "bg-surface text-muted",
                  )}
                >
                  <span>
                    <span className="block text-3xl leading-none font-black">
                      {num(c.percent)}
                      {locale === "fa" ? "٪" : "%"}
                    </span>
                    <span className="mt-1 block text-[11px] font-bold">{t.off}</span>
                  </span>
                </div>
                <div className="min-w-0 flex-1 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <code className="truncate font-mono text-lg font-black" dir="ltr">
                        {c.code}
                      </code>
                      {c.botOnly && (
                        <span className="shrink-0 rounded-full bg-[#2a9fd8]/15 px-2 py-0.5 text-[11px] font-bold text-[#1d7fb0]">
                          {t.botBadge}
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold",
                        live ? "bg-success/15 text-success" : "bg-surface text-muted",
                      )}
                    >
                      {state}
                    </span>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted">
                    <dt>{t.usage}</dt>
                    <dd className="font-bold text-foreground">
                      {num(c.used)}
                      {c.maxUses != null ? ` ${t.of} ${num(c.maxUses)}` : ` · ${t.unlimited}`}
                    </dd>
                    <dt>{t.minAmount}</dt>
                    <dd className="text-foreground">
                      {c.minAmount != null ? num(c.minAmount) : t.none}
                    </dd>
                    <dt>{t.expiresAt}</dt>
                    <dd className="text-foreground">
                      {c.expiresAt ? formatDate(c.expiresAt, locale) : t.never}
                    </dd>
                  </dl>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={rowBusy === c.id}
                      onClick={() =>
                        act(c.id, () =>
                          api.patch(
                            `/admin/coupons/${c.id}`,
                            { isActive: !c.isActive },
                            token ?? undefined,
                          ),
                        )
                      }
                    >
                      {c.isActive ? t.pause : t.resume}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={rowBusy === c.id}
                      onClick={() => {
                        if (window.confirm(t.confirmDelete.replace("{code}", c.code))) {
                          void act(c.id, () =>
                            api.del(`/admin/coupons/${c.id}`, token ?? undefined),
                          );
                        }
                      }}
                    >
                      {t.delete}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Container>
  );
}
