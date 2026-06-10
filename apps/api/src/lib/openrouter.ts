// OpenRouter client (openrouter.ai) — OpenAI-compatible chat completions used by
// the Telegram AI agent: tool calling (chatWithTools) and image generation
// (generateImage). Raw fetch, no SDK. Transient errors (408/429/502/503) are
// retried with backoff honoring Retry-After; the fallback model is tried last.

import { env } from "../config/env";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

// OpenAI-style message shapes (the subset we use).
export type OrToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string }; // arguments is a JSON string
};
export type OrMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: OrToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export type OrToolDef = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};
export type OrAssistantMessage = {
  role: "assistant";
  content: string | null;
  tool_calls?: OrToolCall[];
  images?: { type: "image_url"; image_url: { url: string } }[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class OpenRouterHttpError extends Error {
  status: number;
  retryAfterMs: number | null;
  constructor(status: number, message: string, retryAfterMs: number | null = null) {
    super(message);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

const TRANSIENT_STATUSES = new Set([408, 429, 502, 503]);

export function isOpenRouterEnabled(): boolean {
  return Boolean(env.OPENROUTER_API_KEY);
}

async function callOnce(body: Record<string, unknown>): Promise<OrAssistantMessage> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "content-type": "application/json",
      // Attribution (optional, harmless): identifies the app on openrouter.ai.
      "http-referer": env.WEB_BASE_URL,
      "x-title": "oostaAI shop agent",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const retryAfter = res.headers.get("retry-after");
    const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : null;
    throw new OpenRouterHttpError(
      res.status,
      detail.slice(0, 300),
      Number.isFinite(retryAfterMs) ? retryAfterMs : null,
    );
  }

  const json = (await res.json()) as { choices?: { message?: OrAssistantMessage }[] };
  const message = json.choices?.[0]?.message;
  if (!message) throw new Error("OpenRouter returned no message");
  return message;
}

// Calls each model in order with retries. Non-transient HTTP errors (bad key,
// invalid request, no credits) abort immediately.
async function callWithRetry(
  models: string[],
  makeBody: (model: string) => Record<string, unknown>,
) {
  let lastError = "";
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await callOnce(makeBody(model));
      } catch (error) {
        const status = error instanceof OpenRouterHttpError ? error.status : 0;
        lastError = `${status}: ${error instanceof Error ? error.message : String(error)}`;

        if (status === 404) break; // unknown model -> try the fallback model
        if (status > 0 && !TRANSIENT_STATUSES.has(status)) {
          throw new Error(`OpenRouter rejected the request (${lastError})`);
        }
        if (attempt < 2) {
          const retryAfterMs = error instanceof OpenRouterHttpError ? error.retryAfterMs : null;
          // Clamp so a hostile/huge Retry-After can never hang the bot handler.
          await sleep(Math.min(retryAfterMs ?? 800 * Math.pow(2, attempt), 15_000));
        }
      }
    }
  }
  throw new Error(`OpenRouter request failed (${lastError})`);
}

// One turn of the agent loop: returns the assistant message (text and/or tool calls).
// The full tools array must be passed on EVERY call, including after tool results.
// `primaryModel` overrides env.OPENROUTER_MODEL (runtime selection from the bot).
export async function chatWithTools(
  messages: OrMessage[],
  tools: OrToolDef[],
  primaryModel?: string,
): Promise<OrAssistantMessage> {
  const primary = primaryModel || env.OPENROUTER_MODEL;
  const models = [primary];
  if (env.OPENROUTER_FALLBACK_MODEL && env.OPENROUTER_FALLBACK_MODEL !== primary) {
    models.push(env.OPENROUTER_FALLBACK_MODEL);
  }
  return callWithRetry(models, (model) => ({
    model,
    messages,
    tools,
    tool_choice: "auto",
    temperature: 0.4,
  }));
}

// Text-to-image via the configured image model (overridable at runtime). Returns
// raw bytes decoded from the base64 data URL in message.images[0].
export async function generateImage(
  prompt: string,
  imageModel?: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const model = imageModel || env.OPENROUTER_IMAGE_MODEL;
  const message = await callWithRetry([model], () => ({
    model,
    messages: [{ role: "user", content: prompt }],
    modalities: ["image", "text"],
    image_config: { aspect_ratio: "1:1" },
  }));

  const url = message.images?.[0]?.image_url?.url;
  if (!url || !url.startsWith("data:")) {
    throw new Error("The image model returned no image. Try rephrasing the prompt.");
  }
  // The MIME type comes from a third party — whitelist it so a scriptable type
  // (e.g. image/svg+xml) can never be stored and served from our origin.
  const SAFE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
  const semi = url.indexOf(";");
  const mimeType = semi > 5 ? url.slice(5, semi).toLowerCase() : "";
  if (!SAFE_MIMES.has(mimeType)) {
    throw new Error(`The image model returned an unsupported type (${mimeType || "unknown"}).`);
  }
  const comma = url.indexOf(",");
  const buffer = Buffer.from(url.slice(comma + 1), "base64");
  if (buffer.length === 0) throw new Error("The image model returned an empty image.");
  return { buffer, mimeType };
}
