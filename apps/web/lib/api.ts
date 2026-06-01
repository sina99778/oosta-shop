// Typed fetch client for the backend API. Usable from client and server components.

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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

export const api = {
  get: <T = unknown>(path: string, token?: string) => request<T>("GET", path, undefined, token),
  post: <T = unknown>(path: string, body?: unknown, token?: string) =>
    request<T>("POST", path, body, token),
  patch: <T = unknown>(path: string, body?: unknown, token?: string) =>
    request<T>("PATCH", path, body, token),
  del: <T = unknown>(path: string, token?: string) => request<T>("DELETE", path, undefined, token),
};
