export type CartReviewRecovery = "refresh" | "cart_or_products" | "orders" | "retry" | null;

export function isInvoiceExpired(expiresAt: string, now = Date.now()): boolean {
  const parsed = Date.parse(expiresAt);
  return !Number.isFinite(parsed) || parsed <= now;
}

export function cartReviewRecovery(
  errorCode: string | null,
  hasInvoice: boolean,
): CartReviewRecovery {
  switch (errorCode) {
    case "CART_CHANGED":
    case "SUPPLIER_QUOTE_EXPIRED":
    case "INVOICE_EXPIRED":
      return "refresh";
    case "OUT_OF_STOCK":
    case "NOT_FOUND":
      return "cart_or_products";
    case "BLU_STOCK_ORDER_OPEN":
    case "WELCOME_GIFT_PENDING":
      return "orders";
    default:
      return hasInvoice ? null : "retry";
  }
}
