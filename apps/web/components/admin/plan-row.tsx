"use client";

import { useParams } from "next/navigation";
import { VariantFields } from "./variant-fields";
import { SupplierMappingFields } from "./supplier-mapping-fields";
import type { ProductVariant, SupplierMapping } from "@/lib/product-variant";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import type { Dictionary } from "@/app/[locale]/dictionaries";

export type EditablePlan = {
  id: string;
  label: string;
  price: number;
  salePrice: number | null;
  isActive: boolean;
  sortOrder?: number;
  activationTerms?: string | null;
  availableStock: number;
  inventory: { available: number; reserved: number; sold: number };
  supplierAvailability:
    | { kind: "confirmed"; count: number }
    | { kind: "onRequest" | "unconfirmed" }
    | null;
  currency: string;
  durationDays?: number | null;
  source?: "INTERNAL" | "SUPPLIER";
  variant?: ProductVariant | null;
  supplierMappings?: SupplierMapping[];
};

export function PlanRow({
  plan,
  dict,
  token,
  onChanged,
}: {
  plan: EditablePlan;
  dict: Dictionary;
  token: string | undefined;
  onChanged: () => void;
}) {
  const t = dict.admin;
  const fa = useParams().locale === "fa";
  const number = new Intl.NumberFormat(fa ? "fa-IR" : "en-US");
  const [variant, setVariant] = useState<ProductVariant | null>(plan.variant ?? null);
  const [source, setSource] = useState(plan.source ?? "INTERNAL");
  const [duration, setDuration] = useState(
    plan.durationDays != null ? String(plan.durationDays) : "",
  );
  const [mappings, setMappings] = useState<SupplierMapping[]>(plan.supplierMappings ?? []);
  const [label, setLabel] = useState(plan.label);
  const [price, setPrice] = useState(String(plan.price));
  const [sale, setSale] = useState(plan.salePrice != null ? String(plan.salePrice) : "");
  const [active, setActive] = useState(plan.isActive);
  const [sortOrder, setSortOrder] = useState(String(plan.sortOrder ?? 0));
  const [activationTerms, setActivationTerms] = useState(plan.activationTerms ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!token) return;
    setBusy(true);
    setErr(null);
    const nextTerms = activationTerms.trim() || null;
    try {
      await api.patch(
        `/admin/plans/${plan.id}`,
        {
          label,
          price: Number(price),
          salePrice: sale.trim() ? Number(sale) : null,
          isActive: active,
          ...(Number(sortOrder) !== (plan.sortOrder ?? 0) ? { sortOrder: Number(sortOrder) } : {}),
          ...(nextTerms !== (plan.activationTerms ?? null) ? { activationTerms: nextTerms } : {}),
          variant,
          source,
          durationDays: duration.trim() ? Number(duration) : null,
          supplierMappings: mappings.map(
            ({ supplier, externalId, fingerprint, automaticVerified }) => ({
              supplier,
              externalId,
              fingerprint,
              automaticVerified,
            }),
          ),
        },
        token,
      );
      onChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : dict.common.somethingWrong);
      setBusy(false);
    }
  }

  async function remove() {
    if (!token) return;
    setBusy(true);
    setErr(null);
    try {
      await api.del(`/admin/plans/${plan.id}`, token);
      onChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : dict.common.somethingWrong);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-32 flex-1">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">{t.planLabel}</span>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
        </div>
        <div className="w-28">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">{t.price}</span>
            <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
        </div>
        <div className="w-32">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">{t.salePrice}</span>
            <Input type="number" value={sale} onChange={(e) => setSale(e.target.value)} />
          </label>
        </div>
      </div>
      {plan.source === "SUPPLIER" ? (
        <Badge tone="primary">
          {plan.supplierAvailability?.kind === "confirmed"
            ? fa
              ? `${number.format(plan.supplierAvailability.count)} نزد تأمین‌کننده`
              : `${number.format(plan.supplierAvailability.count)} at supplier`
            : plan.supplierAvailability?.kind === "onRequest"
              ? fa
                ? "تأمین‌کننده · با استعلام"
                : "Supplier · on request"
              : fa
                ? "تأمین‌کننده · موجودی تأیید نشده"
                : "Supplier · stock unconfirmed"}
        </Badge>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Badge tone={plan.isActive && plan.inventory.available > 0 ? "primary" : "muted"}>
            {number.format(plan.inventory.available)}{" "}
            {fa
              ? plan.isActive
                ? "آزاد"
                : "آزاد در پلن غیرفعال"
              : plan.isActive
                ? "available"
                : "available on inactive plan"}
          </Badge>
          <Badge tone="muted">
            {number.format(plan.inventory.reserved)} {fa ? "رزرو" : "reserved"}
          </Badge>
          <Badge tone="muted">
            {number.format(plan.inventory.sold)} {fa ? "فروخته‌شده" : "sold"}
          </Badge>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="accent-primary"
          />
          {t.active}
        </label>
        <Button size="sm" onClick={save} disabled={busy}>
          {busy ? <Spinner /> : t.save}
        </Button>
        <Button size="sm" variant="outline" onClick={remove} disabled={busy}>
          {t.removeRow}
        </Button>
        {err && <span className="text-sm text-danger">{err}</span>}
      </div>
      <details className="rounded-lg border border-border p-3">
        <summary className="cursor-pointer py-2 text-sm font-medium">
          {fa ? "مشخصات تنوع و منابع" : "Configuration and sources"}
        </summary>
        <div className="mt-4 space-y-4">
          <label className="block text-sm">
            {fa ? "اولویت انتخاب پیش‌فرض (۰ تا ۱۰۰۰)" : "Default selection priority (0–1000)"}
            <Input
              type="number"
              min={0}
              max={1000}
              step={1}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            {fa
              ? "مدت اشتراک — روز؛ خالی یعنی بدون انقضا"
              : "Subscription duration — days; blank is perpetual"}
            <Input
              type="number"
              min={1}
              value={duration}
              onChange={(e) => {
                setDuration(e.target.value);
                setMappings([]);
              }}
            />
          </label>
          <label className="block text-sm">
            {fa ? "منبع تأمین" : "Inventory source"}
            <select
              value={source}
              onChange={(e) => {
                setSource(e.target.value as "INTERNAL" | "SUPPLIER");
                setMappings([]);
              }}
              className="h-11 w-full rounded-xl border border-border bg-card px-3"
            >
              <option value="INTERNAL">{fa ? "موجودی داخلی" : "Internal inventory"}</option>
              <option value="SUPPLIER">
                {fa ? "تأمین‌کنندهٔ API — فعلاً فقط استعلام" : "Supplier API — inquiry only"}
              </option>
            </select>
          </label>
          <VariantFields
            value={variant}
            onChange={(v) => {
              setVariant(v);
              setMappings([]);
            }}
            fa={fa}
          />
          {source === "SUPPLIER" && variant && (
            <SupplierMappingFields
              mappings={mappings}
              onChange={setMappings}
              token={token}
              fa={fa}
            />
          )}
          <label className="block text-sm">
            {fa
              ? "شرایط و ضوابط فعال‌سازی این پلن (اختیاری)"
              : "Plan activation terms (optional)"}
            <textarea
              rows={4}
              maxLength={4000}
              value={activationTerms}
              onChange={(e) => setActivationTerms(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-card p-3 text-sm leading-6 text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            />
          </label>
          <Button onClick={save} disabled={busy}>
            {t.save}
          </Button>
          {err && (
            <p role="alert" className="text-sm text-danger">
              {err}
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
