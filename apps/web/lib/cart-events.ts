export const cartChangedEvent = "oosta:cart-changed";

export function notifyCartChanged(scope: "account" | "guest" = "account") {
  window.dispatchEvent(new CustomEvent(cartChangedEvent, { detail: scope }));
}

export function isGuestCartChange(event: Event) {
  return (event as CustomEvent<unknown>).detail === "guest";
}
