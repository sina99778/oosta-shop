"use client";

// Shopping cart, kept in localStorage (per browser, no account needed until
// checkout). Lines are a display snapshot only — the API re-prices every line
// when the order is created, so a stale price here can never be charged.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type CartLine = {
  planId: string;
  productId: string;
  productSlug: string;
  productName: string;
  // Optional for carts saved before it existed; only used to draw the stamp.
  productType?: "ACCOUNT" | "LICENSE" | "GIFTCARD";
  planLabel: string;
  unitPrice: number;
  currency: string;
  imageUrl: string | null;
  quantity: number;
  maxQuantity: number;
};

// Mirrors the API's createOrderSchema limits.
export const MAX_LINE_QUANTITY = 10;
export const MAX_LINES = 20;

type CartContextValue = {
  lines: CartLine[];
  count: number;
  total: number;
  ready: boolean;
  add: (line: Omit<CartLine, "quantity">, quantity: number) => void;
  setQuantity: (planId: string, quantity: number) => void;
  remove: (planId: string) => void;
  clear: () => void;
};

const STORAGE_KEY = "oosta_cart";
const CartContext = createContext<CartContextValue | null>(null);

const clampQuantity = (quantity: number, max: number) =>
  Math.max(1, Math.min(quantity, max, MAX_LINE_QUANTITY));

function readStored(): CartLine[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as CartLine[]).filter((l) => l && l.planId) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setLines(readStored());
      setReady(true);
    });
    // Keep several open tabs in sync.
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setLines(readStored());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((next: (prev: CartLine[]) => CartLine[]) => {
    setLines((prev) => {
      const value = next(prev);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      } catch {
        // storage full/blocked — the cart still works for this page view
      }
      return value;
    });
  }, []);

  const add = useCallback(
    (line: Omit<CartLine, "quantity">, quantity: number) =>
      update((prev) => {
        const existing = prev.find((l) => l.planId === line.planId);
        if (existing) {
          return prev.map((l) =>
            l.planId === line.planId
              ? { ...l, ...line, quantity: clampQuantity(l.quantity + quantity, line.maxQuantity) }
              : l,
          );
        }
        if (prev.length >= MAX_LINES) return prev;
        return [...prev, { ...line, quantity: clampQuantity(quantity, line.maxQuantity) }];
      }),
    [update],
  );

  const setQuantity = useCallback(
    (planId: string, quantity: number) =>
      update((prev) =>
        prev.map((l) =>
          l.planId === planId ? { ...l, quantity: clampQuantity(quantity, l.maxQuantity) } : l,
        ),
      ),
    [update],
  );

  const remove = useCallback(
    (planId: string) => update((prev) => prev.filter((l) => l.planId !== planId)),
    [update],
  );
  const clear = useCallback(() => update(() => []), [update]);

  const value = useMemo(
    () => ({
      lines,
      ready,
      count: lines.reduce((sum, l) => sum + l.quantity, 0),
      total: lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
      add,
      setQuantity,
      remove,
      clear,
    }),
    [lines, ready, add, setQuantity, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
