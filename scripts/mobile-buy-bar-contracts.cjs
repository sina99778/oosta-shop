/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");

process.env.TSX_TSCONFIG_PATH = path.resolve(__dirname, "../apps/web/tsconfig.json");
require("tsx/cjs");
require.extensions[".css"] = (module) => {
  module.exports = new Proxy({}, { get: (_, key) => (key === "__esModule" ? undefined : key) });
};

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
let anchorBottom = 900;
const control = { getBoundingClientRect: () => ({ bottom: anchorBottom }) };
let browserRender = false;
let pastAction = false;
let subscribe;
let updateVisibility;
let observed;
let disconnects = 0;
let scrollListener;
let scrollFrame;
const media = {
  matches: true,
  addEventListener: (event, listener) => {
    assert.equal(event, "change");
    media.listener = listener;
  },
  removeEventListener: (event, listener) => {
    assert.equal(event, "change");
    assert.equal(listener, media.listener);
    media.listener = undefined;
  },
};
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === "react")
    return {
      ...React,
      useRef: (initial) => (browserRender ? { current: control } : React.useRef(initial)),
      useState: (initial) =>
        browserRender ? [pastAction, (value) => (pastAction = value)] : React.useState(initial),
      useEffect: (effect, deps) => {
        if (browserRender) subscribe = effect;
        else React.useEffect(effect, deps);
      },
    };
  return originalLoad.call(this, request, ...args);
};

const { ProductPurchaseAction } = require("../apps/web/components/product-purchase-action.tsx");
globalThis.window = {
  addEventListener: (event, listener) => {
    assert.equal(event, "scroll");
    scrollListener = listener;
  },
  removeEventListener: (event) => {
    assert.equal(event, "scroll");
    scrollListener = undefined;
  },
  requestAnimationFrame: (callback) => {
    scrollFrame = callback;
    return 1;
  },
  cancelAnimationFrame: () => {
    scrollFrame = undefined;
  },
  matchMedia: (query) => {
    assert.match(query, /max-width/);
    return media;
  },
  IntersectionObserver: class {
    constructor(callback) {
      updateVisibility = (bottom, isIntersecting) =>
        callback([{ boundingClientRect: { bottom }, rootBounds: { top: 0 }, isIntersecting }]);
    }
    observe(element) {
      observed = element;
    }
    disconnect() {
      observed = undefined;
      disconnects++;
    }
  },
};

let actions = 0;
const action = React.createElement("button", { onClick: () => actions++ }, "Add to cart");
const props = {
  children: action,
  feedback: React.createElement("p", { role: "alert" }, "Checkout failed"),
  locale: "en",
  summary: { label: "Monthly plan", price: "Estimated 100" },
};
const markup = () => renderToStaticMarkup(React.createElement(ProductPurchaseAction, props));
const render = () => ProductPurchaseAction(props);
const sticky = () => render().props.children[1];

assert.doesNotMatch(markup(), /Monthly plan|Estimated 100/);
browserRender = true;
assert.ok(!sticky());
const unsubscribe = subscribe();
assert.equal(observed, control);

updateVisibility(900, false);
assert.ok(!sticky(), "A CTA initially below the fold must not trigger the bar");
anchorBottom = -500;
scrollListener?.();
scrollFrame?.();
assert.ok(sticky(), "A scroll jump past a below-fold CTA must reveal the bar");
updateVisibility(40, true);
assert.ok(!sticky());
updateVisibility(-1, false);
assert.match(markup(), /Monthly plan/);
assert.match(markup(), /Estimated 100/);
assert.equal((markup().match(/role="alert"/g) ?? []).length, 1);
assert.equal(sticky().props.children[0].props.children[1], action);
action.props.onClick();
assert.equal(actions, 1);
updateVisibility(40, true);
assert.ok(!sticky());
updateVisibility(-1, false);
media.matches = false;
media.listener();
assert.ok(!sticky(), "Desktop resizing removes the mobile action");
assert.equal(observed, undefined);
unsubscribe();
assert.ok(disconnects >= 2);
assert.equal(media.listener, undefined);
assert.equal(scrollListener, undefined);
console.log("PASS: mobile purchase observer, SSR, desktop resizing, shared action and error placement");
