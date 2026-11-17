"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { api, ApiError } from "@/lib/api";
import { QueryError } from "@/components/query-error";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { assetUrl } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import styles from "./admin.module.css";

type AdminProduct = {
  id: string;
  name: string;
  slug: string;
  type: string;
  isActive: boolean;
  hasImage?: boolean;
  image?: string | null;
  planCount: number;
  inventory: { available: number; reserved: number; sold: number; paused: number };
  sources: { internal: number; supplier: number };
  category: { name: string };
};

export function AdminProducts({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { token } = useAuth();
  const t = dict.admin;
  const fa = locale === "fa";
  const number = new Intl.NumberFormat(locale);
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [reload, setReload] = useState(0);
  const bust = `?_r=${reload}`;
  const products = useApi<{ products: AdminProduct[] }>(
    token ? `/admin/products${bust}` : null,
    token ?? undefined,
  );

  const [showCat, setShowCat] = useState(false);
  const [cName, setCName] = useState("");
  const [cSlug, setCSlug] = useState("");
  const [cErr, setCErr] = useState<string | null>(null);
  const [cBusy, setCBusy] = useState(false);
  const normalize = (text: string) =>
    text
      .normalize("NFKC")
      .replace(/[يى]/g, "ی")
      .replace(/ك/g, "ک")
      .toLocaleLowerCase(locale)
      .trim();
  const term = normalize(search);
  const low = (product: AdminProduct) =>
    product.isActive && product.sources.internal > 0 && product.inventory.available <= 5;
  const all = products.data?.products;
  const matching = all?.filter(
    (product) =>
      normalize(`${product.name} ${product.slug} ${product.category.name}`).includes(term) &&
      (stockFilter === "all" ||
        (stockFilter === "low" && low(product)) ||
        (stockFilter === "supplier" && product.isActive && product.sources.supplier > 0) ||
        (stockFilter === "inactive" && !product.isActive)),
  );

  async function createCategory(event: FormEvent) {
    event.preventDefault();
    setCBusy(true);
    setCErr(null);
    try {
      await api.post("/admin/categories", { name: cName, slug: cSlug }, token ?? undefined);
      setCName("");
      setCSlug("");
      setShowCat(false);
      setReload((r) => r + 1);
    } catch (err) {
      setCErr(err instanceof ApiError ? err.message : dict.common.somethingWrong);
    } finally {
      setCBusy(false);
    }
  }

  return (
    <div className={styles.dashboard}>
      <header className={styles.dashboardHeader}>
        <h1>{t.products}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={styles.quietButton}
            aria-expanded={showCat}
            aria-controls="new-category-form"
            onClick={() => setShowCat((s) => !s)}
          >
            {t.newCategory}
          </button>
          <Link href={`/${locale}/admin/products/new`} className={styles.primaryLink}>
            <span aria-hidden="true">+</span>
            {t.newProduct}
          </Link>
        </div>
      </header>

      {all && (
        <dl className={styles.metrics}>
          {[
            [
              fa ? "محصول فعال" : "Active products",
              all.filter((product) => product.isActive).length,
            ],
            [
              fa ? "موجودی آزاد در پلن فعال" : "Available on active plans",
              all.reduce(
                (total, product) => total + (product.isActive ? product.inventory.available : 0),
                0,
              ),
            ],
            [
              fa ? "رزروشده در انبار داخلی" : "Reserved internal units",
              all.reduce((total, product) => total + product.inventory.reserved, 0),
            ],
            [
              fa ? "محصول با موجودی داخلی کم" : "Products low on internal stock",
              all.filter(low).length,
            ],
          ].map(([label, value]) => (
            <div className={styles.metric} key={label}>
              <dt>{label}</dt>
              <dd>{number.format(Number(value))}</dd>
            </div>
          ))}
        </dl>
      )}

      {showCat && (
        <section className={styles.panel} id="new-category-form">
          <h3 className="mb-3 font-semibold">{t.newCategory}</h3>
          <form onSubmit={createCategory} className="flex flex-wrap items-end gap-2">
            <label className={`${styles.filterField} min-w-40 flex-1`}>
              <span>{t.name}</span>
              <Input value={cName} onChange={(e) => setCName(e.target.value)} required />
            </label>
            <label className={`${styles.filterField} min-w-40 flex-1`}>
              <span>{t.slug}</span>
              <Input value={cSlug} onChange={(e) => setCSlug(e.target.value)} required dir="ltr" />
            </label>
            <Button type="submit" disabled={cBusy}>
              {cBusy ? t.saving : t.create}
            </Button>
          </form>
          {cErr && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {cErr}
            </p>
          )}
        </section>
      )}

      <section className={styles.panel}>
        <div className={styles.toolbar}>
          <label className={`${styles.filterField} w-full sm:max-w-sm`}>
            <span>{fa ? "جست‌وجوی محصول" : "Find a product"}</span>
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={fa ? "نام محصول، شناسه یا دسته‌بندی" : "Name, slug or category"}
            />
          </label>
          <label className={styles.filterField}>
            <span>{fa ? "فیلتر موجودی" : "Inventory filter"}</span>
            <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}>
              <option value="all">{dict.common.all}</option>
              <option value="low">
                {fa ? "موجودی داخلی کم یا صفر" : "Low or empty internal stock"}
              </option>
              <option value="supplier">
                {fa ? "دارای پلن تأمین‌کننده" : "Has a supplier plan"}
              </option>
              <option value="inactive">{t.inactive}</option>
            </select>
          </label>
          {matching && (
            <p aria-live="polite" className={styles.resultCount}>
              {number.format(matching.length)} {dict.products.results}
            </p>
          )}
        </div>
        {products.loading ? (
          <div role="status" className={styles.empty}>
            <Spinner className="size-5" />
            <span className="sr-only">{dict.common.loading}</span>
          </div>
        ) : products.error ? (
          <QueryError message={dict.common.somethingWrong} onRetry={products.refetch} />
        ) : !matching?.length ? (
          <p className={styles.empty}>
            {term || stockFilter !== "all" ? dict.products.empty : dict.home.noProducts}
          </p>
        ) : (
          <ul className={styles.orderList}>
            {matching.map((p) => (
              <li key={p.id} className={styles.productRow}>
                <div className={styles.productIdentity}>
                  <div className="size-12 shrink-0 overflow-hidden rounded-lg border border-border bg-surface">
                    {p.hasImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`${assetUrl(`/products/${p.id}/image`)}?v=${reload}`}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-sm font-bold text-muted/50">
                        {p.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 [overflow-wrap:anywhere]">
                    <p className="font-semibold" dir="auto">
                      {p.name}
                    </p>
                    <p className="text-xs text-muted" dir="auto">
                      {p.category.name}
                    </p>
                  </div>
                </div>
                <div className={styles.productCounts}>
                  <span>
                    {number.format(p.inventory.available)}{" "}
                    {fa ? "آزاد داخلی" : "available internally"} ·{" "}
                    {number.format(p.inventory.reserved)} {fa ? "رزرو" : "reserved"}
                  </span>
                  <span>
                    {number.format(p.inventory.sold)} {fa ? "فروخته‌شده" : "sold"}
                    {p.inventory.paused > 0 && (
                      <>
                        {" "}
                        · {number.format(p.inventory.paused)}{" "}
                        {fa ? "در پلن غیرفعال" : "on inactive plans"}
                      </>
                    )}
                  </span>
                  {p.sources.supplier > 0 && (
                    <span className="text-primary">
                      {number.format(p.sources.supplier)}{" "}
                      {fa ? "پلن تأمین‌کننده" : "supplier plans"}
                    </span>
                  )}
                </div>
                <Badge tone={p.isActive ? "primary" : "muted"}>
                  {p.isActive ? t.active : t.inactive}
                </Badge>
                <Link
                  href={`/${locale}/admin/products/${p.id}`}
                  className={styles.inlineLink}
                  aria-label={`${t.manage} ${p.name}`}
                >
                  {t.manage} <span aria-hidden="true">↗</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
