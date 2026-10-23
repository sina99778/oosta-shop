// Badge tone for an order's paymentStatus — one mapping for the buyer and admin UIs.
export function orderStatusTone(status: string): "success" | "muted" | "danger" | "primary" {
  if (status === "PAID") return "success";
  // Money captured, delivery owed: needs attention, but it is not a failure.
  if (status === "PAID_UNFULFILLED") return "primary";
  if (status === "PENDING" || status === "PENDING_REVIEW") return "muted";
  return "danger";
}
