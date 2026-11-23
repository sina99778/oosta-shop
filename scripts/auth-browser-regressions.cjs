/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const nap = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const scenario = process.argv[2] || "hydration";
  assert(
    [
      "hydration",
      "logout",
      "late401",
      "checkoutRefresh",
      "cartPaidRetry",
      "accountPolish",
    ].includes(scenario),
  );
  const root = path.resolve(__dirname, "..");
  const app = path.join(root, "apps/web/.next/standalone/apps/web");
  assert(fs.existsSync(path.join(app, "server.js")), "Build the web app first");
  fs.cpSync(path.join(root, "apps/web/.next/static"), path.join(app, ".next/static"), {
    recursive: true,
  });
  fs.cpSync(path.join(root, "apps/web/public"), path.join(app, "public"), { recursive: true });
  const port = await new Promise((resolve) => {
    const socket = net.createServer();
    socket.listen(0, "127.0.0.1", () => {
      const selected = socket.address().port;
      socket.close(() => resolve(selected));
    });
  });
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [path.join(app, "server.js")], {
    stdio: "ignore",
    windowsHide: true,
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      API_INTERNAL_URL: "http://127.0.0.1:1",
      WEB_BASE_URL: origin,
      NEXT_TELEMETRY_DISABLED: "1",
      TELEGRAM_BOT_TOKEN: "",
    },
  });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "oosta-auth-browser-"));
  const browser = spawn(
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-background-networking",
      "--no-first-run",
      "--remote-debugging-port=0",
      "--user-data-dir=" + profile,
      "about:blank",
    ],
    { stdio: "ignore", windowsHide: true },
  );
  let ws;
  try {
    const portFile = path.join(profile, "DevToolsActivePort");
    for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await nap(100);
    const debugPort = fs.readFileSync(portFile, "utf8").split("\n")[0];
    const tabs = await fetch("http://127.0.0.1:" + debugPort + "/json/list").then((response) =>
      response.json(),
    );
    ws = new WebSocket(tabs.find((tab) => tab.type === "page").webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });
    const waiting = new Map();
    let serial = 0;
    const call = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++serial;
        waiting.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    const user = {
      id: "synthetic-browser-user",
      name: "Synthetic",
      email: "browser@example.invalid",
      phone: null,
      role: "USER",
    };
    const checkoutOrder = {
      id: "synthetic-checkout",
      totalAmount: 400,
      createdAt: "2026-11-20T10:00:00Z",
      currency: "IRR",
      paymentProvider: "CARD_TO_CARD",
      paymentStatus: "PENDING",
      cartPayment: { expiresAt: new Date(Date.now() + 60_000).toISOString(), remainingMs: 60_000 },
      cardToCard: { number: "0000000000000000", holder: "Synthetic", bank: "Fixture" },
      items: [],
      receipts: [],
    };
    let currentUser = ["checkoutRefresh", "cartPaidRetry"].includes(scenario) ? user : null;
    let heldMe;
    let heldOrders;
    let checkoutReads = 0;
    let paymentAttempts = 0;
    let logoutFailures = 0;
    let codeRequests = 0;
    let resetRequests = 0;
    let passwordChanges = 0;
    const respond = (requestId, responseCode, body) =>
      call("Fetch.fulfillRequest", {
        requestId,
        responseCode,
        responseHeaders: [
          { name: "content-type", value: "application/json" },
          { name: "Access-Control-Allow-Origin", value: origin },
          { name: "Access-Control-Allow-Credentials", value: "true" },
          { name: "Access-Control-Allow-Headers", value: "content-type" },
          { name: "Access-Control-Allow-Methods", value: "GET,POST,OPTIONS" },
        ],
        body: body === undefined ? "" : Buffer.from(JSON.stringify(body)).toString("base64"),
      });
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      const pending = waiting.get(message.id);
      if (pending) {
        waiting.delete(message.id);
        if (message.error) pending.reject(message.error);
        else pending.resolve(message.result);
      }
      if (message.method !== "Fetch.requestPaused") return;
      const { requestId, request } = message.params;
      const route = new URL(request.url).pathname.replace(/^\/api/, "");
      let action;
      if (request.method === "OPTIONS") action = respond(requestId, 204);
      else if (route === "/auth/me" && scenario === "hydration") {
        heldMe = requestId;
        return;
      } else if (route === "/auth/me")
        action = respond(
          requestId,
          currentUser ? 200 : 401,
          currentUser ? { user: currentUser } : { error: { message: "No synthetic session" } },
        );
      else if (route === "/auth/login") {
        currentUser = user;
        action = respond(requestId, 200, { user });
      } else if (scenario === "accountPolish" && route === "/auth/signup") {
        currentUser = user;
        action = respond(requestId, 201, { user });
      } else if (scenario === "accountPolish" && route === "/auth/recovery-email/request") {
        codeRequests++;
        action = respond(requestId, 202, { deliveryRequested: true });
      } else if (scenario === "accountPolish" && route === "/auth/recovery-email/verify") {
        currentUser = { ...user, recoveryEmailVerified: true };
        action = respond(requestId, 204);
      } else if (scenario === "accountPolish" && route === "/auth/inbox") {
        action = respond(requestId, 200, {
          welcomeGift: { code: "WELCOME-SYNTHETIC", percent: 15, state: "AVAILABLE" },
        });
      } else if (scenario === "accountPolish" && route === "/auth/reset-password") {
        resetRequests++;
        action = respond(requestId, 204);
      } else if (scenario === "accountPolish" && route === "/orders") {
        action = respond(requestId, 200, {
          orders: [
            { ...checkoutOrder, firstProductName: "Synthetic display product", itemCount: 1 },
          ],
        });
      } else if (route === "/auth/change-password") {
        passwordChanges++;
        action = respond(requestId, 200, { user });
      } else if (route === "/auth/logout" && scenario === "logout") {
        logoutFailures++;
        action = respond(requestId, 503, { error: { message: "Synthetic logout outage" } });
      } else if (route === "/auth/logout") {
        currentUser = null;
        action = respond(requestId, 204);
      } else if (route === "/orders" && scenario === "late401") {
        heldOrders = requestId;
        return;
      } else if (route === "/orders/synthetic-checkout") {
        if (checkoutReads++ > 0) {
          heldOrders = requestId;
          return;
        }
        action = respond(requestId, 200, { order: checkoutOrder });
      } else if (route === "/cart/count") {
        action = respond(requestId, 200, { count: 2 });
      } else if (route === "/cart/items/synthetic-line/review") {
        action = respond(requestId, 200, {
          invoice: {
            id: "synthetic-line",
            currency: "IRR",
            items: [{ id: "synthetic-line", product: "Synthetic", label: "Demo", amount: "400" }],
            subtotal: "400",
            discount: "0",
            total: "400",
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            methods: { online: true, cardToCard: false },
          },
        });
      } else if (route === "/cart/items/synthetic-line/pay") {
        action = respond(requestId, 201, {
          order: { ...checkoutOrder, paymentStatus: ++paymentAttempts === 1 ? "PENDING" : "PAID" },
        });
      } else action = call("Fetch.continueRequest", { requestId });
      action.catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
    });
    const evaluate = async (expression) => {
      const result = await call("Runtime.evaluate", { expression, returnByValue: true });
      if (result.exceptionDetails)
        throw new Error(
          result.exceptionDetails.exception?.description || result.exceptionDetails.text,
        );
      return result.result.value;
    };
    const until = async (expression, label) => {
      for (let i = 0; i < 100; i++) {
        if (await evaluate(expression)) return;
        await nap(100);
      }
      throw new Error("Timed out " + label);
    };
    await call("Page.enable");
    await call("Network.enable");
    await call("Network.setBlockedURLs", { urls: ["*://*/api/track", "*://*/track"] });
    await call("Fetch.enable", {
      patterns: [
        { urlPattern: "*://*/auth/*" },
        { urlPattern: "*://*/orders*" },
        { urlPattern: "*://*/cart/count" },
        { urlPattern: "*://*/cart/items/*" },
      ],
    });
    if (scenario === "accountPolish") {
      const setInput = (selector, value) =>
        evaluate(`(() => {
        const input = document.querySelector(${JSON.stringify(selector)});
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        set.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event("input", { bubbles: true }));
      })()`);
      await call("Emulation.setDeviceMetricsOverride", {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
      });
      await call("Page.navigate", { url: origin + "/fa/signup" });
      await until('!!document.querySelector("#auth-password")', "signup password");
      assert(!(await evaluate('!!document.querySelector("#auth-password-strength")')));
      await setInput('input[autocomplete="name"]', "Synthetic Shopper");
      await setInput('input[autocomplete="email"]', user.email);
      await setInput("#auth-password", "Synthetic-Password-1");
      await until('!!document.querySelector("#auth-password-strength")', "password meter");
      const reveal = 'document.querySelector("button[aria-controls=auth-password]")';
      const revealLabel = await evaluate(`${reveal}.getAttribute("aria-label")`);
      await evaluate(`${reveal}.click()`);
      await until('document.querySelector("#auth-password").type === "text"', "password reveal");
      assert.equal(await evaluate(`${reveal}.getAttribute("aria-label")`), revealLabel);
      assert.equal(await evaluate(`${reveal}.getAttribute("aria-pressed")`), "true");
      await evaluate('document.querySelector("main form").requestSubmit()');
      await until(
        '!!document.querySelector("#recovery-code") && document.body.innerText.includes("مرحله ۲ از ۲")',
        "verification step",
      );
      await until(
        'document.querySelector("#recovery-code") === document.activeElement',
        "verification focus",
      );
      assert.equal(
        await evaluate('document.querySelector("details:has(#recovery-password)").open'),
        false,
      );
      assert(
        await evaluate(`(() => {
        const input = document.querySelector("#recovery-password");
        input.focus();
        return document.activeElement !== input;
      })()`),
        "a closed resend form cannot receive focus",
      );
      await evaluate('document.querySelector("details:has(#recovery-password) summary").click()');
      await setInput("#recovery-password", "Synthetic-Password-1");
      await evaluate('document.querySelector("#recovery-password").form.requestSubmit()');
      await until(
        '!document.querySelector("details:has(#recovery-password)").open',
        "resend closes and returns to verification",
      );
      assert.equal(codeRequests, 2);
      await setInput("#recovery-code", "A".repeat(43));
      await evaluate('document.querySelector("#recovery-code").form.requestSubmit()');
      await until(
        'document.body.innerText.includes("Synthetic display product")',
        "account order product title",
      );
      await until('document.body.innerText.includes("ایمیل تأیید شده")', "verified status");
      assert(
        await evaluate("document.documentElement.scrollWidth <= innerWidth"),
        "mobile account is not horizontally clipped",
      );
      assert.equal(
        await evaluate('document.querySelector("main nav").querySelectorAll("a").length'),
        4,
      );
      assert(!(await evaluate('document.body.innerText.includes("WELCOME-SYNTHETIC")')));
      await evaluate(`document.querySelector('main nav a[href$="/inbox"]').click()`);
      await until('document.body.innerText.includes("WELCOME-SYNTHETIC")', "inbox coupon");
      await evaluate(`Object.defineProperty(navigator, "clipboard", {
        configurable: true, value: { writeText: async (text) => { window.copiedCode = text; } }
      }); [...document.querySelectorAll("main article button")].find(button => button.innerText.includes("کپی کد تخفیف")).click()`);
      await until(
        'document.body.innerText.includes("کد کپی شد.") && window.copiedCode === "WELCOME-SYNTHETIC"',
        "coupon copy success",
      );
      await evaluate(`document.querySelector('main nav a[href$="/security"]').click()`);
      await until(
        `(() => {
        const nav = document.querySelector("main nav");
        const current = nav?.querySelector('a[href$="/security"][aria-current]');
        if (!current) return false;
        const item = current.getBoundingClientRect();
        const viewport = nav.getBoundingClientRect();
        return item.left >= viewport.left - 1 && item.right <= viewport.right + 1;
      })()`,
        "active security link stays visible in the mobile scroller",
      );
      await call("Page.navigate", { url: origin + "/fa/reset-password#token=" + "B".repeat(43) });
      await until(
        '!!document.querySelector("#reset-new-password")',
        "reset password from secure fragment",
      );
      assert.equal(await evaluate("location.hash"), "");
      await setInput("#reset-new-password", "Synthetic-Password-2");
      await setInput("#reset-confirmation", "Different-fixture-3");
      await until('!!document.querySelector("#reset-password-strength")', "reset meter");
      await evaluate('document.querySelector("button[aria-controls=reset-confirmation]").click()');
      await until(
        'document.querySelector("#reset-confirmation").type === "text"',
        "confirmation reveal",
      );
      await evaluate('document.querySelector("#reset-confirmation").form.requestSubmit()');
      await until('!!document.querySelector("main [role=alert]")', "mismatched passwords");
      assert.equal(resetRequests, 0);
      await setInput("#reset-confirmation", "Synthetic-Password-2");
      await evaluate('document.querySelector("#reset-confirmation").form.requestSubmit()');
      await until('!document.querySelector("#reset-new-password")', "successful reset");
      assert.equal(resetRequests, 1);
      console.log(
        "PASS: mobile signup, resend, dashboard, coupon, and reset with synthetic responses",
      );
      return;
    }
    if (scenario === "checkoutRefresh") {
      await call("Page.navigate", { url: origin + "/fa/checkout/card/synthetic-checkout" });
      await call("Page.bringToFront");
      await until('!!document.querySelector("#receipt-reference")', "receipt form");
      await until(`!!document.querySelector("header [aria-label='سبد خرید (۲)']")`, "cart badge");
      await evaluate(`(() => {
        const input = document.querySelector('#receipt-reference');
        window.originalReceiptInput = input;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '12345');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        document.dispatchEvent(new Event('visibilitychange'));
      })()`);
      for (let i = 0; i < 100 && !heldOrders; i++) await nap(100);
      assert(heldOrders, "Hold the visibility-triggered refresh");
      const formPreserved = `document.querySelector('#receipt-reference') === window.originalReceiptInput && window.originalReceiptInput.value === '12345'`;
      assert(
        await evaluate(formPreserved),
        "A pending refresh must preserve the mounted input and its draft",
      );
      await respond(heldOrders, 503, { error: { code: "INTERNAL_SERVER_ERROR" } });
      await until('!!document.querySelector("main [role=alert]")', "refresh failure");
      assert(await evaluate(formPreserved), "A temporary outage must preserve the draft");
      heldOrders = null;
      await evaluate("document.dispatchEvent(new Event('visibilitychange'))");
      for (let i = 0; i < 100 && !heldOrders; i++) await nap(100);
      assert(heldOrders, "Hold the retry after the temporary outage");
      await respond(heldOrders, 403, { error: { code: "FORBIDDEN" } });
      await until(
        '!document.querySelector("#receipt-reference")',
        "access denial clears receipt form",
      );
      console.log(
        "PASS: checkout browser preserves receipt draft on refresh and clears data on access denial",
      );
      return;
    }
    if (scenario === "cartPaidRetry") {
      const reviewPath = "/en/cart/review/synthetic-line";
      await call("Page.navigate", { url: origin + reviewPath });
      const payButton = `[...document.querySelectorAll('main button')].find(b => b.innerText === 'Confirm and pay online')`;
      await until(`Boolean(${payButton})`, "cart payment button");
      await evaluate(`${payButton}.click()`);
      await until(
        '!!document.querySelector("main [role=alert]")',
        "unpaid response cannot omit redirect",
      );
      assert.equal(await evaluate("location.pathname"), reviewPath);
      await evaluate(`${payButton}.click()`);
      await until(
        `location.pathname === '/en/dashboard/orders/synthetic-checkout'`,
        "paid retry opens the order",
      );
      assert.equal(paymentAttempts, 2);
      console.log(
        "PASS: an online cart retry opens the owner’s already-paid order without a gateway redirect",
      );
      return;
    }
    await call("Page.navigate", { url: origin + "/fa/login?next=/fa/dashboard/security" });
    await until('!!document.querySelector("input[autocomplete=username]")', "login form");
    await evaluate(`(() => { const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;
      for(const [selector,value] of [['input[autocomplete=username]','browser@example.invalid'],['input[autocomplete=current-password]','Synthetic-Password-1']]){
        const input=document.querySelector(selector);set.call(input,value);input.dispatchEvent(new Event("input",{bubbles:true})); } })()`);
    await nap(100);
    await evaluate('document.querySelector("form").requestSubmit()');
    await until('location.pathname === "/fa/dashboard/security"', "login navigation");
    if (scenario === "hydration") {
      assert(heldMe, "Hold the initial authentication response");
      await respond(heldMe, 200, { user: { ...user, id: "older-browser-user", role: "ADMIN" } });
      await nap(400);
      assert(
        !(await evaluate(`!!document.querySelector("a[href='/fa/admin']")`)),
        "Old hydration must not overwrite a completed login",
      );
    } else if (scenario === "logout") {
      await until(
        '[...document.querySelectorAll("header button")].some(b=>b.innerText==="خروج")',
        "logout action",
      );
      await evaluate(
        '[...document.querySelectorAll("header button")].find(b=>b.innerText==="خروج").click()',
      );
      await nap(500);
      assert.equal(logoutFailures, 1);
      assert(
        await evaluate(
          '[...document.querySelectorAll("header button")].some(b=>b.innerText==="خروج")',
        ),
        "Failed server logout must preserve the signed-in state",
      );
      assert(
        await evaluate('!!document.querySelector("header [role=alert]")'),
        "Explain the failed logout so it can be retried",
      );
    } else {
      await evaluate(`document.querySelector("a[href='/fa/dashboard']").click()`);
      for (let i = 0; i < 100 && !heldOrders; i++) await nap(100);
      assert(heldOrders, "Hold the old session's orders response");
      await evaluate(`document.querySelector("a[href='/fa/dashboard/security']").click()`);
      await until('!!document.querySelector("input[autocomplete=new-password]")', "security form");
      await evaluate(`(() => { const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;
        document.querySelectorAll("#account-current-password,#account-new-password,#account-confirm-password").forEach((input,index)=>{
          set.call(input,index===0?"Synthetic-Password-1":"Synthetic-Password-2");input.dispatchEvent(new Event("input",{bubbles:true})); }); })()`);
      await nap(100);
      await evaluate('document.querySelector("#account-new-password").form.requestSubmit()');
      await until(
        '!!document.querySelector("section[aria-labelledby=change-password-title] [role=status]")',
        "change feedback belongs to the password card",
      );
      assert.equal(passwordChanges, 1);
      await respond(heldOrders, 401, { error: { message: "Older synthetic session revoked" } });
      await nap(500);
      assert.equal(
        await evaluate("location.pathname"),
        "/fa/dashboard/security",
        "An old 401 must not log out the new password session",
      );
    }
    console.log("PASS: actual auth browser flow " + scenario + " with synthetic responses");
  } finally {
    ws?.close();
    browser.kill();
    server.kill();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
