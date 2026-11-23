"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { formatPrice } from "@/lib/format";
import { planDisplayLabel, planTrustSummary } from "@/lib/product-variant";
import type { Locale } from "@/lib/i18n";
import type { PlanDetail } from "@/lib/types";
import styles from "./home.module.css";

export type CompareProduct = { name: string; slug: string; plans: PlanDetail[] };

function priceLabel(plan: PlanDetail, locale: Locale): string {
  if (plan.quoteRequired || plan.effectivePrice <= 0) {
    return plan.indicativePrice
      ? `${locale === "fa" ? "حدود" : "About"} ${formatPrice(plan.indicativePrice.amount, plan.indicativePrice.currency, locale)}`
      : locale === "fa"
        ? "قیمت با استعلام"
        : "Price on request";
  }
  return formatPrice(plan.effectivePrice, plan.currency, locale);
}

// Recommend the first in-stock plan in the admin's order; it is highlighted, never preselected.
function recommendedId(plans: PlanDetail[]): string | undefined {
  return (
    plans.find(
      (plan) => plan.availability === "LOCAL_STOCK" || plan.availability === "SUPPLIER_STOCK",
    ) ?? plans[0]
  )?.id;
}

export function HomeCompare({ locale, products }: { locale: Locale; products: CompareProduct[] }) {
  const fa = locale === "fa";
  const [active, setActive] = useState(0);
  const tabsId = useId();
  const product = products[Math.min(active, products.length - 1)];
  const recommended = recommendedId(product.plans);
  const rows = product.plans.map((plan) => ({
    plan,
    title: planDisplayLabel(plan.label, fa),
    summary: planTrustSummary(plan, locale),
    price: priceLabel(plan, locale),
    href: `/${locale}/products/${encodeURIComponent(product.slug)}?plan=${encodeURIComponent(plan.id)}`,
  }));
  const choose = fa ? "انتخاب این پلن" : "Choose this plan";
  const recommendedLabel = fa ? "پیشنهاد اوستا" : "Oosta pick";
  const features: [string, (row: (typeof rows)[number]) => string][] = [
    [fa ? "دسترسی و مدت" : "Access & duration", (row) => row.summary.access],
    [fa ? "ضمانت" : "Warranty", (row) => row.summary.warranty],
    [fa ? "شیوهٔ تحویل" : "Delivery", (row) => row.summary.delivery],
  ];

  return (
    <section className={styles.compare} aria-labelledby="compare-title">
      <div className={styles.wrap}>
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.eyebrow}>
              {fa ? "پیش از خرید، مقایسه کن" : "Compare before you buy"}
            </span>
            <h2 id="compare-title">{fa ? "پلن‌ها را کنار هم ببین" : "Plans side by side"}</h2>
          </div>
          {products.length > 1 && (
            <div className={styles.tabs} role="tablist" aria-label={fa ? "محصول" : "Product"}>
              {products.map((item, index) => (
                <button
                  key={item.slug}
                  type="button"
                  role="tab"
                  id={`${tabsId}-tab-${index}`}
                  aria-selected={index === active}
                  aria-controls={`${tabsId}-panel`}
                  tabIndex={index === active ? 0 : -1}
                  onClick={() => setActive(index)}
                  onKeyDown={(event) => {
                    const step =
                      event.key === "ArrowLeft" ? 1 : event.key === "ArrowRight" ? -1 : 0;
                    if (!step) return;
                    const direction = fa ? step : -step;
                    const next = (index + direction + products.length) % products.length;
                    setActive(next);
                    document.getElementById(`${tabsId}-tab-${next}`)?.focus();
                  }}
                >
                  <bdi>{item.name}</bdi>
                </button>
              ))}
            </div>
          )}
        </div>
        <div
          id={`${tabsId}-panel`}
          role="tabpanel"
          aria-labelledby={products.length > 1 ? `${tabsId}-tab-${active}` : undefined}
        >
          <table className={styles.table}>
            <caption className="sr-only">
              {fa ? `مقایسهٔ پلن‌های ${product.name}` : `${product.name} plan comparison`}
            </caption>
            <thead>
              <tr>
                <th scope="col">{fa ? "ویژگی" : "Feature"}</th>
                {rows.map((row) => (
                  <th scope="col" key={row.plan.id}>
                    <span className={styles.planHead}>
                      <bdi>{row.title}</bdi>
                      {row.plan.id === recommended && (
                        <span className={styles.recommended}>{recommendedLabel}</span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {features.map(([label, value]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  {rows.map((row) => (
                    <td key={row.plan.id} data-recommended={row.plan.id === recommended}>
                      {value(row)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <th scope="row">{fa ? "قیمت" : "Price"}</th>
                {rows.map((row) => (
                  <td key={row.plan.id} className={styles.price}>
                    <bdi>{row.price}</bdi>
                  </td>
                ))}
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">
                  <span className="sr-only">{choose}</span>
                </th>
                {rows.map((row) => (
                  <td key={row.plan.id}>
                    <Link
                      prefetch={false}
                      href={row.href}
                      className="oosta-button inline-flex h-9 items-center px-3.5 text-sm"
                      data-button-variant={row.plan.id === recommended ? "primary" : "outline"}
                    >
                      {choose}
                    </Link>
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
          <ul className={styles.planCards}>
            {rows.map((row) => (
              <li
                key={row.plan.id}
                className={styles.planCard}
                data-recommended={row.plan.id === recommended}
              >
                <span className={styles.planHead}>
                  <strong>
                    <bdi>{row.title}</bdi>
                  </strong>
                  {row.plan.id === recommended && (
                    <span className={styles.recommended}>{recommendedLabel}</span>
                  )}
                </span>
                <dl>
                  {features.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value(row)}</dd>
                    </div>
                  ))}
                </dl>
                <div className={styles.planFoot}>
                  <span className={styles.price}>
                    <bdi>{row.price}</bdi>
                  </span>
                  <Link
                    prefetch={false}
                    href={row.href}
                    className="oosta-button inline-flex h-9 items-center px-3.5 text-sm"
                    data-button-variant={row.plan.id === recommended ? "primary" : "outline"}
                  >
                    {choose}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          <p className={styles.compareNote}>
            {fa
              ? "قیمت نهایی، موجودی و شرایط هر پلن پیش از پرداخت در فاکتور دوباره بررسی می‌شود."
              : "Final price, stock and terms are checked again on the invoice before payment."}
          </p>
        </div>
      </div>
    </section>
  );
}
