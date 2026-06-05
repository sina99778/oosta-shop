// AI agent for the Telegram admin bot. The admin sends a natural-language command;
// Gemini (function calling) plans and calls the tools below, which run the real
// admin/blog services in-process. Returns a short Persian summary when done.

import { env } from "../config/env";
import { ZodError } from "zod";
import * as adminSvc from "../modules/admin/admin.service";
import * as blogSvc from "../modules/blog/blog.service";
import {
  bulkInventorySchema,
  createCategorySchema,
  createPlanSchema,
  createProductSchema,
  updatePlanSchema,
  updateProductSchema,
} from "../modules/admin/admin.schemas";
import { createPostSchema, updatePostSchema } from "../modules/blog/blog.schemas";

export type PendingImage = { buffer: Buffer; mimeType: string };
type ToolCtx = { image?: PendingImage };

type JsonSchema = Record<string, unknown>;
type Tool = {
  name: string;
  description: string;
  parameters: JsonSchema;
  run: (args: Record<string, unknown>, ctx: ToolCtx) => Promise<unknown>;
};

// Remembered across calls so a follow-up photo can target the last item.
let lastProductId: string | null = null;
let lastPostId: string | null = null;

const apiPublicBase = () => `${env.WEB_BASE_URL.replace(/\/$/, "")}/api`;

function requireImage(ctx: ToolCtx): PendingImage {
  if (!ctx.image) {
    throw new Error("No image is attached. Ask the user to send a photo with their request.");
  }
  return ctx.image;
}

const obj = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({
  type: "object",
  properties,
  required,
});
const str = (description?: string): JsonSchema => ({
  type: "string",
  ...(description ? { description } : {}),
});
const num = (description?: string): JsonSchema => ({
  type: "number",
  ...(description ? { description } : {}),
});
const bool = (): JsonSchema => ({ type: "boolean" });

