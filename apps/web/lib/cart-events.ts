export const cartChangedEvent = "oosta:cart-changed";

export function notifyCartChanged() {
  window.dispatchEvent(new Event(cartChangedEvent));
}
