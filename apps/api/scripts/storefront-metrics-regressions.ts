import assert from "node:assert/strict";
import { inject } from "light-my-request";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { getVisitStats } from "../src/modules/analytics/analytics.service";

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
