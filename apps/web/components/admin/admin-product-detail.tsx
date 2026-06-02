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
import { SeoAssistant } from "@/components/admin/seo-assistant";
import { PlanRow } from "@/components/admin/plan-row";
import type { Locale } from "@/lib/i18n";
import type { Category, ProductType, SpecRow } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

type AdminPlan = {
  id: string;
  label: string;
  durationDays: number | null;
  price: number;
  salePrice: number | null;
  currency: string;
  isActive: boolean;
  availableStock: number;
};
type AdminProductDetailDto = {
  id: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  description: string;
  metaTitle: string | null;
  metaDescription: string | null;
  specs: SpecRow[];
  isFeatured: boolean;
  image: string | null;
  hasImage: boolean;
  galleryImageIds: string[];
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
  const [shortDesc, setShortDesc] = useState("");
  const [desc, setDesc] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [specs, setSpecs] = useState<SpecRow[]>([]);
  const [featured, setFeatured] = useState(false);
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
      setShortDesc(p.shortDescription ?? "");
      setDesc(p.description);
      setMetaTitle(p.metaTitle ?? "");
      setMetaDescription(p.metaDescription ?? "");
      setSpecs(p.specs.length ? p.specs : []);
      setFeatured(p.isFeatured);
      setType(p.type);
      setCatId(p.category.id);
      setActive(p.isActive);
    }
  }, [data]);

  const [imgFile, setImgFile] = useState<File | null>(null);
  const [galFile, setGalFile] = useState<File | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgMsg, setImgMsg] = useState<string | null>(null);

  const [plLabel, setPlLabel] = useState("");
  const [plPrice, setPlPrice] = useState("");
  const [plSale, setPlSale] = useState("");
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
        {
          name,
          slug,
          shortDescription: shortDesc.trim() || null,
          description: desc,
          metaTitle: metaTitle.trim() || null,
          metaDescription: metaDescription.trim() || null,
          specs: specs.filter((s) => s.label.trim() || s.value.trim()),
          isFeatured: featured,
          type,
          categoryId: catId,
          isActive: active,
        },
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

  async function uploadPrimary() {
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

  async function removePrimary() {
    if (!token) return;
    setImgBusy(true);
    try {
      await api.del(`/admin/products/${product.id}/image`, token);
      setReload((r) => r + 1);
    } catch {
      /* surfaced on reload */
    } finally {
      setImgBusy(false);
    }
  }

  async function addGalleryImage() {
    if (!galFile || !token) return;
    setImgBusy(true);
    setImgMsg(null);
    try {
      const form = new FormData();
      form.append("image", galFile);
      await api.upload(`/admin/products/${product.id}/images`, form, token);
      setGalFile(null);
      setReload((r) => r + 1);
    } catch (err) {
      setImgMsg(err instanceof ApiError ? err.message : dict.common.somethingWrong);
    } finally {
      setImgBusy(false);
    }
  }

  async function removeGalleryImage(imageId: string) {
    if (!token) return;
    try {
      await api.del(`/admin/product-images/${imageId}`, token);
      setReload((r) => r + 1);
    } catch {
      /* surfaced on reload */
    }
  }

  async function addPlan(event: FormEvent) {
    event.preventDefault();
    setPlBusy(true);
    setPlErr(null);
    try {
      const payload: Record<string, unknown> = { label: plLabel, price: Number(plPrice) };
      if (plSale.trim()) payload.salePrice = Number(plSale);
      await api.post(`/admin/products/${product.id}/plans`, payload, token ?? undefined);
      setPlLabel("");
      setPlPrice("");
      setPlSale("");
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
        <div className="flex items-center gap-2">
          {product.isFeatured && <Badge tone="primary">{t.featured}</Badge>}
          <Badge tone={product.isActive ? "success" : "muted"}>
            {product.isActive ? t.active : t.inactive}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Images: primary + gallery */}
        <Card className="space-y-4">
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
          {imgMsg && <p className="text-sm text-danger">{imgMsg}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={uploadPrimary} disabled={!imgFile || imgBusy}>
              {imgBusy ? <Spinner /> : product.hasImage ? t.changeImage : t.uploadImage}
            </Button>
            {product.hasImage && (
              <Button size="sm" variant="outline" onClick={removePrimary} disabled={imgBusy}>
                {t.removeImage}
              </Button>
            )}
          </div>

          <div className="border-t border-border pt-3">
            <p className="mb-2 text-sm font-medium">{t.gallery}</p>
            {product.galleryImageIds.length > 0 && (
              <div className="mb-2 grid grid-cols-3 gap-2">
                {product.galleryImageIds.map((gid) => (
                  <div
                    key={gid}
                    className="group relative aspect-square overflow-hidden rounded-md border border-border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={assetUrl(`/product-images/${gid}`)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    <button
                      onClick={() => removeGalleryImage(gid)}
                      className="absolute end-1 top-1 rounded bg-danger px-1.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setGalFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface file:px-3 file:py-2 file:text-sm hover:file:opacity-90"
            />
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={addGalleryImage}
              disabled={!galFile || imgBusy}
            >
              {t.addImage}
            </Button>
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
              <label className="mb-1 block text-sm text-muted">{t.shortDescription}</label>
              <Input value={shortDesc} onChange={(e) => setShortDesc(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted">{t.description}</label>
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={6}
                required
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <p className="mt-1 text-xs text-muted">{t.markdownHint}</p>
            </div>

            {/* SEO */}
            <div className="rounded-lg border border-border p-3">
              <p className="mb-2 text-sm font-medium">{t.seo}</p>
              <div className="space-y-2">
                <Input
                  placeholder={t.metaTitle}
                  value={metaTitle}
                  onChange={(e) => setMetaTitle(e.target.value)}
                />
                <textarea
                  placeholder={t.metaDescription}
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                />
                <p className="text-xs text-muted">{t.seoHint}</p>
              </div>
            </div>

            {/* Specifications editor */}
            <div>
              <label className="mb-1 block text-sm text-muted">{t.specifications}</label>
              <div className="space-y-2">
                {specs.map((row, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      placeholder={t.specLabel}
                      value={row.label}
                      onChange={(e) =>
                        setSpecs((s) =>
                          s.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)),
                        )
                      }
                      className="w-1/3"
                    />
                    <Input
                      placeholder={t.specValue}
                      value={row.value}
                      onChange={(e) =>
                        setSpecs((s) =>
                          s.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)),
                        )
                      }
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setSpecs((s) => s.filter((_, j) => j !== i))}
                    >
                      ✕
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => setSpecs((s) => [...s, { label: "", value: "" }])}
              >
                + {t.addSpec}
              </Button>
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
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="accent-primary"
                />
                {t.active}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={featured}
                  onChange={(e) => setFeatured(e.target.checked)}
                  className="accent-primary"
                />
                {t.featured}
              </label>
            </div>
            {detailsMsg && <p className="text-sm text-muted">{detailsMsg}</p>}
            <Button type="submit" disabled={savingDetails}>
              {savingDetails ? t.saving : t.save}
            </Button>
          </form>
        </Card>
      </div>

      {/* SEO assistant */}
      <SeoAssistant
        locale={locale}
        dict={dict}
        token={token ?? undefined}
        values={{
          name,
          slug,
          shortDescription: shortDesc,
          description: desc,
          metaTitle,
          metaDescription,
          hasImage: product.hasImage,
          planCount: product.plans.length,
          specCount: specs.filter((s) => s.label.trim() || s.value.trim()).length,
          category: product.category.name,
          type,
        }}
        onApply={(r) => {
          setMetaTitle(r.metaTitle);
          setMetaDescription(r.metaDescription);
          if (r.shortDescription) setShortDesc(r.shortDescription);
        }}
      />

      {/* Plans with sale price */}
      <Card>
        <h2 className="mb-3 font-semibold">{t.plans}</h2>
        <div className="space-y-2">
          {product.plans.map((pl) => (
            <PlanRow
              key={pl.id}
              plan={pl}
              dict={dict}
              token={token ?? undefined}
              onChanged={() => setReload((r) => r + 1)}
            />
          ))}
        </div>
        <form onSubmit={addPlan} className="mt-4 flex flex-wrap items-end gap-2">
          <Input
            placeholder={t.planLabel}
            value={plLabel}
            onChange={(e) => setPlLabel(e.target.value)}
            required
            className="min-w-32 flex-1"
          />
          <Input
            placeholder={t.price}
            type="number"
            value={plPrice}
            onChange={(e) => setPlPrice(e.target.value)}
            required
            className="w-32"
          />
          <Input
            placeholder={t.salePrice}
            type="number"
            value={plSale}
            onChange={(e) => setPlSale(e.target.value)}
            className="w-32"
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
