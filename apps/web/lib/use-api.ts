"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api";

type State<T> = { data: T | null; error: ApiError | null; loading: boolean };

// Fetch a GET endpoint on mount. Pass `path = null` to skip (e.g. while inputs aren't ready).
export function useApi<T>(path: string | null, token?: string): State<T> & { refetch: () => void } {
  const [attempt, setAttempt] = useState(0);
  const refetch = useCallback(() => setAttempt((value) => value + 1), []);
  const [state, setState] = useState<State<T>>({
    data: null,
    error: null,
    loading: path !== null,
  });

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
    return () => {
      active = false;
    };
  }, [path, token, attempt]);

  return { ...state, refetch };
}