const TOOLS: Tool[] = [
  {
    name: "list_categories",
    description: "List all product categories (id, name, slug).",
    parameters: obj({}),
    run: () => adminSvc.listCategories(),
  },
  {
    name: "create_category",
    description: "Create a product category.",
    parameters: obj({ name: str(), slug: str("lowercase ascii, hyphenated") }, ["name", "slug"]),
    run: (a) => adminSvc.createCategory(createCategorySchema.parse(a)),
  },
  {
    name: "list_products",
    description: "List all products with their ids, plans count and stock.",
    parameters: obj({}),
    run: () => adminSvc.listProducts(),
  },
  {
    name: "get_product",
    description: "Get one product by id (plans, specs, SEO).",
    parameters: obj({ id: str() }, ["id"]),
    run: (a) => adminSvc.getProduct(String(a.id)),
  },
  {
    name: "create_product",
    description:
      "Create a product. Needs a categoryId (call list_categories first). type is ACCOUNT, LICENSE or GIFTCARD. After this, add at least one plan with add_plan.",
    parameters: obj(
      {
        name: str(),
        slug: str("lowercase ascii, hyphenated (transliterate Persian)"),
        description: str("Markdown, in the user's language"),
        shortDescription: str(),
        type: { type: "string", enum: ["ACCOUNT", "LICENSE", "GIFTCARD"] },
        categoryId: str(),
        isFeatured: bool(),
      },
      ["name", "slug", "description", "type", "categoryId"],
    ),
    run: async (a) => {
      const p = await adminSvc.createProduct(createProductSchema.parse(a));
      lastProductId = p.id;
      return p;
    },
  },
  {
    name: "update_product",
    description: "Update fields of an existing product by id.",
    parameters: obj(
      {
        id: str(),
        name: str(),
        slug: str(),
        description: str(),
        shortDescription: str(),
        isFeatured: bool(),
        isActive: bool(),
        metaTitle: str(),
        metaDescription: str(),
      },
      ["id"],
    ),
    run: (a) => {
      const { id, ...rest } = a;
      return adminSvc.updateProduct(String(id), updateProductSchema.parse(rest));
    },
  },
  {
    name: "add_plan",
    description: "Add a purchasable plan (price lives here) to a product.",
    parameters: obj({ productId: str(), label: str(), price: num(), salePrice: num() }, [
      "productId",
      "label",
      "price",
    ]),
    run: (a) => {
      const { productId, ...rest } = a;
      return adminSvc.createPlan(String(productId), createPlanSchema.parse(rest));
    },
  },
  {
    name: "update_plan",
    description: "Update a plan (label, price, salePrice, isActive).",
    parameters: obj({ id: str(), label: str(), price: num(), salePrice: num(), isActive: bool() }, [
      "id",
    ]),
    run: (a) => {
      const { id, ...rest } = a;
      return adminSvc.updatePlan(String(id), updatePlanSchema.parse(rest));
    },
  },
  {
    name: "add_inventory",
    description:
      "Add deliverable stock to a plan. Each item has accountEmail+accountPassword (ACCOUNT), licenseKey (LICENSE) or giftCardCode (GIFTCARD).",
    parameters: obj(
      {
        planId: str(),
        items: {
          type: "array",
          items: obj({
            accountEmail: str(),
            accountPassword: str(),
            licenseKey: str(),
            giftCardCode: str(),
          }),
        },
      },
      ["planId", "items"],
    ),
    run: (a) => adminSvc.bulkImportInventory(bulkInventorySchema.parse(a)),
  },
  {
    name: "get_stats",
    description: "Sales dashboard: revenue, orders, customers, top products, low stock.",
    parameters: obj({}),
    run: () => adminSvc.getStats(),
  },
  {
    name: "list_blog_posts",
    description: "List all blog posts.",
    parameters: obj({}),
    run: () => blogSvc.listAll(),
  },
  {
    name: "create_blog_post",
    description:
      "Create a blog/educational post. content is Markdown (images: ![alt](url), video: !video <url>). status DRAFT or PUBLISHED.",
    parameters: obj(
      {
        title: str(),
        slug: str("lowercase ascii, hyphenated"),
        excerpt: str(),
        content: str("Markdown body"),
        status: { type: "string", enum: ["DRAFT", "PUBLISHED"] },
      },
      ["title", "slug", "content"],
    ),
    run: async (a) => {
      const p = await blogSvc.createPost(createPostSchema.parse(a));
      lastPostId = p.id;
      return p;
    },
  },
  {
    name: "update_blog_post",
    description: "Update a blog post by id (title, slug, excerpt, content, status).",
    parameters: obj(
      {
        id: str(),
        title: str(),
        slug: str(),
        excerpt: str(),
        content: str(),
        status: { type: "string", enum: ["DRAFT", "PUBLISHED"] },
      },
      ["id"],
    ),
    run: (a) => {
      const { id, ...rest } = a;
      return blogSvc.updatePost(String(id), updatePostSchema.parse(rest));
    },
  },
  {
    name: "set_product_image",
    description:
      "Set the ATTACHED photo as a product's primary image. Requires a photo attached. If productId is omitted, the most recently created product is used.",
    parameters: obj({ productId: str() }),
    run: async (a, ctx) => {
      const img = requireImage(ctx);
      const id = (a.productId as string) || lastProductId;
      if (!id) throw new Error("No productId given and no recent product to use.");
      return adminSvc.setProductImage(String(id), { buffer: img.buffer, mimetype: img.mimeType });
    },
  },
  {
    name: "add_product_gallery_image",
    description: "Add the ATTACHED photo to a product's gallery. Requires a photo attached.",
    parameters: obj({ productId: str() }),
    run: async (a, ctx) => {
      const img = requireImage(ctx);
      const id = (a.productId as string) || lastProductId;
      if (!id) throw new Error("No productId given and no recent product to use.");
      return adminSvc.addGalleryImage(String(id), { buffer: img.buffer, mimetype: img.mimeType });
    },
  },
  {
    name: "set_blog_cover",
    description:
      "Set the ATTACHED photo as a blog post's cover. Requires a photo attached. If postId is omitted, the most recently created post is used.",
    parameters: obj({ postId: str() }),
    run: async (a, ctx) => {
      const img = requireImage(ctx);
      const id = (a.postId as string) || lastPostId;
      if (!id) throw new Error("No postId given and no recent post to use.");
      return blogSvc.setCover(String(id), { buffer: img.buffer, mimetype: img.mimeType });
    },
  },
  {
    name: "upload_blog_image",
    description:
      "Upload the ATTACHED photo as blog media and return its absolute URL. Then embed it inside post content with ![alt](url) via update_blog_post. Requires a photo attached.",
    parameters: obj({}),
    run: async (_a, ctx) => {
      const img = requireImage(ctx);
      const m = await blogSvc.addMedia({ buffer: img.buffer, mimetype: img.mimeType });
      return { url: `${apiPublicBase()}/blog-media/${m.id}` };
    },
  },
];

