"use client";

// Client-side auth state. The session itself is an httpOnly cookie set by the API,
// so no script on the page can read the JWT. The current user is hydrated via /auth/me.
//
// `token` identifies the session generation, rather than carrying an authentication credential.
// that components already use to gate authenticated requests and that api.ts uses to
// tell which session a 401 belonged to. The cookie is what authenticates.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { api, ApiError } from "./api";

export type AuthUser = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: "USER" | "ADMIN";
  recoveryEmailVerified?: boolean;
};

type AuthResult = { user: AuthUser };
type SignupInput = { name: string; email?: string; phone?: string; password: string };

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  sessionError: boolean;
  retrySession: () => void;
  login: (identifier: string, password: string) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
};

// Older builds kept a readable JWT here; it is removed on load and never written again.
const LEGACY_TOKEN_KEY = "oosta_token";
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const generation = useRef(0);
  const activeMarker = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const acceptUser = useCallback((next: AuthUser | null) => {
    generation.current++;
    const marker = next ? `session:${next.id}:${generation.current}` : null;
    activeMarker.current = marker;
    setUser(next);
    setToken(marker);
    setLoading(false);
    setSessionError(false);
  }, []);
  const retrySession = useCallback(() => {
    setLoading(true);
    setSessionError(false);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.removeItem(LEGACY_TOKEN_KEY);
    } catch {
      // Storage may be unavailable (private mode); nothing to clean up then.
    }
    let active = true;
    const startedAt = generation.current;
    const isCurrent = () => active && generation.current === startedAt;
    api
      .get<{ user: AuthUser }>("/auth/me")
      .then((data) => {
        if (isCurrent()) acceptUser(data.user);
      })
      .catch((error: unknown) => {
        if (!isCurrent()) return;
        if (error instanceof ApiError && error.status === 401) acceptUser(null);
        else setSessionError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt, acceptUser]);

  useEffect(() => {
    const invalidate = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail === activeMarker.current) acceptUser(null);
    };
    window.addEventListener("oosta:unauthorized", invalidate);
    return () => window.removeEventListener("oosta:unauthorized", invalidate);
  }, [acceptUser]);

  const accept = useCallback(
    (result: AuthResult) => {
      acceptUser(result.user);
    },
    [acceptUser],
  );

  const login = useCallback(
    async (identifier: string, password: string) => {
      accept(await api.post<AuthResult>("/auth/login", { identifier, password }));
    },
    [accept],
  );

  const signup = useCallback(
    async (input: SignupInput) => {
      accept(await api.post<AuthResult>("/auth/signup", input));
    },
    [accept],
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      accept(
        await api.post<AuthResult>(
          "/auth/change-password",
          { currentPassword, newPassword },
          token ?? undefined,
        ),
      );
    },
    [accept, token],
  );

  const logout = useCallback(async () => {
    await api.post("/auth/logout");
    acceptUser(null);
  }, [acceptUser]);

  const logoutAll = useCallback(async () => {
    await api.post("/auth/logout-all", undefined, token ?? undefined);
    acceptUser(null);
  }, [token, acceptUser]);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      sessionError,
      retrySession,
      login,
      signup,
      logout,
      logoutAll,
      changePassword,
    }),
    [
      user,
      token,
      loading,
      sessionError,
      retrySession,
      login,
      signup,
      logout,
      logoutAll,
      changePassword,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
