"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "./api";

type State<T> = { data: T | null; error: ApiError | null; loading: boolean };

// Fetch a GET endpoint on mount. Pass `path = null` to skip (e.g. while inputs aren't ready).
// `refreshMs` re-fetches silently on an interval (keeps showing the current data,
// pauses while the tab is hidden) — e.g. to follow an order awaiting review.
export function useApi<T>(
  path: string | null,
  token?: string,
  options: { refreshMs?: number } = {},
): State<T> {
  const [state, setState] = useState<State<T>>({
    data: null,
    error: null,
    loading: path !== null,
  });
  const { refreshMs } = options;

  useEffect(() => {
    if (path === null) {
      queueMicrotask(() => setState({ data: null, error: null, loading: false }));
      return;
    }
    let active = true;
    queueMicrotask(() => {
      if (active) setState({ data: null, error: null, loading: true });
    });
    api
      .get<T>(path, token)
      .then((data) => {
        if (active) setState({ data, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (active) {
          const apiError = error instanceof ApiError ? error : new ApiError("Request failed", 0);
          setState({ data: null, error: apiError, loading: false });
        }
      });

    const timer = refreshMs
      ? setInterval(() => {
          if (document.visibilityState !== "visible") return;
          api
            .get<T>(path, token)
            .then((data) => {
              if (active) setState({ data, error: null, loading: false });
            })
            .catch(() => {
              // keep showing the last good data; the next tick retries
            });
        }, refreshMs)
      : undefined;

    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [path, token, refreshMs]);

  return state;
}
