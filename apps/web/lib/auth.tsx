"use client";

// Client-side auth. The session is an httpOnly cookie set by the API (scripts on
// the page can't read it, so an XSS bug can't steal it); the current user is
// hydrated via /auth/session. `token` is COOKIE_SESSION while signed in — a marker
// the api client understands, kept so callers can pass it straight through.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api, COOKIE_SESSION } from "./api";

export type AuthUser = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: "USER" | "ADMIN";
};

type AuthResult = { user: AuthUser };
type SignupInput = { name: string; email?: string; phone?: string; password: string };

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => void;
  updateName: (name: string) => Promise<void>;
};

// Pre-cookie builds kept the JWT here; it is removed on load and never read.
const LEGACY_TOKEN_KEY = "oosta_token";
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      window.localStorage.removeItem(LEGACY_TOKEN_KEY);
    } catch {
      // storage unavailable (private mode) — nothing to clean up
    }
    api
      .get<{ user: AuthUser | null }>("/auth/session")
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const result = await api.post<AuthResult>("/auth/login", { identifier, password });
    setUser(result.user);
  }, []);

  const signup = useCallback(async (input: SignupInput) => {
    const result = await api.post<AuthResult>("/auth/signup", input);
    setUser(result.user);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    void api.post("/auth/logout").catch(() => {});
  }, []);

  const updateName = useCallback(async (name: string) => {
    const result = await api.patch<AuthResult>("/auth/me", { name }, COOKIE_SESSION);
    setUser(result.user);
  }, []);

  const token = user ? COOKIE_SESSION : null;
  const value = useMemo(
    () => ({ user, token, loading, login, signup, logout, updateName }),
    [user, token, loading, login, signup, logout, updateName],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
