"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getUser, clearSession, type User } from "@/lib/auth";
import api from "@/lib/api";
import { canAccessRoute, ROLE_HOME } from "@/lib/rbac";

type AuthContextType = {
  user: User | null;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({ user: null, logout: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  // The session lives in localStorage, which the server render cannot read, so
  // it is picked up after mount — from a microtask, so the effect body itself
  // never sets state.
  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace("/login");
    } else {
      queueMicrotask(() => setUser(u));
    }
  }, [router]);

  // Route-level RBAC: bounce users away from pages their role can't reach,
  // including via direct URL navigation. Re-runs on every path change.
  useEffect(() => {
    if (!user) return;
    if (user.mustChangePassword) {
      router.replace("/change-password");
      return;
    }
    if (!canAccessRoute(user.role, pathname)) {
      router.replace(ROLE_HOME[user.role]);
    }
  }, [user, pathname, router]);

  // Ends the session on the server first, so the token stops working rather
  // than only being forgotten here. Best effort: an unreachable API must not
  // keep somebody signed in on a shared computer, so the local session goes
  // regardless.
  async function logout() {
    try {
      await api.post("/me/sign-out");
    } catch {
      // already ended, or offline — signed out here either way
    }
    clearSession();
    router.replace("/login");
  }

  if (!user || user.mustChangePassword) return null;
  // Don't flash protected content while the redirect above is in flight.
  if (!canAccessRoute(user.role, pathname)) return null;

  return (
    <AuthContext.Provider value={{ user, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
