"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { api, ApiError, assetUrl } from "@/lib/api";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { Category, ProductType } from "@/lib/types";
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
  description: string;
  image: string | null;
  hasImage: boolean;
  type: ProductType;
  isActive: boolean;
  category: { id: string; name: string; slug: string };
  plans: AdminPlan[];
};

const selectClass = "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm";
const productTypes: ProductType[] = ["ACCOUNT", "LICENSE", "GIFTCARD"];

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
  const categories = useApi<{ categories: Category[] }>(
    token ? "/admin/categories" : null,
    token ?? undefined,
  );

  // Editable product details (synced from the loaded product).
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [desc, setDesc] = useState("");
  const [type, setType] = useState<ProductType>("ACCOUNT");
  const [catId, setCatId] = useState("");
  const [active, setActive] = useState(true);
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsMsg, setDetailsMsg] = useState<string | null>(null);

  useEffect(() => {
    if (data?.product) {
      const p = data.product;
      setName(p.name);
      setSlug(p.slug);
      setDesc(p.description);
      setType(p.type);
      setCatId(p.category.id);
      setActive(p.isActive);
    }
  }, [data]);

  // Image upload state
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgMsg, setImgMsg] = useState<string | null>(null);

  // Plans / bulk import state
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
  const imageUrl = product.hasImage
    ? `${assetUrl(`/products/${product.id}/image`)}?v=${reload}`
    : null;

  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    setSavingDetails(true);
    setDetailsMsg(null);
    try {
      await api.patch(
        `/admin/products/${product.id}`,
        { name, slug, description: desc, type, categoryId: catId, isActive: active },
        token ?? undefined,
      );
      setDetailsMsg(t.saved);
      setReload((r) => r + 1);
    } catch (err) {
      setDetailsMsg(err instanceof ApiError ? err.message : dict.common.somethingWrong);
    } finally {
      setSavingDetails(false);
    }
  }

  async function uploadImage() {
    if (!imgFile || !token) return;
    setImgBusy(true);
    setImgMsg(null);
    try {
      const form = new FormData();
      form.append("image", imgFile);
      await api.upload(`/admin/products/${product.id}/image`, form, token);
      setImgFile(null);
      setReload((r) => r + 1);
    } catch (err) {
      setImgMsg(err instanceof ApiError ? err.message : dict.common.somethingWrong);
    } finally {
      setImgBusy(false);
    }
  }

  async function removeImage() {
    if (!token) return;
    setImgBusy(true);
    setImgMsg(null);
    try {
      await api.del(`/admin/products/${product.id}/image`, token);
      setReload((r) => r + 1);
    } catch (err) {
      setImgMsg(err instanceof ApiError ? err.message : dict.common.somethingWrong);
    } finally {
      setImgBusy(false);
    }
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
        <h1 className="text-2xl font-bold">{product.name}</h1>
        <Badge tone={product.isActive ? "success" : "muted"}>
          {product.isActive ? t.active : t.inactive}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Image manager */}
        <Card className="space-y-3">
          <h2 className="font-semibold">{t.productImage}</h2>
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-border bg-surface">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-sm text-muted">{t.noImage}</span>
            )}
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setImgFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:opacity-90"
          />
          <p className="text-xs text-muted">{t.imageHint}</p>
          {imgMsg && <p className="text-sm text-danger">{imgMsg}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={uploadImage} disabled={!imgFile || imgBusy}>
              {imgBusy ? <Spinner /> : product.hasImage ? t.changeImage : t.uploadImage}
            </Button>
            {product.hasImage && (
              <Button size="sm" variant="outline" onClick={removeImage} disabled={imgBusy}>
                {t.removeImage}
              </Button>
            )}
          </div>
        </Card>

        {/* Editable details */}
        <Card className="space-y-3 lg:col-span-2">
          <h2 className="font-semibold">{t.editDetails}</h2>
          <form onSubmit={saveDetails} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-muted">{t.name}</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted">{t.slug}</label>
                <Input value={slug} onChange={(e) => setSlug(e.target.value)} required dir="ltr" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted">{t.description}</label>
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={5}
                required
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-muted">{t.category}</label>
                <select
                  value={catId}
                  onChange={(e) => setCatId(e.target.value)}
                  required
                  className={selectClass}
                >
                  {categories.data?.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted">{t.type}</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as ProductType)}
                  className={selectClass}
                >
                  {productTypes.map((tp) => (
                    <option key={tp} value={tp}>
                      {tp}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="accent-primary"
              />
              {t.active}
            </label>
            {detailsMsg && <p className="text-sm text-muted">{detailsMsg}</p>}
            <Button type="submit" disabled={savingDetails}>
              {savingDetails ? t.saving : t.save}
            </Button>
          </form>
        </Card>
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
