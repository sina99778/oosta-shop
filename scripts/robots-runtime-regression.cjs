/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

async function main() {
  const root = path.resolve(__dirname, "..");
  const server = path.join(root, "apps/web/.next/standalone/apps/web/server.js");
  assert(fs.existsSync(server), "Build the web app before checking its production robots route");
  const port = await new Promise((resolve) => {
    const socket = net.createServer();
    socket.listen(0, "127.0.0.1", () => {
      const selected = socket.address().port;
      socket.close(() => resolve(selected));
    });
  });
  const origin = "https://robots-runtime.example.invalid";
  const child = spawn(process.execPath, [server], {
    cwd: root,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      NEXT_PUBLIC_WEB_URL: origin,
      WEB_BASE_URL: origin,
      API_INTERNAL_URL: "http://127.0.0.1:1",
      TELEGRAM_BOT_TOKEN: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  try {
    let response;
    for (let attempt = 0; attempt < 100 && !response; attempt++) {
      try {
        response = await fetch(`http://127.0.0.1:${port}/robots.txt`, {
          signal: AbortSignal.timeout(1000),
        });
      } catch {
        if (child.exitCode !== null) throw new Error("Production web process stopped");
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    assert(response, "Production web process did not start\n" + output);
    assert.equal(response.status, 200);
    const body = await response.text();
    assert(body.includes(`Host: ${origin}`), "Robots must use the runtime public origin\n" + body);
    assert(body.includes(`Sitemap: ${origin}/sitemap.xml`));
    assert(body.includes("Disallow: /fa/admin"));
    assert(body.includes("Disallow: /en/dashboard"));
    assert(!body.includes("localhost"));
    console.log(
      "PASS: built production robots uses runtime origin and preserves private-route exclusions",
    );
  } finally {
    child.kill();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
