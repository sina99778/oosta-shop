// Google Gemini client for the AI SEO assistant. Uses structured JSON output
// (responseSchema) so the model can only return well-formed, parseable metadata —
// keeping the assistant reliable. Disabled unless GEMINI_API_KEY is set.

import { env } from "../config/env";
import { AppError } from "../utils/httpError";

export type SeoGenInput = {
  name: string;
  category?: string;
  type?: string;
  description?: string;
  locale?: string;
  focusKeyword?: string;
};

export type SeoGenResult = {
  metaTitle: string;
  metaDescription: string;
  shortDescription: string;
  keywords: string[];
};

export function isAiEnabled(): boolean {
  return Boolean(env.GEMINI_API_KEY);
}

// Non-retryable statuses (bad request / auth / model-not-found handled separately).
// Everything else (429/5xx/network) is retried with backoff, then a fallback model.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class GeminiHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function buildPrompt(input: SeoGenInput): string {
  const lang = input.locale === "fa" ? "Persian (Farsi)" : "English";
  return [
    "You are an expert e-commerce SEO copywriter for a digital products store.",
    `Write SEO metadata for the following product, entirely in ${lang}.`,
    `Product name: ${input.name}`,
    input.category ? `Category: ${input.category}` : "",
    input.type ? `Product type: ${input.type}` : "",
    input.description ? `Description: ${input.description.slice(0, 1500)}` : "",
    input.focusKeyword
      ? `Focus keyword (use it naturally in the title and description): ${input.focusKeyword}`
      : "",
    "",
    "Rules:",
    "- metaTitle: compelling, at most 60 characters, include the product name.",
    "- metaDescription: persuasive, 140-160 characters, with a clear call to action.",
    "- shortDescription: one punchy sentence, at most 120 characters.",
    "- keywords: 5-8 relevant search keywords.",
    `- Everything MUST be written in ${lang}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

// One call to a specific model. Throws GeminiHttpError on a non-OK / network response.
async function callModel(model: string, prompt: string): Promise<SeoGenResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY! },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              metaTitle: { type: "string" },
              metaDescription: { type: "string" },
              shortDescription: { type: "string" },
              keywords: { type: "array", items: { type: "string" } },
            },
            required: ["metaTitle", "metaDescription", "shortDescription", "keywords"],
          },
        },
      }),
    });
  } catch (error) {
    // Network error → retryable (status 0).
    throw new GeminiHttpError(0, `network: ${String(error)}`);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new GeminiHttpError(res.status, detail.slice(0, 200));
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new GeminiHttpError(0, "empty response");

  let parsed: Partial<SeoGenResult>;
  try {
    parsed = JSON.parse(text) as Partial<SeoGenResult>;
  } catch {
    throw new GeminiHttpError(0, "malformed JSON");
  }

  return {
    metaTitle: String(parsed.metaTitle ?? "").slice(0, 70),
    metaDescription: String(parsed.metaDescription ?? "").slice(0, 200),
    shortDescription: String(parsed.shortDescription ?? "").slice(0, 200),
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(String).slice(0, 12) : [],
  };
}

export async function generateSeo(input: SeoGenInput): Promise<SeoGenResult> {
  if (!env.GEMINI_API_KEY) {
    throw new AppError(400, "AI_NOT_CONFIGURED", "AI is not configured (set GEMINI_API_KEY)");
  }
  const prompt = buildPrompt(input);
  const models = [env.GEMINI_MODEL];
  if (env.GEMINI_FALLBACK_MODEL && env.GEMINI_FALLBACK_MODEL !== env.GEMINI_MODEL) {
    models.push(env.GEMINI_FALLBACK_MODEL);
  }

  let lastStatus = 0;
  let lastDetail = "";
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await callModel(model, prompt);
      } catch (error) {
        const status = error instanceof GeminiHttpError ? error.status : 0;
        lastStatus = status;
        lastDetail = error instanceof Error ? error.message : String(error);

        if (status === 404) break; // model name unknown → try the fallback model
        if (status === 400 || status === 401 || status === 403) {
          throw new AppError(
            502,
            "AI_ERROR",
            `Gemini rejected the request (${status}): ${lastDetail}`,
          );
        }
        // Transient (or status 0) → back off and retry the same model.
        if (attempt < 2) await sleep(700 * Math.pow(2, attempt)); // 700ms, 1400ms
      }
    }
  }

  if (lastStatus === 503 || lastStatus === 429) {
    throw new AppError(
      503,
      "AI_BUSY",
      "The AI model is busy right now (high demand). Please try again in a few seconds.",
    );
  }
  throw new AppError(502, "AI_ERROR", `Gemini request failed (${lastStatus}): ${lastDetail}`);
}
