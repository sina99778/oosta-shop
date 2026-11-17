"use client";
import { useState } from "react";
import { useApi } from "@/lib/use-api";
import { Button } from "@/components/ui/button";
import type { SupplierMapping } from "@/lib/product-variant";
export type SupplierOfferDto = {
  supplier: string;
  externalId: string;
  name: string;
  description: string;
  cost: string;
  currency: string;
  stock: number | null;
  onRequest: boolean;
  delivery: string;
  fingerprint: string;
  flags: string[];
  warranty: { kind: string; days: number };
};
export type FxStatus = {
  configured: boolean;
  source: "NAVASAN_FREE";
  usedLast31Days: number;
  budget: number;
  intervalHours: number;
  nextAttemptAt: string | null;
  expiresAt: string | null;
  blocked: boolean;
  lastError: string | null;
  snapshot: null | {
    fetchedAt: string;
    rates: Partial<Record<"USD" | "USDT", { irr: string; updatedAt: string }>>;
  };
};
export type SupplierOverview = {
  fx?: FxStatus;
  suppliers: Array<{
    id: string;
    label: string;
    configured: boolean;
    catalog: null | {
      supplier: string;
      fetchedAt: string;
      offers: SupplierOfferDto[];
      rejected: number;
    };
  }>;
  pricing: PricingForm | null;
};
export type PricingForm = {
  enabled: boolean;
  rateSource?: "MANUAL" | "NAVASAN_FREE";
  rates: { USD?: string; USDT?: string };
  markupPercent: string;
  minimumProfitIrr: string;
  fixedCostIrr: string;
  ttlSeconds: number;
  updatedAt?: string;
};
export function SupplierMappingFields({
  mappings,
  onChange,
  token,
  fa,
}: {
  mappings: SupplierMapping[];
  onChange: (m: SupplierMapping[]) => void;
  token: string | undefined;
  fa: boolean;
}) {
  const { data, loading, error, refetch } = useApi<SupplierOverview>(
    token ? "/admin/suppliers" : null,
    token,
  );
  const [supplier, setSupplier] = useState("");
  const [offerId, setOfferId] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [autoVerified, setAutoVerified] = useState(false);
  const selected = data?.suppliers.find((s) => s.id === supplier);
  const offer = selected?.catalog?.offers.find((o) => o.externalId === offerId);
  const cls = "h-11 w-full rounded-xl border border-border bg-card px-3 text-sm";
  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <h3 className="text-sm font-medium">
        {fa ? "منابع تأییدشدهٔ همین تنوع" : "Reviewed sources for this configuration"}
      </h3>
      {loading && (
        <p className="text-sm text-muted">{fa ? "در حال خواندن کاتالوگ…" : "Loading catalogs…"}</p>
      )}
      {error && (
        <Button variant="outline" onClick={refetch}>
          {fa ? "تلاش دوباره" : "Try again"}
        </Button>
      )}
      <label className="block text-sm">
        {fa ? "تأمین‌کننده" : "Supplier"}
        <select
          className={cls}
          value={supplier}
          onChange={(e) => {
            setSupplier(e.target.value);
            setOfferId("");
            setReviewed(false);
            setAutoVerified(false);
          }}
        >
          <option value="">{fa ? "انتخاب کنید" : "Select"}</option>
          {data?.suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label} {!s.catalog ? (fa ? "— کاتالوگ دریافت نشده" : "— no catalog") : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        {fa ? "کالای تأمین‌کننده" : "Supplier product"}
        <select
          className={cls}
          value={offerId}
          onChange={(e) => {
            setOfferId(e.target.value);
            setReviewed(false);
            setAutoVerified(false);
          }}
        >
          <option value="">{fa ? "انتخاب کنید" : "Select"}</option>
          {selected?.catalog?.offers.map((o) => (
            <option key={o.externalId} value={o.externalId}>
              {o.name} — {o.cost} {o.currency}
            </option>
          ))}
        </select>
      </label>
      {offer && (
        <div className="space-y-2 rounded-lg bg-surface p-3 text-xs leading-6">
          <p className="whitespace-pre-wrap break-words">{offer.description || offer.name}</p>
          <p>
            {fa ? "موجودی گزارش‌شده: " : "Reported stock: "}
            {offer.stock ?? (fa ? "نامشخص" : "Unknown")} · {offer.delivery}
          </p>
          {offer.flags.length > 0 && (
            <p className="text-danger">
              {fa ? "نیازمند بررسی: " : "Review flags: "}
              {offer.flags.join(" / ")}
            </p>
          )}
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            {fa
              ? "پلن، مدت، ضمانت، ریجن و نوع دریافت این منبع را تطبیق داده‌ام"
              : "I verified plan, duration, warranty, region and delivery type"}
          </label>
          {offer.delivery === "UNVERIFIED" && (
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={autoVerified}
                onChange={(e) => setAutoVerified(e.target.checked)}
              />
              {fa
                ? "تحویل خودکار این منبع را جداگانه تأیید کرده‌ام"
                : "I separately verified automatic fulfillment"}
            </label>
          )}
          <Button
            type="button"
            size="sm"
            disabled={
              !reviewed ||
              mappings.some((m) => m.supplier === supplier && m.externalId === offer.externalId)
            }
            onClick={() => {
              onChange([
                ...mappings,
                {
                  supplier,
                  externalId: offer.externalId,
                  fingerprint: offer.fingerprint,
                  automaticVerified: autoVerified,
                },
              ]);
              setReviewed(false);
            }}
          >
            {fa ? "افزودن به منابع این پلن" : "Add to this plan"}
          </Button>
        </div>
      )}
      {mappings.map((m) => (
        <div
          key={m.supplier + ":" + m.externalId}
          className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-xs"
        >
          <span className="min-w-0 break-words">
            {data?.suppliers.find((s) => s.id === m.supplier)?.label ?? m.supplier} ·{" "}
            {data?.suppliers
              .find((s) => s.id === m.supplier)
              ?.catalog?.offers.find((o) => o.externalId === m.externalId)?.name ?? m.externalId}
          </span>
          <button
            type="button"
            className="min-h-11 text-danger"
            onClick={() => onChange(mappings.filter((x) => x !== m))}
          >
            {fa ? "حذف" : "Remove"}
          </button>
        </div>
      ))}
      <p className="text-xs leading-6 text-muted">
        {fa
          ? "پس از تطبیق، دکمهٔ ذخیرهٔ پلن را بزن. تغییر مشخصات پلن، تأیید منابع قبلی را باطل می‌کند."
          : "Save the plan after reviewing. Changing its terms invalidates existing source approvals."}
      </p>
    </div>
  );
}
