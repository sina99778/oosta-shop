"use client";

import Link from "next/link";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import styles from "./admin.module.css";

type Job = {
  id: string;
  orderId: string;
  product: string;
  plan: string;
  supplier: string;
  state: string;
  amount: string;
  maximumCost: string;
  remaining: string;
  usesLiveWallet?: boolean;
  currency: string;
  wallet?: { amount: string; currency: string } | null;
};

export function ManualSupplierJobs({
  locale,
  orderId,
  onUpdated,
}: {
  locale: Locale;
  orderId?: string;
  onUpdated?: () => void;
}) {
  const { token } = useAuth();
  const path =
    "/admin/suppliers/manual" + (orderId ? "?orderId=" + encodeURIComponent(orderId) : "");
  const { data, refetch } = useApi<{ jobs: Job[] }>(token ? path : null, token ?? undefined);
  const fa = locale === "fa";
  const active =
    data?.jobs.filter((job) => !["DELIVERED", "REJECTED", "REFUNDED"].includes(job.state)).length ??
    0;
  if (!data?.jobs.length) return null;
  return (
    <section id={orderId ? undefined : "supplier-orders"} className={styles.panel}>
      <h2>
        {fa ? "سفارش‌های تأمین‌کننده" : "Supplier orders"} ({active})
      </h2>
      {data.jobs.map((job) =>
        orderId ? (
          <SupplierJob
            key={job.id}
            job={job}
            locale={locale}
            token={token ?? undefined}
            onUpdated={() => {
              refetch();
              onUpdated?.();
            }}
          />
        ) : (
          <p key={job.id} className="my-2">
            <Link href={`/${locale}/admin/orders/${job.orderId}`} className={styles.storeLink}>
              {job.product} · {job.plan} · {job.state}
            </Link>
          </p>
        ),
      )}
    </section>
  );
}

function SupplierJob({
  job,
  locale,
  token,
  onUpdated,
}: {
  job: Job;
  locale: Locale;
  token?: string;
  onUpdated: () => void;
}) {
  const fa = locale === "fa";
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [cost, setCost] = useState<string>();
  const [amount, setAmount] = useState("");
  const [requestId, setRequestId] = useState<string>();
  const [tracking, setTracking] = useState("");
  const [confirmBuy, setConfirmBuy] = useState(false);
  async function act(action: string, body: unknown) {
    setBusy(true);
    setMessage("");
    try {
      await api.post("/admin/suppliers/manual/" + job.id + "/" + action, body, token);
      setCost(undefined);
      if (action === "funding") {
        setAmount("");
        setRequestId(undefined);
      }
      onUpdated();
    } catch (error) {
      if (error instanceof ApiError && error.code === "SUPPLIER_COST_INCREASED") {
        const next = (error.details as { cost?: string } | undefined)?.cost;
        if (typeof next === "string") setCost(next);
      }
      if (error instanceof ApiError && error.code === "SUPPLIER_WALLET_UNAVAILABLE") {
        const info = error.details as
          | { shortfall?: string; currency?: string; source?: string }
          | undefined;
        if (info?.shortfall) {
          setMessage(
            (info.source === "wallet"
              ? fa
                ? "کسری موجودی ربات: "
                : "Provider wallet shortfall: "
              : fa
                ? "کسری بودجهٔ مجاز: "
                : "Authorized budget shortfall: ") +
              info.shortfall +
              " " +
              info.currency,
          );
          return;
        }
      }
      setMessage(
        error instanceof Error ? error.message : fa ? "عملیات انجام نشد." : "Action failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4 space-y-3">
      <p>
        {job.product} · {job.plan} · <bdi>{job.supplier}</bdi> · {job.state}
      </p>
      <p>
        {fa ? "مبلغ سفارش" : "Order amount"} {formatPrice(Number(job.amount), "IRR", locale)} ·{" "}
        {fa ? "تأمین" : "Cost"}{" "}
        <bdi>
          {job.maximumCost} {job.currency}
        </bdi>
        {!job.usesLiveWallet && (
          <>
            {" "}
            · {fa ? "بودجهٔ باقی‌مانده" : "Remaining budget"}{" "}
            <bdi>
              {job.remaining} {job.currency}
            </bdi>
          </>
        )}
        {job.wallet && (
          <>
            {" "}
            · {fa ? "موجودی ربات" : "Provider wallet"}{" "}
            <bdi>
              {job.wallet.amount} {job.wallet.currency}
            </bdi>
          </>
        )}
      </p>
      {job.state === "AWAITING_FUNDS" && (
        <>
          {!job.usesLiveWallet && (
            <div className="flex flex-wrap items-end gap-2">
              <label>
                {fa ? "مبلغ شارژ انجام‌شده" : "Top-up already made"}{" "}
                <input
                  className="block rounded-lg border border-border bg-card p-2"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  disabled={busy}
                />
              </label>
              <Button
                disabled={busy || !amount}
                onClick={() => {
                  const key = requestId ?? crypto.randomUUID();
                  setRequestId(key);
                  void act("funding", { amount, requestId: key });
                }}
              >
                {fa ? "ثبت شارژ" : "Record top-up"}
              </Button>
            </div>
          )}
          {confirmBuy || cost ? (
            <Button
              disabled={busy}
              onClick={() => void act("dispatch", cost ? { acceptedCost: cost } : {})}
            >
              {cost
                ? fa
                  ? `تأیید هزینهٔ ${cost} و خرید`
                  : `Accept ${cost} and purchase`
                : fa
                  ? "تأیید خرید از ربات و تحویل"
                  : "Confirm purchase and delivery"}
            </Button>
          ) : (
            <Button disabled={busy} onClick={() => setConfirmBuy(true)}>
              {fa ? "خرید و تحویل" : "Purchase and deliver"}
            </Button>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <label>
              {fa ? "شمارهٔ پیگیری بازپرداخت انجام‌شده" : "Completed refund reference"}{" "}
              <input
                className="block rounded-lg border border-border bg-card p-2"
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                disabled={busy}
              />
            </label>
            <Button
              variant="outline"
              disabled={busy || tracking.trim().length < 4}
              onClick={() => void act("refund", { tracking })}
            >
              {fa ? "ثبت بازپرداخت" : "Record refund"}
            </Button>
          </div>
        </>
      )}
      {["SENDING", "PENDING", "UNCERTAIN"].includes(job.state) && (
        <Button variant="outline" disabled={busy} onClick={() => void act("reconcile", {})}>
          {fa ? "پیگیری تأمین" : "Check supplier status"}
        </Button>
      )}
      {message && <p role="alert">{message}</p>}
    </div>
  );
}
