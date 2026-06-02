"use client";

import Link from "next/link";
import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { api, ApiError } from "@/lib/api";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SeoAssistant } from "@/components/admin/seo-assistant";
import type { Locale } from "@/lib/i18n";
import type { Category, ProductType, SpecRow } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

const selectClass = "h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-sm";
const productTypes: ProductType[] = ["ACCOUNT", "LICENSE", "GIFTCARD"];

type PlanRow = { label: string; price: string; sale: string };

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

export function AdminProductNew({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { token } = useAuth();
  const t = dict.admin;
  const router = useRouter();
  const categories = useApi<{ categories: Category[] }>(
    token ? "/admin/categories" : null,
    token ?? undefined,
  );

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [type, setType] = useState<ProductType>("ACCOUNT");
  const [catId, setCatId] = useState("");
  const [active, setActive] = useState(true);
  const [featured, setFeatured] = useState(false);
  const [shortDesc, setShortDesc] = useState("");
  const [desc, setDesc] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [specs, setSpecs] = useState<SpecRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([{ label: "", price: "", sale: "" }]);
  const [primaryFile, setPrimaryFile] = useState<File | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function onName(v: string) {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  }

  function onGallery(e: ChangeEvent<HTMLInputElement>) {
    setGalleryFiles(e.target.files ? Array.from(e.target.files) : []);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const validPlans = plans.filter((p) => p.label.trim() && Number(p.price) > 0);
    if (validPlans.length === 0) {
      setErr(t.needPlan);
      return;
    }
    if (!token) return;
    setBusy(true);
    setErr(null);
    try {
      const { product } = await api.post<{ product: { id: string } }>(
        "/admin/products",
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
        token,
      );
      const id = product.id;

      for (const p of validPlans) {
        const payload: Record<string, unknown> = { label: p.label, price: Number(p.price) };
        if (p.sale.trim()) payload.salePrice = Number(p.sale);
        await api.post(`/admin/products/${id}/plans`, payload, token);
      }

      if (primaryFile) {
        const form = new FormData();
        form.append("image", primaryFile);
        await api.upload(`/admin/products/${id}/image`, form, token);
      }
      for (const file of galleryFiles) {
        const form = new FormData();
        form.append("image", file);
        await api.upload(`/admin/products/${id}/images`, form, token);
      }

      router.push(`/${locale}/admin/products/${id}`);
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : dict.common.somethingWrong);
      setBusy(false);
    }
  }

  return (
    <Container className="max-w-3xl space-y-6 py-8">
      <Link href={`/${locale}/admin`} className="text-sm text-muted hover:text-foreground">
        ← {t.back}
      </Link>
      <h1 className="text-2xl font-bold">{t.newProduct}</h1>

      <form onSubmit={submit} className="space-y-6">
        <SectionCard title={t.basicInfo}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-muted">{t.name}</label>
              <Input value={name} onChange={(e) => onName(e.target.value)} required />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted">{t.slug}</label>
              <div className="flex gap-2">
                <Input
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value);
                    setSlugTouched(true);
                  }}
                  required
                  dir="ltr"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setSlug(slugify(name))}
                >
                  {t.slugFromName}
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted">{t.slugHint}</p>
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted">{t.category}</label>
              <select
                value={catId}
                onChange={(e) => setCatId(e.target.value)}
                required
                className={selectClass}
              >
                <option value="" disabled>
                  {t.category}
                </option>
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
        </SectionCard>

        <SectionCard title={t.descriptions}>
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
              className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
            <p className="mt-1 text-xs text-muted">{t.markdownHint}</p>
          </div>
        </SectionCard>

        <SectionCard title={t.plansPricing}>
          <div className="space-y-2">
            {plans.map((p, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder={t.planLabel}
                  value={p.label}
                  onChange={(e) =>
                    setPlans((arr) =>
                      arr.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)),
                    )
                  }
                  className="min-w-32 flex-1"
                />
                <Input
                  type="number"
                  placeholder={t.price}
                  value={p.price}
                  onChange={(e) =>
                    setPlans((arr) =>
                      arr.map((r, j) => (j === i ? { ...r, price: e.target.value } : r)),
                    )
                  }
                  className="w-28"
                />
                <Input
                  type="number"
                  placeholder={`${t.salePrice} (${t.optional})`}
                  value={p.sale}
                  onChange={(e) =>
                    setPlans((arr) =>
                      arr.map((r, j) => (j === i ? { ...r, sale: e.target.value } : r)),
                    )
                  }
                  className="w-36"
                />
                {plans.length > 1 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setPlans((arr) => arr.filter((_, j) => j !== i))}
                  >
                    ✕
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setPlans((arr) => [...arr, { label: "", price: "", sale: "" }])}
          >
            + {t.addPlan}
          </Button>
        </SectionCard>

        <SectionCard title={t.specifications}>
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
            onClick={() => setSpecs((s) => [...s, { label: "", value: "" }])}
          >
            + {t.addSpec}
          </Button>
        </SectionCard>

        <SectionCard title={t.media}>
          <div>
            <label className="mb-1 block text-sm text-muted">{t.primaryImage}</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPrimaryFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:opacity-90"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted">{t.galleryImages}</label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={onGallery}
              className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface file:px-3 file:py-2 file:text-sm hover:file:opacity-90"
            />
            {galleryFiles.length > 0 && (
              <p className="mt-1 text-xs text-muted">{galleryFiles.length} ✓</p>
            )}
          </div>
          <p className="text-xs text-muted">{t.imageHint}</p>
        </SectionCard>

        <SectionCard title={t.seo}>
          <p className="text-xs text-muted">{t.seoHint}</p>
          <div>
            <label className="mb-1 block text-sm text-muted">{t.metaTitle}</label>
            <Input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted">{t.metaDescription}</label>
            <textarea
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </SectionCard>

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
            hasImage: primaryFile != null,
            planCount: plans.filter((p) => p.label.trim() && Number(p.price) > 0).length,
            specCount: specs.filter((s) => s.label.trim() || s.value.trim()).length,
            category: categories.data?.categories.find((c) => c.id === catId)?.name ?? "",
            type,
          }}
          onApply={(r) => {
            setMetaTitle(r.metaTitle);
            setMetaDescription(r.metaDescription);
            if (r.shortDescription) setShortDesc(r.shortDescription);
          }}
        />

        {err && <p className="text-sm text-danger">{err}</p>}
        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? (
              <>
                <Spinner /> {t.saving}
              </>
            ) : (
              t.createProductCta
            )}
          </Button>
        </div>
      </form>
    </Container>
  );
}
