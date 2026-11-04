"use client";

// Client-side auth: token persisted in localStorage, current user hydrated via /auth/me.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api, ApiError } from "./api";

export type AuthUser = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: "USER" | "ADMIN";
};

type AuthResult = { user: AuthUser; token: string };
type SignupInput = { name: string; email?: string; phone?: string; password: string };

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  sessionError: boolean;
  retrySession: () => void;
  login: (identifier: string, password: string) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => void;
};

const TOKEN_KEY = "oosta_token";
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retrySession = useCallback(() => {
    setLoading(true);
    setSessionError(false);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      queueMicrotask(() => setLoading(false));
      return;
    }
    let active = true;
    const isCurrent = () => active && window.localStorage.getItem(TOKEN_KEY) === stored;
    queueMicrotask(() => {
      if (isCurrent()) setToken(stored);
    });
    api
      .get<{ user: AuthUser }>("/auth/me", stored)
      .then((data) => {
        if (isCurrent()) setUser(data.user);
      })
      .catch((error: unknown) => {
        if (!isCurrent()) return;
        if (error instanceof ApiError && error.status === 401) {
          window.localStorage.removeItem(TOKEN_KEY);
          setToken(null);
        } else {
          setSessionError(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  useEffect(() => {
    const invalidate = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== window.localStorage.getItem(TOKEN_KEY)) return;
      window.localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setUser(null);
      setSessionError(false);
    };
    window.addEventListener("oosta:unauthorized", invalidate);
    return () => window.removeEventListener("oosta:unauthorized", invalidate);
  }, []);

  const persist = useCallback((result: AuthResult) => {
    window.localStorage.setItem(TOKEN_KEY, result.token);
    setToken(result.token);
    setUser(result.user);
    setSessionError(false);
  }, []);

  const login = useCallback(
    async (identifier: string, password: string) => {
      persist(await api.post<AuthResult>("/auth/login", { identifier, password }));
    },
    [persist],
  );

  const signup = useCallback(
    async (input: SignupInput) => {
      persist(await api.post<AuthResult>("/auth/signup", input));
    },
    [persist],
  );

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, sessionError, retrySession, login, signup, logout }),
    [user, token, loading, sessionError, retrySession, login, signup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
