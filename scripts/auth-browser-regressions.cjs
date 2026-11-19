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
  assert(["hydration", "logout", "late401"].includes(scenario));
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
    let currentUser = null;
    let heldMe;
    let heldOrders;
    let logoutFailures = 0;
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
          currentUser ? { user } : { error: { message: "No synthetic session" } },
        );
      else if (route === "/auth/login") {
        currentUser = user;
        action = respond(requestId, 200, { user });
      } else if (route === "/auth/change-password") action = respond(requestId, 200, { user });
      else if (route === "/auth/logout" && scenario === "logout") {
        logoutFailures++;
        action = respond(requestId, 503, { error: { message: "Synthetic logout outage" } });
      } else if (route === "/auth/logout") {
        currentUser = null;
        action = respond(requestId, 204);
      } else if (route === "/orders" && scenario === "late401") {
        heldOrders = requestId;
        return;
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
      patterns: [{ urlPattern: "*://*/auth/*" }, { urlPattern: "*://*/orders*" }],
    });
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
        document.querySelectorAll("main input[type=password]").forEach((input,index)=>{
          set.call(input,index===0?"Synthetic-Password-1":"Synthetic-Password-2");input.dispatchEvent(new Event("input",{bubbles:true})); }); })()`);
      await nap(100);
      await evaluate('document.querySelector("main form").requestSubmit()');
      await nap(500);
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
