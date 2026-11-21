"use client";
import { useState } from "react";
import type { PlanDetail } from "@/lib/types";
import { availabilityLabel, availabilityOf } from "@/lib/product-availability";
import { planDisplayLabel, planOptionValue, variantDescription } from "@/lib/product-variant";
import { formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";

type Facet =
  | "plan"
  | "duration"
  | "fulfillment"
  | "access"
  | "warranty"
  | "delivery"
  | "region"
  | "quota";
const facets: Facet[] = [
  "plan",
  "duration",
  "fulfillment",
  "access",
  "warranty",
  "delivery",
  "region",
  "quota",
];
function values(p: PlanDetail): Record<Facet, string> {
  const v = p.variant;
  return {
    plan: v?.plan ?? p.label,
    duration: String(p.durationDays ?? (p.quoteRequired ? "unspecified" : "perpetual")),
    fulfillment: v?.fulfillment ?? "LEGACY",
    access: v?.access ?? "LEGACY",
    warranty:
      v?.warranty.kind === "WARRANTED" ? `${v.warranty.coverage}:${v.warranty.days}` : "NONE",
    delivery: v?.delivery ?? "AUTOMATIC",
    region: v?.region ?? "LEGACY",
    quota: v?.quota ?? "LEGACY",
  };
}
export function VariantSelector({
  plans,
  value,
  onChange,
  locale,
}: {
  plans: PlanDetail[];
  value: string | null;
  onChange: (id: string | null) => void;
  locale: Locale;
}) {
  const fa = locale === "fa";
  const [filters, setFilters] = useState<Partial<Record<Facet, string>>>({});
  const names: Record<Facet, string> = {
    plan: fa ? "پلن" : "Plan",
    duration: fa ? "مدت اشتراک" : "Duration",
    fulfillment: fa ? "نوع دریافت" : "Delivery type",
    access: fa ? "نوع دسترسی" : "Access",
    warranty: fa ? "ضمانت" : "Warranty",
    delivery: fa ? "شیوهٔ تحویل" : "Fulfillment",
    region: fa ? "ریجن" : "Region",
    quota: fa ? "سهمیه / محدودیت" : "Quota / limits",
  };
  const matches = (p: PlanDetail, f = filters) =>
    Object.entries(f).every(([key, val]) => !val || values(p)[key as Facet] === val);
  const shown = plans.filter((p) => matches(p));
  function label(f: Facet, val: string) {
    if (val === "LEGACY") return fa ? "مشخص نشده" : "Unspecified";
    if (f === "duration")
      return val === "unspecified"
        ? fa
          ? "طبق عنوان پلن"
          : "See plan title"
        : val === "perpetual"
          ? fa
            ? "بدون انقضا"
            : "Perpetual"
          : `${Number(val).toLocaleString(fa ? "fa-IR" : "en-US")} ${fa ? "روز" : "days"}`;
    if (f === "warranty")
      return val === "NONE"
        ? fa
          ? "بدون ضمانت"
          : "No warranty"
        : `${Number(val.split(":")[1]).toLocaleString(fa ? "fa-IR" : "en-US")} ${fa ? "روز" : "days"} · ${val.startsWith("FULL:") ? (fa ? "پوشش کامل" : "Full coverage") : fa ? "مشکل ورود" : "Login only"}`;
    const translated: Record<string, string> = {
      ACCOUNT: fa ? "اکانت آماده" : "Ready account",
      INVITE: fa ? "اینوایتی" : "Invitation",
      CODE: fa ? "کد فعال‌سازی" : "Redeem code",
      UPGRADE: fa ? "فعال‌سازی روی حساب" : "Account upgrade",
      PERSONAL: fa ? "اختصاصی" : "Individual",
      SHARED: fa ? "اشتراکی" : "Shared",
      TEAM: fa ? "تیمی" : "Team",
      AUTOMATIC: fa ? "خودکار" : "Automatic",
      MANUAL: fa ? "دستی" : "Manual",
    };
    return translated[val] ?? planOptionValue(val, fa);
  }
  return (
    <details className="mt-4 rounded-xl border border-border">
      <summary className="oosta-disclosure min-h-14 p-4 focus-visible:outline-2 focus-visible:outline-primary">
        <span className="min-w-0">
          <span className="block font-medium">
            {fa ? "انتخاب نوع اشتراک" : "Choose subscription"}
          </span>
          <span className="mt-1 flex flex-wrap gap-x-2 text-sm text-muted">
            {value ? (
              <bdi dir={fa ? "rtl" : "ltr"}>
                {planDisplayLabel(plans.find((p) => p.id === value)?.label ?? "", fa)}
              </bdi>
            ) : fa ? (
              "برای انتخاب، گزینه‌ها را باز کن"
            ) : (
              "Expand to choose"
            )}
            <span aria-hidden="true">·</span>
            <bdi>
              {plans.length.toLocaleString(fa ? "fa-IR" : "en-US")} {fa ? "گزینه" : "options"}
            </bdi>
          </span>
        </span>
      </summary>
      <div className="space-y-4 border-t border-border p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {facets
            .filter((f) => new Set(plans.map((p) => values(p)[f])).size > 1)
            .map((f) => (
              <label key={f} className="block text-sm">
                <span className="mb-2 block text-muted">{names[f]}</span>
                <select
                  value={filters[f] ?? ""}
                  onChange={(e) => {
                    setFilters({ ...filters, [f]: e.target.value });
                    onChange(null);
                  }}
                  className="h-11 w-full rounded-xl border border-border bg-card px-3 text-foreground"
                >
                  <option value="">{fa ? "همهٔ گزینه‌ها" : "All options"}</option>
                  {[...new Set(plans.map((p) => values(p)[f]))].map((option) => (
                    <option
                      key={option}
                      value={option}
                      disabled={!plans.some((p) => matches(p, { ...filters, [f]: option }))}
                    >
                      {label(f, option)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
        </div>
        {Object.values(filters).some(Boolean) && (
          <button
            type="button"
            className="min-h-11 text-sm text-primary underline underline-offset-4"
            onClick={() => {
              setFilters({});
              onChange(null);
            }}
          >
            {fa ? "پاک کردن فیلترها" : "Clear filters"}
          </button>
        )}
        <fieldset className="max-h-[32rem] space-y-2 overflow-y-auto overscroll-contain px-1 py-2">
          <legend className="mb-3 text-sm font-medium">
            {fa ? "ترکیب موردنظرت را انتخاب کن" : "Choose your configuration"}
          </legend>
          {shown.map((p) => (
            <label
              key={p.id}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${p.id === value ? "border-primary bg-primary/5" : "border-border"}`}
            >
              <input
                type="radio"
                name="product-variant"
                value={p.id}
                checked={p.id === value}
                onChange={() => onChange(p.id)}
                className="mt-1 accent-primary"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">
                  <bdi dir={fa ? "rtl" : "ltr"}>{planDisplayLabel(p.label, fa)}</bdi>
                </span>
                {p.variant && (
                  <span className="mt-2 block text-xs leading-6 text-muted">
                    {variantDescription(p.variant, fa)}
                  </span>
                )}
                <span className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded border border-border px-2 py-0.5">
                    {availabilityLabel(p, locale)}
                  </span>
                  {availabilityOf(p) === "SUPPLIER_STOCK" && p.availableStock > 0 && (
                    <span className="text-muted">
                      {p.availableStock.toLocaleString(fa ? "fa-IR" : "en-US")}{" "}
                      {fa ? "عدد نزد تأمین‌کننده" : "at supplier"}
                    </span>
                  )}
                  {!p.quoteRequired && (
                    <bdi>{formatPrice(p.effectivePrice, p.currency, locale)}</bdi>
                  )}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        {!shown.length && (
          <p role="status" className="text-sm text-muted">
            {fa
              ? "این ترکیب در دسترس نیست؛ فیلترها را تغییر بده"
              : "This combination is unavailable. Change the filters."}
          </p>
        )}
      </div>
    </details>
  );
}
