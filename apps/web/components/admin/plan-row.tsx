"use client";

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
  availableStock: number;
  currency: string;
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
  const [label, setLabel] = useState(plan.label);
  const [price, setPrice] = useState(String(plan.price));
  const [sale, setSale] = useState(plan.salePrice != null ? String(plan.salePrice) : "");
  const [active, setActive] = useState(plan.isActive);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!token) return;
    setBusy(true);
    setErr(null);
    try {
      await api.patch(
        `/admin/plans/${plan.id}`,
        {
          label,
          price: Number(price),
          salePrice: sale.trim() ? Number(sale) : null,
          isActive: active,
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
          <label className="mb-1 block text-xs text-muted">{t.planLabel}</label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="w-28">
          <label className="mb-1 block text-xs text-muted">{t.price}</label>
          <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="w-32">
          <label className="mb-1 block text-xs text-muted">{t.salePrice}</label>
          <Input type="number" value={sale} onChange={(e) => setSale(e.target.value)} />
        </div>
        <Badge tone={plan.availableStock > 0 ? "success" : "muted"}>
          {plan.availableStock} {t.available}
        </Badge>
      </div>
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
    </div>
  );
}
