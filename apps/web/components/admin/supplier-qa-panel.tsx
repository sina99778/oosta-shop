"use client";
import { useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
type QaAttempt = {
  authorizationId: string;
  id: string;
  state: string;
  expectedCost: string;
  chargedCost: string | null;
  orderId: string | null;
  createdAt: string;
};
type QaStatus = {
  authorizationId: string | null;
  configured: boolean;
  enabled: boolean;
  budgetUsd: string | null;
  selection?: {
    productId: number | string;
    name: string;
    deliveryType: string;
    maximumCostUsd: string;
  };
  campaignCapUsd?: string;
  campaignReservedUsd?: string;
  expiresAt: string | null;
  profile: { name: string; email: string | null } | null;
  attempts: QaAttempt[];
};
export function SupplierQaPanel({
  token,
  fa,
  locale,
}: {
  token: string;
  fa: boolean;
  locale: string;
}) {
  const { data, loading, error, refetch } = useApi<QaStatus>("/admin/suppliers/qa", token);
  const [requestKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function run(id?: string) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await api.post(
        id ? `/admin/suppliers/qa/attempts/${id}/reconcile` : "/admin/suppliers/qa/attempts",
        id ? {} : { requestKey },
        token,
      );
      refetch();
    } catch (e) {
      setMessage(
        e instanceof ApiError
          ? e.message
          : fa
            ? "عملیات ناموفق بود؛ پیش از خرید دوباره وضعیت را بررسی کن"
            : "Request failed. Reconcile before attempting another purchase.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <h2 className="font-semibold">
        {fa
          ? "آزمایش خرید و تحویل در پروفایل جدا"
          : "Purchase and delivery test in a dedicated profile"}
      </h2>
      <p className="mt-3 text-sm leading-7 text-muted">
        {fa
          ? "این مسیر فقط همان کالای مشخص و از قبل مجاز را می‌خرد. هزینه از کیف پول مدیر پرداخت می‌شود و فروش عمومی را فعال نمی‌کند. سقف مجوز و مصرف کل در پایین نمایش داده می‌شود؛ محصول تست API سقف جداگانهٔ پنج سنت دارد."
          : "Buys only the explicitly allowlisted product, funded by the operator wallet. Public sales remain disabled. The authorization cap and cumulative spending appear below; API-test products retain a USD0.05 cap."}
      </p>
      {(!data?.selection || data.selection.deliveryType === "api_test") && (
        <p className="mt-2 text-xs text-muted">
          {fa ? "محصول تست API اشتراک واقعی نیست." : "An API-test item is not a real subscription."}
        </p>
      )}
      {loading && <p className="mt-3 text-sm">{fa ? "در حال خواندن وضعیت…" : "Loading status…"}</p>}
      {error && (
        <Button variant="outline" onClick={refetch}>
          {fa ? "تلاش دوباره" : "Retry"}
        </Button>
      )}
      {data && (
        <>
          <p className="mt-3 text-sm">
            {data.enabled
              ? fa
                ? "مجوز محدود فعال است"
                : "Bounded authorization active"
              : fa
                ? "خرید غیرفعال است؛ سقف هزینه باید توسط مالک ثبت شود"
                : "Purchases disabled pending the owner's spending authorization"}
          </p>
          {data.budgetUsd && (
            <p className="mt-2 text-xs text-muted">
              {fa ? "سقف کل مجوز: " : "Authorization total cap: "}
              {data.budgetUsd} USD
            </p>
          )}
          {data.selection && (
            <p className="mt-2 text-sm" dir="auto">
              {data.selection.name} · {data.selection.maximumCostUsd} USD
            </p>
          )}
          {data.campaignReservedUsd && (
            <p className="mt-2 text-xs text-muted">
              {fa ? "مصرف/رزرو کل دوره: " : "Campaign spent/reserved: "}
              {data.campaignReservedUsd} / {data.campaignCapUsd} USD
            </p>
          )}
          {data.profile && (
            <p className="mt-2 break-words text-xs text-muted">
              {fa ? "پروفایل آزمایش: " : "Test profile: "}
              {data.profile.name} · {data.profile.email}
            </p>
          )}
          <Button
            className="mt-4"
            onClick={() => run()}
            disabled={
              busy ||
              !data.enabled ||
              !data.configured ||
              data.attempts?.some(
                (a) => a.authorizationId === data.authorizationId && a.state !== "FAILED_NO_CHARGE",
              )
            }
          >
            {busy
              ? fa
                ? "در حال بررسی…"
                : "Checking…"
              : fa
                ? "خرید یک محصول مجاز از کیف پول مدیر"
                : "Buy one allowlisted item from operator wallet"}
          </Button>
          <div className="mt-4 space-y-3">
            {data.attempts?.map((a) => (
              <div key={a.id} className="rounded-xl border border-border p-3 text-sm">
                <p>
                  {fa
                    ? ({
                        SENDING: "در حال ارسال",
                        UNCERTAIN: "نیازمند پیگیری",
                        PENDING: "در انتظار تأمین‌کننده",
                        DELIVERED: "تحویل‌شده",
                        FAILED_NO_CHARGE: "ناموفق؛ بدون برداشت",
                        REVIEW: "نیازمند بررسی",
                        STOCK_READY: "موجودی آمادهٔ آزمون",
                        AWAITING_PAYMENT: "در انتظار پرداخت آزمایشی",
                      }[a.state] ?? a.state)
                    : a.state}{" "}
                  · {a.chargedCost ?? a.expectedCost} USD
                </p>
                {a.orderId && (
                  <Link
                    className="mt-2 inline-block min-h-11 text-primary underline"
                    href={`/${locale}/admin/orders`}
                  >
                    {fa ? "بررسی سفارش آزمایشی" : "Inspect test order"}
                  </Link>
                )}
                {["SENDING", "UNCERTAIN", "PENDING"].includes(a.state) && (
                  <Button
                    className="mt-2"
                    variant="outline"
                    disabled={busy}
                    onClick={() => run(a.id)}
                  >
                    {fa
                      ? "پیگیری همان درخواست؛ بدون خرید مجدد"
                      : "Reconcile existing request; no new purchase"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {message && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {message}
        </p>
      )}
    </Card>
  );
}
