"use client";

// Header bell: in-site notifications (delivered orders, ticket replies, items
// back in stock). Opening the panel marks everything read. The panel is
// portalled to <body> — the header's backdrop-blur would clip a fixed child.

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Locale } from "@/lib/i18n";

type Item = {
  id: string;
  kind: "ORDER_DELIVERED" | "TICKET_REPLY" | "BACK_IN_STOCK";
  data: Record<string, string>;
  read: boolean;
  createdAt: string;
};

export type BellLabels = {
  notifications: string;
  notificationsEmpty: string;
  notificationsUnread: string;
  notifDelivered: string;
  notifTicket: string;
  notifStock: string;
};

const POLL_MS = 60_000;

// Puts `value` into a "{key}" template, isolated so a Latin name can't flip the
// direction of the sentence around it.
function fill(template: string, key: string, value: string): ReactNode {
  const [before, after = ""] = template.split(`{${key}}`);
  return (
    <>
      {before}
      <bdi>{value}</bdi>
      {after}
    </>
  );
}
const PANEL_W = 340;

export function NotificationBell({
  locale,
  token,
  labels,
}: {
  locale: Locale;
  token: string;
  labels: BellLabels;
}) {
  const pathname = usePathname();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CSSProperties>({});

  const load = useCallback(() => {
    api
      .get<{ unread: number; items: Item[] }>("/notifications", token)
      .then((d) => {
        setItems(d.items);
        setUnread(d.unread);
      })
      .catch(() => {});
  }, [token]);

  // Refresh on navigation, and every minute while the tab is visible.
  useEffect(() => {
    load();
  }, [load, pathname]);
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Close on navigation, Escape and outside clicks.
  useEffect(() => {
    queueMicrotask(() => setOpen(false));
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = button.current!.getBoundingClientRect();
    const width = Math.min(PANEL_W, window.innerWidth - 32);
    const left = Math.min(Math.max(16, rect.right - width), window.innerWidth - width - 16);
    setPos({ top: rect.bottom + 8, left, width });
    setOpen(true);
    if (unread > 0) {
      setUnread(0);
      void api.post("/notifications/read-all", undefined, token).catch(() => {});
    }
  }

  const base = `/${locale}`;
  function describe(item: Item): { text: ReactNode; href: string } {
    const d = item.data;
    switch (item.kind) {
      case "ORDER_DELIVERED":
        return {
          text: fill(labels.notifDelivered, "id", (d.orderId ?? "").slice(-8).toUpperCase()),
          href: `${base}/dashboard/orders/${d.orderId}`,
        };
      case "TICKET_REPLY":
        return {
          text: fill(labels.notifTicket, "subject", d.subject ?? ""),
          href: `${base}/support/${d.ticketId}`,
        };
      default:
        return {
          text: fill(labels.notifStock, "name", d.name ?? ""),
          href: `${base}/products/${d.slug}`,
        };
    }
  }

  const num = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US");
  const label =
    unread > 0
      ? `${labels.notifications} (${labels.notificationsUnread.replace("{n}", num.format(unread))})`
      : labels.notifications;

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-expanded={open}
        aria-controls="notifications-panel"
        className="relative inline-flex size-10 items-center justify-center rounded-[10px] border border-border text-foreground transition-colors hover:border-primary hover:text-primary"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" />
          <path d="M10 20.5a2 2 0 0 0 4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -end-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] leading-5 font-bold text-primary-foreground">
            {unread > 9 ? "9+" : num.format(unread)}
          </span>
        )}
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            id="notifications-panel"
            role="dialog"
            dir={locale === "fa" ? "rtl" : "ltr"}
            aria-label={labels.notifications}
            style={pos}
            className="fixed z-50 overflow-hidden rounded-[14px] border border-border bg-card text-foreground shadow-card animate-fade-in"
          >
            <div aria-hidden className="airmail h-1.5" />
            <p className="border-b border-border px-4 py-3 text-sm font-extrabold">
              {labels.notifications}
            </p>
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">
                {labels.notificationsEmpty}
              </p>
            ) : (
              <ul className="max-h-[60vh] divide-y divide-dashed divide-border overflow-y-auto">
                {items.map((item) => {
                  const { text, href } = describe(item);
                  return (
                    <li key={item.id}>
                      <Link
                        href={href}
                        className={cn(
                          "flex gap-3 px-4 py-3 text-sm transition-colors hover:bg-surface",
                          !item.read && "bg-primary/5",
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "mt-1.5 size-2 shrink-0 rotate-45",
                            item.read ? "bg-border" : "bg-primary",
                          )}
                        />
                        <span className="min-w-0">
                          <span className="block leading-6">{text}</span>
                          <span className="mt-0.5 block text-xs text-muted">
                            {formatDate(item.createdAt, locale)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
