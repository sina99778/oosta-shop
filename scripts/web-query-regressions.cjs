/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const Module = require("node:module");
require("tsx/cjs");
const { api, ApiError } = require("../apps/web/lib/api.ts");

// Run the real hook with deterministic state slots and explicitly committed effects.
const state = [];
let slot = 0;
let previousDeps = [];
let cleanup;
let pendingEffect;
const requests = [];
const originalGet = api.get;
api.get = (path, token) =>
  new Promise((resolve, reject) => requests.push({ path, token, resolve, reject }));
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === "react")
    return {
      useState(initial) {
        const index = slot++;
        if (index === state.length) state.push(initial);
        return [
          state[index],
          (next) => {
            state[index] = typeof next === "function" ? next(state[index]) : next;
          },
        ];
      },
      useCallback: (callback) => callback,
      useEffect(effect, deps) {
        if (deps.some((dep, index) => dep !== previousDeps[index])) {
          previousDeps = deps;
          pendingEffect = effect;
        }
      },
    };
  return originalLoad.call(this, request, ...args);
};
const { useApi } = require("../apps/web/lib/use-api.ts");
Module._load = originalLoad;

function render(path, token) {
  slot = 0;
  return useApi(path, token);
}
async function commit() {
  if (pendingEffect) {
    cleanup?.();
    cleanup = pendingEffect();
    pendingEffect = undefined;
  }
  await Promise.resolve();
}
async function run() {
  assert(render("/order/a", "session-a").loading);
  await commit();
  requests.at(-1).resolve({ form: "first order" });
  await commit();
  render("/order/a", "session-a").refetch();
  render("/order/a", "session-a");
  await commit();
  const refreshing = render("/order/a", "session-a");
  assert.equal(refreshing.data?.form, "first order");
  assert.equal(refreshing.loading, false);
  requests.at(-1).reject(new ApiError("Network error", 0));
  await commit();
  await commit();
  assert.equal(render("/order/a", "session-a").data?.form, "first order");
  const changedPath = render("/order/b", "session-a");
  assert.equal(changedPath.data, null);
  assert(changedPath.loading);
  await commit();
  const staleRequest = requests.at(-1);
  assert.equal(render("/order/b", "session-b").data, null);
  await commit();
  staleRequest.resolve({ form: "old session" });
  requests.at(-1).resolve({ form: "second session" });
  await commit();
  assert.equal(render("/order/b", "session-b").data?.form, "second session");
  render("/order/b", "session-b").refetch();
  render("/order/b", "session-b");
  await commit();
  requests.at(-1).reject(new ApiError("Forbidden", 403));
  await commit();
  await commit();
  const denied = render("/order/b", "session-b");
  assert.equal(denied.data, null);
  assert.equal(denied.error?.status, 403);
  denied.refetch();
  render("/order/b", "session-b");
  await commit();
  requests.at(-1).resolve({ form: "restored access" });
  await commit();
  assert.equal(render("/order/b", "session-b").data?.form, "restored access");
  const disabled = render(null);
  assert.equal(disabled.data, null);
  assert.equal(disabled.error, null);
  assert.equal(disabled.loading, false);
  console.log(
    "PASS: same-identity refresh, transient failure retention, request races and access denial",
  );
}
run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    api.get = originalGet;
  });
