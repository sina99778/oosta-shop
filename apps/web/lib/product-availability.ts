import type { Locale } from "./i18n";
import type { Availability, PaymentConfig, PlanDetail, ProductSummary } from "./types";

export function availabilityOf(
  item: Pick<ProductSummary, "availability" | "availableStock" | "inStock" | "quoteRequired">,
): Availability {
  if (item.availability) return item.availability;
  // Server-rendered lists can still contain the earlier API shape during rollout.
  if (!item.inStock) return "OUT_OF_STOCK";
  if (item.quoteRequired) return item.availableStock > 0 ? "SUPPLIER_STOCK" : "ON_REQUEST";
  return item.availableStock > 0 ? "LOCAL_STOCK" : "ON_REQUEST";
}

const labels: Record<Availability, Record<Locale, string>> = {
  LOCAL_STOCK: { fa: "موجودی فروشگاه", en: "In store stock" },
  SUPPLIER_STOCK: { fa: "موجود نزد تأمین‌کننده", en: "In supplier stock" },
  ON_REQUEST: { fa: "تأمین با استعلام", en: "Available on request" },
  OUT_OF_STOCK: { fa: "ناموجود", en: "Out of stock" },
};

export const availabilityLabel = (item: Parameters<typeof availabilityOf>[0], locale: Locale) =>
  labels[availabilityOf(item)][locale];

const stockRank: Record<Availability, number> = {
  LOCAL_STOCK: 2,
  SUPPLIER_STOCK: 2,
  ON_REQUEST: 1,
  OUT_OF_STOCK: 0,
};

export function isStockedPlan(plan: PlanDetail) {
  return stockRank[availabilityOf(plan)] === 2;
}

export function plansByAvailability(plans: PlanDetail[]) {
  return [...plans].sort((a, b) => {
    const first = availabilityOf(a);
    const second = availabilityOf(b);
    return (
      stockRank[second] - stockRank[first] ||
      (b.sortOrder ?? 0) - (a.sortOrder ?? 0) ||
      Number(second === "LOCAL_STOCK") - Number(first === "LOCAL_STOCK")
    );
  });
}

export type CheckoutMethods = Pick<PaymentConfig, "online" | "cardToCard">;

export function canBuyPlan(plan: PlanDetail, payment: CheckoutMethods | null | undefined) {
  if (plan.quoteRequired || plan.source === "SUPPLIER" || availabilityOf(plan) !== "LOCAL_STOCK")
    return false;
  return Boolean(payment?.online || payment?.cardToCard);
}
