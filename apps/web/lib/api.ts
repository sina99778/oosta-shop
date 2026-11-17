// Typed fetch client for the backend API. Usable from client and server components.
//
// Browser requests authenticate with the API's httpOnly session cookie
// (`credentials: "include"`). The optional `session` argument is the opaque marker
// from useAuth(): it is never sent; it only identifies which session a 401 ended.

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Absolute URL for a public API asset (e.g. a product image) usable in <img src>.
export function assetUrl(path: string): string {
  return `${BASE_URL}${path}`;
}

// Resolve a product's display image: explicit URL wins, else the uploaded image
// endpoint when present, else null (caller renders a placeholder).
export function productImageUrl(p: {
  id: string;
  image: string | null;
  hasImage?: boolean;
  imageVersion?: string;
}): string | null {
  if (p.image) return p.image;
  if (p.hasImage)
    return assetUrl(
      `/products/${p.id}/image?v=${encodeURIComponent(p.imageVersion ?? "covers-2")}`,
    );
  return null;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function fetchWithTimeout(
  path: string,
  options: RequestInit,
  session?: string,
): Promise<Response> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      credentials: "include",
      signal: AbortSignal.timeout(options.body instanceof FormData ? 60000 : 20000),
      cache: "no-store",
    });
    if (res.status === 401 && session && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("oosta:unauthorized", { detail: session }));
    }
    return res;
  } catch (error) {
    throw new ApiError(
      error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)
        ? "Request timed out. Please retry."
        : "Unable to connect. Please check your connection.",
      0,
      "NETWORK_ERROR",
    );
  }
}

async function readJson<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  let data;
  try {
    data = await res.json();
  } catch {
    throw new ApiError(
      "The server returned an invalid response. Please retry.",
      res.ok ? 502 : res.status,
      "INVALID_RESPONSE",
    );
  }
  if (!res.ok) {
    const err = data?.error ?? {};
    throw new ApiError(err.message ?? "Request failed", res.status, err.code, err.details);
  }
  if (!data || typeof data !== "object")
    throw new ApiError("The server returned an invalid response.", 502, "INVALID_RESPONSE");
  return data as T;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  session?: string,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  return readJson<T>(
    await fetchWithTimeout(
      path,
      { method, headers, body: body === undefined ? undefined : JSON.stringify(body) },
      session,
    ),
  );
}
async function upload<T>(path: string, form: FormData, session?: string): Promise<T> {
  const types = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);
  for (const value of form.values()) {
    if (value instanceof Blob && (value.size > 5 * 1024 * 1024 || !types.has(value.type))) {
      throw new ApiError(
        "Choose a JPG, PNG, WebP, GIF or PDF file up to 5 MB.",
        400,
        "INVALID_FILE",
      );
    }
  }
  return readJson<T>(await fetchWithTimeout(path, { method: "POST", body: form }, session));
}
async function blob(path: string, session?: string): Promise<Blob> {
  const res = await fetchWithTimeout(path, {}, session);
  if (!res.ok) throw new ApiError("Unable to load this file. Please retry.", res.status);
  return res.blob();
}

export const api = {
  get: <T = unknown>(path: string, session?: string) => request<T>("GET", path, undefined, session),
  post: <T = unknown>(path: string, body?: unknown, session?: string) =>
    request<T>("POST", path, body, session),
  patch: <T = unknown>(path: string, body?: unknown, session?: string) =>
    request<T>("PATCH", path, body, session),
  del: <T = unknown>(path: string, session?: string) =>
    request<T>("DELETE", path, undefined, session),
  upload,
  blob,
};
