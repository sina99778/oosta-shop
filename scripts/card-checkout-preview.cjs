/* eslint-disable @typescript-eslint/no-require-imports */
// Local-only interaction fixture. No DB, real account, gateway, Telegram or model.
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const user = {
  id: "fixture-user",
  name: "Design preview",
  email: "preview@example.invalid",
  phone: null,
  role: "USER",
};
const states = new Map();
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:3102");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  const url = new URL(req.url, "http://127.0.0.1:4402");
  const send = (body, code = 200) => res.writeHead(code).end(JSON.stringify(body));
  if (url.pathname === "/auth/login" && req.method === "POST") {
    req.resume();
    return send({ user, token: "local-design-fixture" });
  }
  if (url.pathname === "/auth/me") return send({ user });
  if (url.pathname === "/site-settings")
    return send({
      settings: {
        announcementFa: "پیش‌نمایش طراحی کارت‌به‌کارت · همهٔ اطلاعات ساختگی‌اند",
        announcementEn: "Payment design preview · Synthetic data only",
      },
      enamadBadge: false,
    });
  if (url.pathname === "/categories") return send({ categories: [] });
  if (url.pathname === "/track") return res.writeHead(204).end();
  if (url.pathname.startsWith("/orders/")) {
    const id = url.pathname.split("/")[2];
    if (req.method === "POST" && url.pathname.endsWith("/receipt")) {
      req.resume();
      states.set(id, "PENDING_REVIEW");
      return send({ ok: true, receiptId: "fixture-receipt", paymentStatus: "PENDING_REVIEW" });
    }
    const status =
      states.get(id) ||
      {
        "desk-review": "PENDING_REVIEW",
        "desk-rejected": "REJECTED",
        "desk-paid": "PAID",
        "desk-closed": "REFUNDED",
        "desk-awaiting": "PAID_PENDING_FULFILLMENT",
      }[id] ||
      "PENDING";
    return send({
      order: {
        id,
        totalAmount: 4990000,
        currency: "IRR",
        paymentStatus: status,
        paymentProvider: "CARD_TO_CARD",
        createdAt: "2026-11-05T10:00:00Z",
        cardToCard: {
          number: "0000000000000000",
          holder: "کارت ساختگی برای پیش‌نمایش",
          bank: "بانک نمونه",
        },
        items: [
          {
            id: "fixture-item",
            product: {
              id: "fixture-product",
              name: "ChatGPT Plus · نمونهٔ طراحی",
              slug: "fixture",
              type: "ACCOUNT",
            },
            plan: { id: "fixture-plan", label: "اشتراک یک‌ماهه" },
            quantity: 1,
            unitPrice: 4990000,
            lineTotal: 4990000,
            credentials: [],
          },
        ],
        receipts: ["PENDING_REVIEW", "REJECTED", "PAID"].includes(status)
          ? [
              {
                id: "fixture-receipt",
                createdAt: "2026-11-05T11:00:00Z",
                status:
                  status === "REJECTED" ? "REJECTED" : status === "PAID" ? "APPROVED" : "PENDING",
                reference: "شماره پیگیری نمونه",
                reviewerNote:
                  status === "REJECTED" ? "مبلغ رسید خوانا نیست؛ تصویر واضح‌تری بفرستید" : null,
                reviewedAt: null,
              },
            ]
          : [],
      },
    });
  }
  return send({ error: { message: "Local fixture route not found" } }, 404);
});
server.listen(4402, "127.0.0.1", () => console.log("Synthetic API listening on 127.0.0.1:4402"));
const child = spawn(
  process.execPath,
  [require.resolve("next/dist/bin/next"), "dev", "-p", "3102", "-H", "127.0.0.1"],
  {
    cwd: path.resolve(__dirname, "../apps/web"),
    env: {
      ...process.env,
      NEXT_PUBLIC_API_URL: "http://127.0.0.1:4402",
      API_INTERNAL_URL: "http://127.0.0.1:4402",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: "inherit",
  },
);
child.on("exit", () => server.close());
process.on("SIGINT", () => {
  child.kill();
  server.close();
});
process.on("SIGTERM", () => {
  child.kill();
  server.close();
});
