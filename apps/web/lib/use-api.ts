"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api";

type State<T> = { data: T | null; error: ApiError | null; loading: boolean };
type Result<T> = State<T> & { path: string | null; token?: string };

// Fetch a GET endpoint on mount. Pass `path = null` to skip (e.g. while inputs aren't ready).
export function useApi<T>(path: string | null, token?: string): State<T> & { refetch: () => void } {
  const [attempt, setAttempt] = useState(0);
  const refetch = useCallback(() => setAttempt((value) => value + 1), []);
  const [state, setState] = useState<Result<T>>({
    path,
    token,
    data: null,
    error: null,
    loading: path !== null,
  });

  useEffect(() => {
    let active = true;
    const identity = { path, token };
    const retainedData = (previous: Result<T>) =>
      previous.path === path && previous.token === token ? previous.data : null;
    queueMicrotask(() => {
      if (active) {
        setState((previous) => {
          const data = path === null ? null : retainedData(previous);
          return { ...identity, data, error: null, loading: path !== null && data === null };
        });
      }
    });
    if (path !== null) {
      api
        .get<T>(path, token)
        .then((data) => {
          if (active) setState({ ...identity, data, error: null, loading: false });
        })
        .catch((error: unknown) => {
          if (!active) return;
          const apiError = error instanceof ApiError ? error : new ApiError("Request failed", 0);
          const transient = apiError.status === 0 || apiError.status >= 500;
          setState((previous) => ({
            ...identity,
            data: transient ? retainedData(previous) : null,
            error: apiError,
            loading: false,
          }));
        });
    }
    return () => {
      active = false;
    };
  }, [path, token, attempt]);

  // Guard the render before the next effect runs, including account switches.
  if (path === null || state.path !== path || state.token !== token)
    return { data: null, error: null, loading: path !== null, refetch };
  return { data: state.data, error: state.error, loading: state.loading, refetch };
}
