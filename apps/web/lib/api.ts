// Typed fetch client for the backend API. Usable from client and server components.

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
}): string | null {
  if (p.image) return p.image;
  if (p.hasImage) return assetUrl(`/products/${p.id}/image`);
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
  token?: string,
): Promise<Response> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      signal: AbortSignal.timeout(options.body instanceof FormData ? 60000 : 20000),
      cache: "no-store",
    });
    if (res.status === 401 && token && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("oosta:unauthorized", { detail: token }));
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
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  return readJson<T>(
    await fetchWithTimeout(
      path,
      { method, headers, body: body === undefined ? undefined : JSON.stringify(body) },
      token,
    ),
  );
}
async function upload<T>(path: string, form: FormData, token?: string): Promise<T> {
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
  return readJson<T>(
    await fetchWithTimeout(
      path,
      { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body: form },
      token,
    ),
  );
}
async function blob(path: string, token?: string): Promise<Blob> {
  const res = await fetchWithTimeout(
    path,
    { headers: token ? { authorization: `Bearer ${token}` } : {} },
    token,
  );
  if (!res.ok) throw new ApiError("Unable to load this file. Please retry.", res.status);
  return res.blob();
}

export const api = {
  get: <T = unknown>(path: string, token?: string) => request<T>("GET", path, undefined, token),
  post: <T = unknown>(path: string, body?: unknown, token?: string) =>
    request<T>("POST", path, body, token),
  patch: <T = unknown>(path: string, body?: unknown, token?: string) =>
    request<T>("PATCH", path, body, token),
  del: <T = unknown>(path: string, token?: string) => request<T>("DELETE", path, undefined, token),
  upload,
  blob,
};
