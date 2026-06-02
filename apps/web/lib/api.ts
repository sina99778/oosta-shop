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

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.error ?? {};
    throw new ApiError(err.message ?? "Request failed", res.status, err.code, err.details);
  }
  return data as T;
}

// Multipart upload (e.g. card-to-card receipts). The browser sets the multipart
// boundary header automatically, so we must NOT set content-type ourselves.
async function upload<T>(path: string, form: FormData, token?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: form,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.error ?? {};
    throw new ApiError(err.message ?? "Upload failed", res.status, err.code, err.details);
  }
  return data as T;
}

// Fetch a protected binary resource (e.g. a receipt image) as a Blob.
async function blob(path: string, token?: string): Promise<Blob> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { headers, cache: "no-store" });
  if (!res.ok) throw new ApiError("Request failed", res.status);
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
