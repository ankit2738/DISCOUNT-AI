"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { apiFetch, TOKEN_KEY } from "@/lib/api";
import type { User } from "@/lib/types";

type AuthContextValue = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (email: string, password: string, fullName: string) => Promise<{ user: User; demoVerificationToken?: string }>;
  logout: () => void;
  refresh: () => Promise<void>;
  setToken: (token: string) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const persist = useCallback((nextToken: string, nextUser: User) => {
    localStorage.setItem(TOKEN_KEY, nextToken);
    setTokenState(nextToken);
    setUser(nextUser);
  }, []);

  const refresh = useCallback(async () => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (!saved) {
      setTokenState(null);
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const current = await apiFetch<User>("/api/auth/me", { token: saved });
      setTokenState(saved);
      setUser(current);
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setTokenState(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await apiFetch<{ access_token: string; user: User }>("/api/auth/login", {
        method: "POST",
        body: { email, password },
      });
      persist(response.access_token, response.user);
      return response.user;
    },
    [persist],
  );

  const register = useCallback(
    async (email: string, password: string, fullName: string) => {
      const response = await apiFetch<{
        access_token: string;
        user: User;
        demo_verification_token?: string;
      }>("/api/auth/register", {
        method: "POST",
        body: { email, password, full_name: fullName },
      });
      persist(response.access_token, response.user);
      return { user: response.user, demoVerificationToken: response.demo_verification_token };
    },
    [persist],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setTokenState(null);
    setUser(null);
  }, []);

  const setToken = useCallback((nextToken: string) => {
    setTokenState(nextToken);
    localStorage.setItem(TOKEN_KEY, nextToken);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, refresh, setToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
