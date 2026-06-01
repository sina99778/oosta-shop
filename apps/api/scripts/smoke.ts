// In-process smoke test for the Express app. Uses light-my-request to inject
// requests directly into the handler (no network socket / no listen()), which
// also works in environments that forbid binding TCP ports.
//
// Run: npm run smoke -w @oosta/api

import "dotenv/config";
import { inject } from "light-my-request";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

const app = createApp();

type Check = { name: string; pass: boolean; info: string };
const checks: Check[] = [];

function record(name: string, pass: boolean, info: string): void {
  checks.push({ name, pass, info });
}

async function main(): Promise<void> {
  const ip = "127.0.0.1";

  // 1. Liveness
  const health = await inject(app, { method: "GET", url: "/health", remoteAddress: ip });
  const healthBody = JSON.parse(health.body);
  record("GET /health -> 200", health.statusCode === 200, `status=${health.statusCode}`);
  record("health.status === ok", healthBody.status === "ok", JSON.stringify(healthBody));

  // 2. Security headers
  record(
    "x-powered-by removed",
    health.headers["x-powered-by"] === undefined,
    `value=${String(health.headers["x-powered-by"])}`,
  );
  record(
    "helmet: x-content-type-options=nosniff",
    health.headers["x-content-type-options"] === "nosniff",
    String(health.headers["x-content-type-options"]),
  );
  record(
    "rate-limit headers present",
    health.headers["ratelimit"] !== undefined || health.headers["ratelimit-policy"] !== undefined,
    JSON.stringify({
      ratelimit: health.headers["ratelimit"],
      policy: health.headers["ratelimit-policy"],
    }),
  );

  // 3. CORS reflects an allowed origin
  const cors = await inject(app, {
    method: "GET",
    url: "/health",
    headers: { origin: "http://localhost:3000" },
    remoteAddress: ip,
  });
  record(
    "CORS allow-origin echoed",
    cors.headers["access-control-allow-origin"] === "http://localhost:3000",
    String(cors.headers["access-control-allow-origin"]),
  );

  // 4. DB readiness (outbound connection to Postgres)
  const db = await inject(app, { method: "GET", url: "/health/db", remoteAddress: ip });
  const dbBody = JSON.parse(db.body);
  record("GET /health/db -> 200", db.statusCode === 200, `status=${db.statusCode} body=${db.body}`);
  record("db connected", dbBody.database === "connected", JSON.stringify(dbBody));

  // 5. Unknown route -> structured 404
  const nf = await inject(app, { method: "GET", url: "/does-not-exist", remoteAddress: ip });
  const nfBody = JSON.parse(nf.body);
  record("unknown route -> 404", nf.statusCode === 404, `status=${nf.statusCode}`);
  record(
    "404 error.code === NOT_FOUND",
    nfBody?.error?.code === "NOT_FOUND",
    JSON.stringify(nfBody),
  );

  let allPass = true;
  for (const c of checks) {
    if (!c.pass) allPass = false;
    console.log(`[${c.pass ? "PASS" : "FAIL"}] ${c.name} — ${c.info}`);
  }
  console.log(allPass ? "\nALL CHECKS PASSED" : "\nSOME CHECKS FAILED");
  await prisma.$disconnect();
  process.exit(allPass ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
