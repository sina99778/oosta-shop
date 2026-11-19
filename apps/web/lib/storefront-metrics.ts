import { assetUrl } from "./api";

type Step =
  | "product_viewed"
  | "plan_selected"
  | "quote_received"
  | "plan_login_started"
  | "plan_restored";

export function trackStorefrontStep(step: Step) {
  void fetch(assetUrl("/track"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "omit",
    referrerPolicy: "no-referrer",
    body: JSON.stringify({ step }),
    keepalive: true,
  }).catch(() => {});
}

const returnKey = "oosta-plan-return";

// Called only after login/signup succeeds. The selection stays in this tab.
export function rememberPlanReturn(destination: string) {
  try {
    sessionStorage.removeItem(returnKey);
    const url = new URL(destination, window.location.origin);
    const plan = url.searchParams.get("plan");
    if (
      url.origin === window.location.origin &&
      /^\/(fa|en)\/products\/[^/]+$/.test(url.pathname) &&
      plan
    ) {
      sessionStorage.setItem(returnKey, JSON.stringify([url.pathname, plan]));
    }
  } catch {
    /* Storage may be disabled. */
  }
}

export function consumePlanReturn(locale: string, slug: string, plan: string | null) {
  try {
    const marker = sessionStorage.getItem(returnKey);
    if (!marker) return;
    sessionStorage.removeItem(returnKey);
    if (
      plan &&
      marker === JSON.stringify([`/${locale}/products/${encodeURIComponent(slug)}`, plan])
    ) {
      trackStorefrontStep("plan_restored");
    }
  } catch {
    /* Optional analytics must not interrupt checkout. */
  }
}
