/* eslint-disable @typescript-eslint/no-require-imports */
// Runs migrations, smoke tests and concurrency regressions on a disposable DB.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const bin =
  process.env.PG_BIN ||
  (process.platform === "win32" ? path.join(process.env.LOCALAPPDATA, "Programs/pgsql/bin") : "");
const executable = (name) => path.join(bin, name + (process.platform === "win32" ? ".exe" : ""));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oosta-regression-pg-"));
let started = false;
function run(command, args, env) {
  const daemonControl = path.basename(command).startsWith("pg_ctl");
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: daemonControl ? "ignore" : "pipe",
    encoding: "utf8",
    windowsHide: true,
    timeout: 180000,
    maxBuffer: 3000000,
  });
  if (result.status !== 0) {
    const log = path.join(dir, "server.log");
    const daemonLog =
      daemonControl && fs.existsSync(log) ? fs.readFileSync(log, "utf8").slice(-8000) : "";
    throw new Error(
      `${path.basename(command)} failed\n${result.stdout}\n${result.stderr}\n${daemonLog}`,
    );
  }
  return result.stdout;
}
async function main() {
  const port = await new Promise((resolve) => {
    const socket = net.createServer();
    socket.listen(0, "127.0.0.1", () => {
      const number = socket.address().port;
      socket.close(() => resolve(number));
    });
  });
  const env = {
    NODE_ENV: "test",
    DATABASE_URL: `postgresql://audit@127.0.0.1:${port}/postgres?schema=public`,
    // The disposable database is the only one the demo seed may reset.
    OOSTA_SEED_RESET: `127.0.0.1:${port}/postgres`,
    JWT_SECRET: "isolated-test-secret-not-for-deployment",
    PAYMENT_PROVIDER: "mock",
    ZARINPAL_SANDBOX: "true",
    CARD_TO_CARD_ENABLED: "false",
    TELEGRAM_BOT_TOKEN: "",
    GEMINI_API_KEY: "",
    OPENROUTER_API_KEY: "",
    BCRYPT_SALT_ROUNDS: "4",
    ISOLATED_REGRESSION_DB: "1",
    PATH: bin + path.delimiter + process.env.PATH,
  };
  try {
    run(
      executable("initdb"),
      ["-D", path.join(dir, "data"), "-U", "audit", "-A", "trust", "--encoding=UTF8", "--locale=C"],
      env,
    );
    run(
      executable("pg_ctl"),
      [
        "-D",
        path.join(dir, "data"),
        "-l",
        path.join(dir, "server.log"),
        "-o",
        // Ubuntu's shared socket directory is not writable by the CI runner; use TCP only.
        `-h 127.0.0.1 -p ${port}${process.platform === "win32" ? "" : " -c unix_socket_directories=''"}`,
        "-w",
        "start",
      ],
      env,
    );
    started = true;
    console.log(
      run(
        process.execPath,
        [
          path.join(root, "node_modules/prisma/build/index.js"),
          "migrate",
          "deploy",
          "--schema",
          path.join(root, "apps/api/prisma/schema.prisma"),
        ],
        env,
      ),
    );
    const focusedScript = process.argv.includes("--cart-only")
      ? "cart-regressions"
      : process.argv.includes("--supplier-wallet-only")
        ? "supplier-wallet-regressions"
        : null;
    if (focusedScript) {
      console.log(
        run(
          process.execPath,
          [
            path.join(root, "node_modules/tsx/dist/cli.mjs"),
            `apps/api/scripts/${focusedScript}.ts`,
          ],
          env,
        ),
      );
      return;
    }
    console.log(
      run(
        process.execPath,
        [
          path.join(root, "node_modules/tsx/dist/cli.mjs"),
          "apps/api/scripts/storefront-metrics-regressions.ts",
        ],
        env,
      ),
    );
    console.log(
      run(
        process.execPath,
        [path.join(root, "node_modules/tsx/dist/cli.mjs"), "apps/api/prisma/seed.ts"],
        env,
      ),
    );
    const smoke = run(
      process.execPath,
      [path.join(root, "node_modules/tsx/dist/cli.mjs"), "apps/api/scripts/smoke.ts"],
      env,
    );
    console.log(smoke.slice(smoke.lastIndexOf("[PASS]")));
    console.log(
      run(
        process.execPath,
        [path.join(root, "node_modules/tsx/dist/cli.mjs"), "apps/api/scripts/regressions.ts"],
        env,
      ),
    );
    console.log(
      run(
        process.execPath,
        [
          path.join(root, "node_modules/tsx/dist/cli.mjs"),
          "apps/api/scripts/auth-session-regressions.ts",
        ],
        env,
      ),
    );
    console.log(
      run(
        process.execPath,
        [
          path.join(root, "node_modules/tsx/dist/cli.mjs"),
          "apps/api/scripts/catalog-sorting-regressions.ts",
        ],
        env,
      ),
    );
    console.log(
      run(
        process.execPath,
        [
          path.join(root, "node_modules/tsx/dist/cli.mjs"),
          "apps/api/scripts/product-content-regressions.ts",
        ],
        env,
      ),
    );
    console.log(
      run(
        process.execPath,
        [
          path.join(root, "node_modules/tsx/dist/cli.mjs"),
          "apps/api/scripts/supplier-regressions.ts",
        ],
        env,
      ),
    );
    console.log(
      run(
        process.execPath,
        [path.join(root, "node_modules/tsx/dist/cli.mjs"), "apps/api/scripts/fx-regressions.ts"],
        env,
      ),
    );
    console.log(
      run(
        process.execPath,
        [
          path.join(root, "node_modules/tsx/dist/cli.mjs"),
          "apps/api/scripts/supplier-purchase-regressions.ts",
        ],
        env,
      ),
    );
    console.log(
      run(
        process.execPath,
        [
          path.join(root, "node_modules/tsx/dist/cli.mjs"),
          "apps/api/scripts/supplier-stock-regressions.ts",
        ],
        env,
      ),
    );
    console.log(
      run(
        process.execPath,
        [
          path.join(root, "node_modules/tsx/dist/cli.mjs"),
          "apps/api/scripts/capcut-purchase-regressions.ts",
        ],
        env,
      ),
    );
    console.log(
      run(
        process.execPath,
        [
          path.join(root, "node_modules/tsx/dist/cli.mjs"),
          "apps/api/scripts/blu-invoice-regressions.ts",
        ],
        env,
      ),
    );
    console.log(
      run(
        process.execPath,
        [
          path.join(root, "node_modules/tsx/dist/cli.mjs"),
          "apps/api/scripts/blu-event-regressions.ts",
        ],
        env,
      ),
    );
    console.log(
      run(
        process.execPath,
        [
          path.join(root, "node_modules/tsx/dist/cli.mjs"),
          "apps/api/scripts/blu-private-invoice-regressions.ts",
        ],
        env,
      ),
    );
    console.log(
      run(
        process.execPath,
        [
          path.join(root, "node_modules/tsx/dist/cli.mjs"),
          "apps/api/scripts/private-stock-checkout-regressions.ts",
        ],
        env,
      ),
    );
    console.log(
      run(
        process.execPath,
        [
          path.join(root, "node_modules/tsx/dist/cli.mjs"),
          "apps/api/scripts/blu-auto-approval-regressions.ts",
        ],
        env,
      ),
    );
    console.log(
      run(
        process.execPath,
        [
          path.join(root, "node_modules/tsx/dist/cli.mjs"),
          "apps/api/scripts/telegram-admin-regressions.ts",
        ],
        env,
      ),
    );
    console.log(
      run(
        process.execPath,
        [
          path.join(root, "node_modules/tsx/dist/cli.mjs"),
          "apps/api/scripts/supplier-fulfillment-regressions.ts",
        ],
        { ...env, DATABASE_URL: env.DATABASE_URL + "&connection_limit=1&pool_timeout=3" },
      ),
    );
    for (const script of ["supplier-wallet-regressions", "cart-regressions"]) {
      console.log(
        run(
          process.execPath,
          [path.join(root, "node_modules/tsx/dist/cli.mjs"), `apps/api/scripts/${script}.ts`],
          env,
        ),
      );
    }
  } finally {
    if (started)
      run(executable("pg_ctl"), ["-D", path.join(dir, "data"), "-m", "fast", "-w", "stop"], env);
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(dir));
    if (
      !relative.startsWith("..") &&
      !path.isAbsolute(relative) &&
      path.basename(dir).startsWith("oosta-regression-pg-")
    )
      fs.rmSync(dir, { recursive: true, force: true });
    console.log("Disposable database stopped and removed.");
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
