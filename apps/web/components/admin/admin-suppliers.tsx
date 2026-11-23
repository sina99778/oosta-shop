"use client";
import { SupplierQaPanel } from "./supplier-qa-panel";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { api, ApiError } from "@/lib/api";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PricingForm, SupplierOverview } from "./supplier-mapping-fields";
export function AdminSuppliers({ locale }: { locale: string }) {
  const fa = locale === "fa";
  const { token } = useAuth();
  const { data, error, loading, refetch } = useApi<SupplierOverview>(
    token ? "/admin/suppliers" : null,
    token ?? undefined,
  );
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  async function sync(id: string) {
    if (!token || busy) return;
    setBusy(id);
    setMessage("");
    try {
      await api.post(`/admin/suppliers/${id}/sync`, {}, token);
      refetch();
    } catch (e) {
      setMessage(
        e instanceof ApiError ? e.message : fa ? "به‌روزرسانی ناموفق بود" : "Unable to update",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <Container className="max-w-6xl space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">
          {fa ? "تأمین‌کننده‌ها و قیمت‌گذاری" : "Suppliers and pricing"}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
          {fa
            ? "این بخش فقط کاتالوگ را می‌خواند. خرید خارجی و برداشت از کیف پول فعال نیست. ضمانت نامشخص بدون ضمانت محسوب می‌شود؛ مشخصات هر منبع پیش از اتصال به پلن باید تطبیق داده شوند."
            : "This section reads catalogs only. Supplier purchases and wallet debits are disabled. Unspecified warranty is treated as no warranty. Review each source before mapping it."}
        </p>
      </div>
      {token && <SupplierQaPanel token={token} fa={fa} locale={locale} />}
      {loading && <p>{fa ? "در حال دریافت…" : "Loading…"}</p>}
      {error && <Button onClick={refetch}>{fa ? "تلاش دوباره" : "Try again"}</Button>}
      {message && (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      )}
      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.suppliers.map((s) => (
              <Card key={s.id}>
                <h2 className="font-medium" dir="auto">
                  {s.label}
                </h2>
                <p className="my-3 text-xs leading-6 text-muted">
                  {s.configured
                    ? fa
                      ? "کلید روی سرور تنظیم شده"
                      : "Server key configured"
                    : fa
                      ? "کلید روی سرور تنظیم نشده"
                      : "Server key missing"}
                  <br />
                  {s.catalog
                    ? `${s.catalog.offers.length} ${fa ? "عنوان در کاتالوگ" : "catalog offers"}`
                    : fa
                      ? "کاتالوگ دریافت نشده"
                      : "No catalog yet"}
                </p>
                {s.catalog && (
                  <time className="mb-3 block text-xs text-muted">
                    {new Date(s.catalog.fetchedAt).toLocaleString(fa ? "fa-IR" : "en-US")}
                  </time>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => sync(s.id)}
                  disabled={!s.configured || !!busy}
                >
                  {busy === s.id
                    ? fa
                      ? "در حال خواندن…"
                      : "Reading…"
                    : fa
                      ? "به‌روزرسانی کاتالوگ"
                      : "Refresh catalog"}
                </Button>
              </Card>
            ))}
          </div>
          {data.fx && (
            <Card>
              <h2 className="font-semibold">
                {fa ? "نوسان رایگان؛ نرخ نمونه‌برداری‌شده" : "Free Navasan sampled exchange rates"}
              </h2>
              <p className="mt-3 text-sm leading-7 text-muted">
                {fa
                  ? "دریافت مشترک هر ۸ ساعت؛ نرخ لحظه‌ای نیست و فقط برای برآورد استفاده می‌شود."
                  : "Shared fetch every 8 hours. Sampled rates are estimates, not live executable rates."}
              </p>
              <p className="mt-2 text-sm">
                {fa ? "مصرف ثبت‌شده در ۳۱ روز اخیر: " : "Recorded usage in last 31 days: "}
                {data.fx.usedLast31Days} / {data.fx.budget}
              </p>
              <p className="mt-2 text-xs text-muted">
                {data.fx.configured
                  ? fa
                    ? "کلید خصوصی تنظیم شده"
                    : "Private key configured"
                  : fa
                    ? "کلید تنظیم نشده"
                    : "Key missing"}
              </p>
              {data.fx.snapshot &&
                Object.entries(data.fx.snapshot.rates).map(
                  ([currency, rate]) =>
                    rate && (
                      <p key={currency} className="mt-3 text-xs leading-6">
                        {currency}: {Number(rate.irr).toLocaleString(fa ? "fa-IR" : "en-US")}{" "}
                        {fa ? "ریال — زمان نرخ منبع: " : "IRR — Source rate time: "}
                        <time>
                          {new Date(rate.updatedAt).toLocaleString(fa ? "fa-IR" : "en-US")}
                        </time>
                      </p>
                    ),
                )}
              {data.fx.nextAttemptAt && (
                <p className="mt-3 text-xs text-muted">
                  {fa ? "نوبت بعدی دریافت: " : "Next scheduled fetch: "}
                  {new Date(data.fx.nextAttemptAt).toLocaleString(fa ? "fa-IR" : "en-US")}
                </p>
              )}
              {data.fx.expiresAt && (
                <p className="mt-2 text-xs text-muted">
                  {fa ? "پایان دورهٔ محلی اشتراک: " : "Local subscription expiry: "}
                  {new Date(data.fx.expiresAt).toLocaleDateString(fa ? "fa-IR" : "en-US")}
                </p>
              )}
              {(data.fx.blocked || data.fx.lastError) && (
                <p role="status" className="mt-3 text-sm text-danger">
                  {fa
                    ? "آخرین دریافت موفق نبود؛ نرخ قدیمی تازه محسوب نمی‌شود. وضعیت: "
                    : "Last fetch failed; old rates retain their original age. Status: "}
                  {data.fx.lastError}
                </p>
              )}
            </Card>
          )}
          <PricingEditor
            key={data.pricing?.updatedAt ?? "empty"}
            initial={data.pricing}
            token={token!}
            fa={fa}
            onSaved={refetch}
          />
          <Card>
            <label className="mb-4 block text-sm">
              {fa ? "جست‌وجو در عنوان کالاهای منابع" : "Search supplier product names"}
              <Input value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
            {data.suppliers.map((s) => (
              <details key={s.id} className="mb-3 rounded-xl border border-border p-4">
                <summary className="cursor-pointer text-sm font-medium">
                  {s.label} · {s.catalog?.offers.length ?? 0}
                </summary>
                <div className="mt-4 space-y-3">
                  {s.catalog?.offers
                    .filter((o) => o.name.toLowerCase().includes(search.toLowerCase()))
                    .slice(0, 50)
                    .map((o) => (
                      <div key={o.externalId} className="rounded-xl bg-surface p-4">
                        <p className="text-sm font-medium" dir="auto">
                          {o.name}
                        </p>
                        <p className="mt-2 text-xs tabular-nums">
                          {o.cost} {o.currency} · {fa ? "موجودی" : "Stock"}:{" "}
                          {o.stock ?? (fa ? "نیازمند استعلام" : "On request")} · {o.delivery}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-6 text-muted">
                          {o.description}
                        </p>
                        {o.flags.length > 0 && (
                          <p className="mt-2 text-xs text-danger">{o.flags.join(" / ")}</p>
                        )}
                      </div>
                    ))}
                  <p className="text-xs text-muted">
                    {fa
                      ? "حداکثر ۵۰ نتیجه؛ برای محدود کردن فهرست جست‌وجو کن. اتصال منبع به پلن در صفحهٔ ویرایش محصول انجام می‌شود."
                      : "Up to 50 results. Search to narrow the list. Map offers in the product plan editor."}
                  </p>
                </div>
              </details>
            ))}
          </Card>
        </>
      )}
    </Container>
  );
}
function PricingEditor({
  initial,
  token,
  fa,
  onSaved,
}: {
  initial: PricingForm | null;
  token: string;
  fa: boolean;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<PricingForm>(
    initial ?? {
      enabled: false,
      rateSource: "NAVASAN_FREE",
      rates: {},
      markupPercent: "30",
      minimumProfitIrr: "0",
      fixedCostIrr: "0",
      ttlSeconds: 300,
    },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const input = {
        enabled: form.enabled,
        rateSource: form.rateSource ?? "MANUAL",
        rates: form.rates,
        markupPercent: form.markupPercent,
        minimumProfitIrr: "0",
        fixedCostIrr: form.fixedCostIrr,
        ttlSeconds: form.ttlSeconds,
      };
      const rates = Object.fromEntries(
        Object.entries(input.rates).filter(([, value]) => !!value?.trim()),
      );
      await api.patch("/admin/suppliers/pricing", { ...input, rates }, token);
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : fa ? "ذخیره نشد" : "Unable to save");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold">
        {fa ? "سیاست قیمت‌گذاری و منبع نرخ ارز" : "Pricing policy and exchange-rate source"}
      </h2>
      <p className="mb-5 text-xs leading-6 text-muted">
        {fa
          ? "نوسان رایگان هر ۸ ساعت نمونه‌برداری می‌شود. افزایش پیش‌فرض ۳۰٪ روی قیمت ارزی و پیش از تبدیل است؛ کف سود ریالی نداریم. هزینهٔ ثابت بعد از تبدیل اضافه می‌شود. خرید خارجی همچنان بسته است."
          : "Free Navasan is sampled every 8 hours. Default markup is 30% before currency conversion, with no Rial profit floor. Fixed fees are added after conversion. Supplier checkout remains disabled."}
      </p>
      <form onSubmit={save} className="space-y-4">
        <label className="block text-sm">
          {fa ? "منبع نرخ ارز" : "Exchange-rate source"}
          <select
            className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3"
            value={form.rateSource ?? "MANUAL"}
            onChange={(e) =>
              setForm({ ...form, rateSource: e.target.value as "MANUAL" | "NAVASAN_FREE" })
            }
          >
            <option value="NAVASAN_FREE">
              {fa ? "نوسان رایگان — نرخ نمونه‌برداری‌شده" : "Free Navasan — sampled rates"}
            </option>
            <option value="MANUAL">
              {fa ? "نرخ دستی با اعتبار کوتاه" : "Short-lived manual rates"}
            </option>
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          {form.rateSource !== "NAVASAN_FREE" &&
            (["USD", "USDT"] as const).map((currency) => (
              <label key={currency} className="text-sm">
                {fa ? `هزینهٔ خرید هر ${currency} به ریال` : `Purchase rate per ${currency} in IRR`}
                <Input
                  inputMode="decimal"
                  value={form.rates[currency] ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, rates: { ...form.rates, [currency]: e.target.value } })
                  }
                />
              </label>
            ))}
          <label className="text-sm">
            {fa
              ? "درصد افزایش روی قیمت دلاری/تتری تأمین‌کننده"
              : "Markup percent on supplier USD/USDT cost"}
            <Input
              inputMode="decimal"
              value={form.markupPercent}
              onChange={(e) => setForm({ ...form, markupPercent: e.target.value })}
              required
            />
          </label>
          <label className="text-sm">
            {fa ? "هزینهٔ ثابت هر سفارش — ریال" : "Fixed cost per order — IRR"}
            <Input
              inputMode="numeric"
              value={form.fixedCostIrr}
              onChange={(e) => setForm({ ...form, fixedCostIrr: e.target.value })}
              required
            />
          </label>
          <label className="text-sm">
            {fa ? "اعتبار نرخ — ثانیه (۶۰ تا ۹۰۰)" : "Rate validity — seconds (60–900)"}
            <Input
              type="number"
              min={60}
              max={900}
              value={form.ttlSeconds}
              onChange={(e) => setForm({ ...form, ttlSeconds: Number(e.target.value) })}
            />
          </label>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          {fa
            ? "محاسبهٔ برآورد قیمت با این تنظیمات فعال شود؛ خرید خارجی همچنان بسته است"
            : "Enable indicative quotes with these settings; supplier checkout remains disabled"}
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy
            ? fa
              ? "در حال ذخیره…"
              : "Saving…"
            : fa
              ? "ثبت سیاست و نرخ‌ها"
              : "Save policy and rates"}
        </Button>
      </form>
    </Card>
  );
}
