import assert from "node:assert/strict";
import { inject } from "light-my-request";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { signAccessToken } from "../src/lib/jwt";
import { getVisitStats, visitorHashFor } from "../src/modules/analytics/analytics.service";

async function main() {
  assert.equal(process.env.ISOLATED_REGRESSION_DB, "1");
  const app = createApp();
  const submit = (payload: object, userAgent = "SyntheticBrowser") =>
    inject(app, { method: "POST", url: "/track", headers: { "user-agent": userAgent }, payload });
  await Promise.all([submit({ step: "plan_selected" }), submit({ step: "plan_selected" })]);
  await submit({ step: "quote_received" }, "synthetic crawler");
  await submit({ step: "unknown" });
  await submit({ step: "plan_restored", email: "sample@example.invalid" });
  const report = await getVisitStats();
  assert.deepEqual(report.stepsWeek, [{ step: "plan_selected", count: 2 }]);
  assert.equal(report.week.views, 0);
  const remoteAddress = "198.18.0.10";
  for (const forwardedAddress of ["198.18.0.11", "198.18.0.12"]) {
    const visit = await inject(app, {
      method: "POST",
      url: "/track",
      remoteAddress,
      headers: {
        "user-agent": "SyntheticBrowser",
        "ar-real-ip": forwardedAddress,
        "x-real-ip": forwardedAddress,
        "x-forwarded-for": forwardedAddress,
        "x-country-code": "IR",
        "cf-ipcountry": "US",
      },
      payload: { path: "/fa/products?discard=fixture" },
    });
    assert.equal(visit.statusCode, 204);
  }
  const visits = await prisma.visit.findMany({
    select: { path: true, country: true, visitorHash: true },
  });
  assert.deepEqual(
    visits,
    Array.from({ length: 2 }, () => ({
      path: "/fa/products",
      country: "??",
      visitorHash: visitorHashFor(remoteAddress, "SyntheticBrowser"),
    })),
  );
  assert.equal((await getVisitStats()).week.visitors, 1);

  const buyer = await prisma.user.create({ data: { name: "Fixture", passwordHash: "unused" } });
  const paidAt = new Date(Date.now() - 2 * 86400000);
  paidAt.setUTCHours(21, 0, 0, 0);
  const tehranDay = new Date(paidAt.getTime() + 3.5 * 3600000).toISOString().slice(0, 10);
  await prisma.order.createMany({
    data: [
      { userId: buyer.id, totalAmount: 101, currency: "IRT", paymentStatus: "PAID", paidAt },
      { userId: buyer.id, totalAmount: 300, currency: "IRR", paymentStatus: "REFUNDED", paidAt },
    ],
  });
  const readStats = (id: string, role: "USER" | "ADMIN") =>
    inject(app, {
      method: "GET",
      url: "/admin/stats",
      headers: { authorization: `Bearer ${signAccessToken({ sub: id, role })}` },
    });
  assert.equal((await readStats(buyer.id, "ADMIN")).statusCode, 403);
  const admin = await prisma.user.create({
    data: { name: "Dashboard admin", role: "ADMIN", passwordHash: "unused" },
  });
  const response = await readStats(admin.id, "ADMIN");
  assert.equal(response.statusCode, 200, response.body);
  assert.match(String(response.headers["cache-control"]), /no-store/);
  const stats = response.json();
  assert.deepEqual(stats.salesByDay, [{ day: tehranDay, count: 1, revenue: 1010 }]);
  assert.equal(stats.paidOrders, 1);
  console.log(
    "PASS: anonymous funnel counters aggregate concurrent events, reject unexpected fields and keep page views separate",
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
