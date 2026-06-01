"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { api, ApiError } from "@/lib/api";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { ProductType } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

type AdminPlan = {
  id: string;
  label: string;
  durationDays: number | null;
  price: number;
  currency: string;
  isActive: boolean;
  availableStock: number;
};
type AdminProductDetailDto = {
  id: string;
  name: string;
  slug: string;
  type: ProductType;
  isActive: boolean;
  category: { name: string };
  plans: AdminPlan[];
};

const selectClass = "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm";

export function AdminProductDetail({
  locale,
  productId,
  dict,
}: {
  locale: Locale;
  productId: string;
  dict: Dictionary;
}) {
  const { token } = useAuth();
  const t = dict.admin;
  const [reload, setReload] = useState(0);
  const { data, loading } = useApi<{ product: AdminProductDetailDto }>(
    token ? `/admin/products/${productId}?_r=${reload}` : null,
    token ?? undefined,
  );

  const [plLabel, setPlLabel] = useState("");
  const [plPrice, setPlPrice] = useState("");
  const [plBusy, setPlBusy] = useState(false);
  const [plErr, setPlErr] = useState<string | null>(null);

  const [bulkPlan, setBulkPlan] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  if (loading) {
    return (
      <Container className="py-20 text-center">
        <Spinner className="size-6" />
      </Container>
    );
  }
  if (!data) {
    return (
      <Container className="py-20 text-center text-muted">{dict.common.somethingWrong}</Container>
    );
  }
  const product = data.product;

  async function toggleActive() {
    try {
      await api.patch(
        `/admin/products/${product.id}`,
        { isActive: !product.isActive },
        token ?? undefined,
      );
    } catch {
      /* surfaced on next load */
    }
    setReload((r) => r + 1);
  }

  async function addPlan(event: FormEvent) {
    event.preventDefault();
    setPlBusy(true);
    setPlErr(null);
    try {
      await api.post(
        `/admin/products/${product.id}/plans`,
        { label: plLabel, price: Number(plPrice) },
        token ?? undefined,
      );
      setPlLabel("");
      setPlPrice("");
      setReload((r) => r + 1);
    } catch (err) {
      setPlErr(err instanceof ApiError ? err.message : dict.common.somethingWrong);
    } finally {
      setPlBusy(false);
    }
  }

  function parseBulk(): Array<{
    accountEmail?: string;
    accountPassword?: string;
    licenseKey?: string;
    giftCardCode?: string;
  }> {
    return bulkText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        if (product.type === "ACCOUNT") {
          const [email, ...rest] = line.split(",");
          return { accountEmail: (email ?? "").trim(), accountPassword: rest.join(",").trim() };
        }
        if (product.type === "LICENSE") return { licenseKey: line };
        return { giftCardCode: line };
      });
  }

  async function importBulk(event: FormEvent) {
    event.preventDefault();
    setBulkBusy(true);
    setBulkMsg(null);
    try {
      const res = await api.post<{ created: number }>(
        "/admin/inventory/bulk",
        { planId: bulkPlan, items: parseBulk() },
        token ?? undefined,
      );
      setBulkMsg(`${t.imported}: ${res.created}`);
      setBulkText("");
      setReload((r) => r + 1);
    } catch (err) {
      setBulkMsg(err instanceof ApiError ? err.message : dict.common.somethingWrong);
    } finally {
      setBulkBusy(false);
    }
  }

  const bulkHelp =
    product.type === "ACCOUNT"
      ? t.bulkAccountHelp
      : product.type === "LICENSE"
        ? t.bulkLicenseHelp
        : t.bulkGiftcardHelp;

  return (
    <Container className="space-y-6 py-8">
      <Link href={`/${locale}/admin`} className="text-sm text-muted hover:text-foreground">
        ← {t.back}
      </Link>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{product.name}</h1>
          <p className="text-sm text-muted">
            {product.category.name} · {product.type}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={product.isActive ? "success" : "muted"}>
            {product.isActive ? t.active : t.inactive}
          </Badge>
          <Button size="sm" variant="outline" onClick={toggleActive}>
            {t.toggleActive}
          </Button>
        </div>
      </div>

      <Card>
        <h2 className="mb-3 font-semibold">{t.plans}</h2>
        <div className="space-y-2">
          {product.plans.map((pl) => (
            <div
              key={pl.id}
              className="flex items-center justify-between rounded-lg border border-border p-3 text-sm"
            >
              <span className="font-medium">{pl.label}</span>
              <span className="flex items-center gap-3">
                <span>{formatPrice(pl.price, pl.currency, locale)}</span>
                <Badge tone={pl.availableStock > 0 ? "success" : "muted"}>
                  {pl.availableStock} {t.available}
                </Badge>
              </span>
            </div>
          ))}
        </div>
        <form onSubmit={addPlan} className="mt-4 flex flex-wrap items-end gap-2">
          <Input
            placeholder={t.planLabel}
            value={plLabel}
            onChange={(e) => setPlLabel(e.target.value)}
            required
            className="min-w-40 flex-1"
          />
          <Input
            placeholder={t.price}
            type="number"
            value={plPrice}
            onChange={(e) => setPlPrice(e.target.value)}
            required
            className="w-36"
          />
          <Button type="submit" disabled={plBusy}>
            {plBusy ? t.saving : t.addPlan}
          </Button>
        </form>
        {plErr && <p className="mt-2 text-sm text-danger">{plErr}</p>}
      </Card>

      <Card>
        <h2 className="font-semibold">{t.bulkImport}</h2>
        <p className="mb-3 mt-1 text-xs text-muted">{bulkHelp}</p>
        <form onSubmit={importBulk} className="space-y-2">
          <select
            value={bulkPlan}
            onChange={(e) => setBulkPlan(e.target.value)}
            required
            className={selectClass}
          >
            <option value="" disabled>
              {t.selectPlan}
            </option>
            {product.plans.map((pl) => (
              <option key={pl.id} value={pl.id}>
                {pl.label}
              </option>
            ))}
          </select>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={5}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm outline-none focus:border-primary"
            dir="ltr"
          />
          {bulkMsg && <p className="text-sm text-muted">{bulkMsg}</p>}
          <Button type="submit" disabled={bulkBusy || !bulkPlan}>
            {bulkBusy ? t.saving : t.import}
          </Button>
        </form>
      </Card>
    </Container>
  );
}