const SYSTEM = `You are the admin assistant for the "oostaAI" digital-goods store (AI accounts, licenses, gift cards). You manage the store by calling the provided tools.

Rules:
- Slugs MUST be lowercase ASCII words separated by hyphens; transliterate Persian to English for slugs.
- Product types are exactly ACCOUNT, LICENSE, or GIFTCARD.
- Prices are plain integer numbers (IRR), no separators.
- To add a product: ensure a category exists (list_categories; create_category if needed) → create_product → add_plan (at least one) → add_inventory if the user provided stock.
- Write all human content (descriptions, blog posts, excerpts) in the SAME language the user used (usually Persian), unless asked otherwise. Make it high quality and SEO-friendly.
- New blog posts/products can be created as DRAFT unless the user asks to publish.
- When a photo is attached (see [context]): use set_product_image (or add_product_gallery_image) for a product, or set_blog_cover for a blog post. To place a photo INSIDE blog text, call upload_blog_image to get a URL and then update_blog_post with the content containing ![alt](url). If the user doesn't say which item, use the most recent product/post id from [context].
- If a tool returns an error, read it, fix the arguments, and try again.
- When finished, reply with a SHORT summary in Persian of exactly what you did (names, ids, links). Keep it concise.`;

const MAX_STEPS = 10;

type Part =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };
type Content = { role: "user" | "model"; parts: Part[] };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class GeminiHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function callGeminiSingle(model: string, contents: Content[]): Promise<Content | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents,
      tools: [
        {
          functionDeclarations: TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ],
      generationConfig: { temperature: 0.4 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new GeminiHttpError(res.status, detail.slice(0, 200));
  }

  const json = (await res.json()) as { candidates?: { content?: Content }[] };
  return json.candidates?.[0]?.content ?? null;
}

async function callGemini(contents: Content[]): Promise<Content | null> {
  const models = [env.GEMINI_MODEL];
  if (env.GEMINI_FALLBACK_MODEL && env.GEMINI_FALLBACK_MODEL !== env.GEMINI_MODEL) {
    models.push(env.GEMINI_FALLBACK_MODEL);
  }

  let lastStatus = 0;
  let lastDetail = "";

  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await callGeminiSingle(model, contents);
      } catch (error) {
        const status = error instanceof GeminiHttpError ? error.status : 0;
        lastStatus = status;
        lastDetail = error instanceof Error ? error.message : String(error);

        if (status === 404) break; // model name unknown -> try fallback model
        if (status === 400 || status === 401 || status === 403) {
          throw new Error(`Gemini rejected the request (${status}): ${lastDetail}`);
        }
        if (attempt < 2) await sleep(700 * Math.pow(2, attempt)); // backoff
      }
    }
  }

  throw new Error(`Gemini request failed (${lastStatus}): ${lastDetail}`);
}

async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolCtx,
): Promise<Record<string, unknown>> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { error: `Unknown tool: ${name}` };
  try {
    const result = await tool.run(args ?? {}, ctx);
    return { result: result ?? { ok: true } };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        error: `Invalid arguments: ${error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      };
    }
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export function isAgentEnabled(): boolean {
  return Boolean(env.GEMINI_API_KEY);
}

// Runs the agent loop for a single instruction. opts.image makes a photo available
// to the image tools; opts.onStep is called with each tool name (for progress UI).
export async function runAgent(
  instruction: string,
  opts: { image?: PendingImage; onStep?: (note: string) => void } = {},
): Promise<string> {
  if (!env.GEMINI_API_KEY) return "هوش مصنوعی تنظیم نشده است (GEMINI_API_KEY).";

  const ctx: ToolCtx = { image: opts.image };
  const notes: string[] = [];
  if (opts.image) notes.push("A photo is attached to this message.");
  if (lastProductId) notes.push(`Most recent product id: ${lastProductId}.`);
  if (lastPostId) notes.push(`Most recent blog post id: ${lastPostId}.`);
  const text = notes.length ? `${instruction}\n\n[context] ${notes.join(" ")}` : instruction;

  const contents: Content[] = [{ role: "user", parts: [{ text }] }];

  for (let step = 0; step < MAX_STEPS; step++) {
    const reply = await callGemini(contents);
    if (!reply) return "پاسخی از مدل دریافت نشد.";
    contents.push({ role: "model", parts: reply.parts });

    const calls = reply.parts.filter(
      (p): p is { functionCall: { name: string; args: Record<string, unknown> } } =>
        "functionCall" in p,
    );

    if (calls.length === 0) {
      const final = reply.parts
        .map((p) => ("text" in p ? p.text : ""))
        .join("")
        .trim();
      return final || "انجام شد.";
    }

    const responseParts: Part[] = [];
    for (const call of calls) {
      opts.onStep?.(call.functionCall.name);
      const response = await runTool(call.functionCall.name, call.functionCall.args ?? {}, ctx);
      responseParts.push({ functionResponse: { name: call.functionCall.name, response } });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  return "به محدودیت تعداد مراحل رسیدم. لطفاً درخواست را ساده‌تر بفرست.";
}
