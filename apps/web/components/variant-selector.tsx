"use client";
import { useState } from "react";
import type { PlanDetail } from "@/lib/types";
import {
  availabilityLabel,
  availabilityOf,
  isStockedPlan,
  plansByAvailability,
} from "@/lib/product-availability";
import {
  planDisplayLabel,
  planOptionValue,
  planTrustSummary,
  variantDescription,
} from "@/lib/product-variant";
import { formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { IndicativePriceLabel } from "./indicative-price";

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

function quickChoices(plans: PlanDetail[]) {
  const choices = new Map<string, PlanDetail>();
  const price = (plan: PlanDetail) =>
    plan.quoteRequired || plan.source === "SUPPLIER"
      ? (plan.indicativePrice?.amount ?? Infinity)
      : plan.effectivePrice * (plan.currency === "IRT" ? 10 : 1);
  for (const plan of plans) {
    if (!isStockedPlan(plan)) continue;
    const key = plan.variant
      ? JSON.stringify([planDisplayLabel(plan.label, true).toLowerCase(), values(plan)])
      : plan.id;
    const existing = choices.get(key);
    if (
      !existing ||
      ((existing.sortOrder ?? 0) === (plan.sortOrder ?? 0) && price(plan) < price(existing))
    ) {
      choices.set(key, plan);
    }
  }
  return [...choices.values()].slice(0, 4);
}
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
  const sorted = plansByAvailability(plans);
  const quick = plans.length > 1 ? quickChoices(sorted) : [];
  const hasVariants = plans.some((plan) => plan.variant);
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
  const shown = sorted.filter((p) => matches(p));
  function price(plan: PlanDetail) {
    const availability = availabilityOf(plan);
    if (plan.source === "SUPPLIER" || plan.quoteRequired) {
      if (!isStockedPlan(plan) && !plan.supplierStockUnconfirmed && availability !== "ON_REQUEST")
        return null;
      return (
        <IndicativePriceLabel
          price={isStockedPlan(plan) ? plan.indicativePrice : null}
          locale={locale}
          compact
        />
      );
    }
    return (
      <span className="font-semibold">
        {plan.onSale && (
          <bdi className="me-2 text-xs text-muted line-through">
            {formatPrice(plan.price, plan.currency, locale)}
          </bdi>
        )}
        <bdi>{formatPrice(plan.effectivePrice, plan.currency, locale)}</bdi>
      </span>
    );
  }
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
    <>
      {quick.length > 0 && (
        <div
          role="group"
          aria-label={fa ? "انتخاب سریع پلن" : "Quick plan selection"}
          className="mt-4"
        >
          <p className="mb-2 text-sm font-semibold">
            {fa ? "انتخاب سریع پلن" : "Quick plan selection"}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {quick.map((plan) => {
              const summary = planTrustSummary(plan, locale);
              return (
                <button
                  key={plan.id}
                  type="button"
                  data-plan-id={plan.id}
                  aria-pressed={value === plan.id}
                  onClick={() => {
                    if (!matches(plan)) setFilters({});
                    onChange(plan.id);
                  }}
                  className="min-w-0 rounded-xl border border-border bg-card p-3 text-start hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary aria-pressed:border-primary aria-pressed:bg-primary/10"
                >
                  <bdi className="block text-sm font-semibold wrap-anywhere">
                    {planDisplayLabel(plan.label, fa)}
                  </bdi>
                  <span className="mt-1 block text-xs leading-5 text-muted wrap-anywhere">
                    {summary.access}
                  </span>
                  <span className="block text-xs leading-5 text-muted wrap-anywhere">
                    {summary.warranty}
                  </span>
                  {plan.variant && (
                    <span className="block text-xs leading-5 text-muted wrap-anywhere">
                      {summary.delivery}
                    </span>
                  )}
                  <span className="mt-2 block text-sm">{price(plan)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <details
        className="mt-4 rounded-xl border border-border"
        open={!hasVariants && plans.length === 1}
      >
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
            {hasVariants &&
              facets
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
                    {price(p)}
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
    </>
  );
}
