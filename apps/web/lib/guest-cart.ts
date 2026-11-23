import { useMemo, useSyncExternalStore } from "react";
import { ApiError } from "./api";
import { cartChangedEvent, notifyCartChanged } from "./cart-events";

export const guestCartKey = "oosta:guest-cart";
export const guestCartLifetime = 24 * 60 * 60 * 1000;
const limit = 10;
const planIdPattern = /^[a-zA-Z0-9_-]{1,100}$/;
type Entry = { planId: string; addedAt: number };
export type GuestCartTransfer = {
  status: "done" | "full" | "error";
  unavailable: number;
};

export function readGuestCart(): Entry[] {
  try {
    const raw = window.localStorage.getItem(guestCartKey);
    if (!raw || raw.length > 4096) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    const valid = new Map<string, Entry>();
    for (const entry of parsed) {
      if (
        typeof entry?.planId !== "string" ||
        !planIdPattern.test(entry.planId) ||
        !Number.isSafeInteger(entry.addedAt) ||
        entry.addedAt > now ||
        entry.addedAt + guestCartLifetime <= now ||
        valid.has(entry.planId)
      )
        continue;
      valid.set(entry.planId, { planId: entry.planId, addedAt: entry.addedAt });
      if (valid.size === limit) break;
    }
    return [...valid.values()];
  } catch {
    return [];
  }
}

function write(entries: Entry[]) {
  window.localStorage.setItem(guestCartKey, JSON.stringify(entries));
  notifyCartChanged("guest");
}

export function addGuestCartItem(planId: string) {
  if (!planIdPattern.test(planId)) throw new Error("Invalid cart item");
  const entries = readGuestCart();
  if (entries.some((entry) => entry.planId === planId)) return "duplicate";
  if (entries.length === limit) return "full";
  write([...entries, { planId, addedAt: Date.now() }]);
  return "added";
}

export function removeGuestCartItem(planId: string, addedAt?: number) {
  const entries = readGuestCart();
  const remaining = entries.filter(
    (entry) => entry.planId !== planId || (addedAt !== undefined && entry.addedAt !== addedAt),
  );
  if (remaining.length !== entries.length) write(remaining);
}

function subscribe(onChange: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const update = () => {
    clearTimeout(timer);
    const expiry = Math.min(...readGuestCart().map(({ addedAt }) => addedAt + guestCartLifetime));
    if (Number.isFinite(expiry)) timer = setTimeout(update, Math.max(0, expiry - Date.now()));
    onChange();
  };
  const storage = (event: StorageEvent) => {
    if (event.key === null || event.key === guestCartKey) update();
  };
  window.addEventListener("storage", storage);
  window.addEventListener(cartChangedEvent, update);
  update();
  return () => {
    clearTimeout(timer);
    window.removeEventListener("storage", storage);
    window.removeEventListener(cartChangedEvent, update);
  };
}

const getSnapshot = () => JSON.stringify(readGuestCart());
const getServerSnapshot = () => "[]";

export function useGuestCart() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => JSON.parse(snapshot) as Entry[], [snapshot]);
}

export async function transferGuestCart(
  send: (planId: string) => Promise<unknown>,
  isCurrent: () => boolean,
): Promise<GuestCartTransfer> {
  let unavailable = 0;
  let retryNeeded = false;
  for (const entry of readGuestCart()) {
    if (!isCurrent()) break;
    if (
      !readGuestCart().some(
        ({ planId, addedAt }) => planId === entry.planId && addedAt === entry.addedAt,
      )
    )
      continue;
    let gone = false;
    try {
      await send(entry.planId);
    } catch (error) {
      if (!(error instanceof ApiError)) return { status: "error", unavailable };
      if (error.code === "CART_FULL") return { status: "full", unavailable };
      if (["NO_CURRENT_OFFER", "PRICING_UNAVAILABLE", "CART_CHANGED"].includes(error.code ?? "")) {
        retryNeeded = true;
        continue;
      }
      if (
        !["OUT_OF_STOCK", "NOT_FOUND", "ORDER_IN_PROGRESS", "CART_DUPLICATE"].includes(
          error.code ?? "",
        )
      )
        return { status: "error", unavailable };
      gone = error.code === "OUT_OF_STOCK" || error.code === "NOT_FOUND";
    }
    if (!isCurrent()) break;
    try {
      removeGuestCartItem(entry.planId, entry.addedAt);
    } catch {
      return { status: "error", unavailable };
    }
    if (gone) unavailable++;
  }
  return { status: retryNeeded ? "error" : "done", unavailable };
}
