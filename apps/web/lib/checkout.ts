// Shared checkout step for the product page ("buy now") and the cart: creates
// the order (the API reserves stock and re-prices every line) and returns where
// to send the buyer next.

import { api } from "./api";
import type { CreateOrderResponse, PaymentMethod } from "./types";

export type CheckoutItem = { planId: string; quantity: number };

export async function placeOrder(
  items: CheckoutItem[],
  method: PaymentMethod,
  locale: string,
  token: string,
): Promise<{ href: string; external: boolean }> {
  const res = await api.post<CreateOrderResponse>("/orders", { items, method, locale }, token);
  if (method === "card_to_card") {
    return { href: `/${locale}/checkout/card/${res.order.id}`, external: false };
  }
  if (!res.payment?.redirectUrl) throw new Error("Missing payment redirect");
  return { href: res.payment.redirectUrl, external: true };
}
