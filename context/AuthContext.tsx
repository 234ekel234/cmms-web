"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getUser, clearSession, type User } from "@/lib/auth";
import { canAccessRoute, ROLE_HOME } from "@/lib/rbac";

type AuthContextType = {
  user: User | null;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType>({ user: null, logout: () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace("/login");
    } else {
      setUser(u);
    }
  }, []);

  // Route-level RBAC: bounce users away from pages their role can't reach,
  // including via direct URL navigation. Re-runs on every path change.
  useEffect(() => {
    if (!user) return;
    if (!canAccessRoute(user.role, pathname)) {
      router.replace(ROLE_HOME[user.role]);
    }
  }, [user, pathname, router]);

  function logout() {
    clearSession();
    router.replace("/login");
  }

  if (!user) return null;
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
