"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getUser, clearSession, loginUrl, type User } from "@/lib/auth";
import api from "@/lib/api";
import { dropPush, syncPush } from "@/lib/webPush";
import { startOffline } from "@/lib/offline";
import { discardAllQueued, listOutbox } from "@/lib/offlineOutbox";
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
      router.replace(loginUrl());
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

  // Keeps this browser's notifications attached to the current sign-in, or
  // removes them if they were turned on by somebody else (lib/webPush.ts).
  useEffect(() => {
    if (user && !user.mustChangePassword) {
      startOffline(user.id);
      void syncPush(user.id);
    }
  }, [user]);

  // Ends the session on the server first, so the token stops working rather
  // than only being forgotten here. Best effort: an unreachable API must not
  // keep somebody signed in on a shared computer, so the local session goes
  // regardless.
  async function logout() {
    // Rounds saved on this phone and not sent yet would be lost with the
    // session; say so first (lib/offlineOutbox.ts).
    if (user) {
      const pending = await listOutbox(user.id);
      if (pending.length) {
        const ok = window.confirm(
          `${pending.length} checklist round${pending.length === 1 ? " is" : "s are"} saved on this phone and not sent yet. ` +
          "Signing out deletes them. Sign out anyway?",
        );
        if (!ok) return;
        await discardAllQueued(user.id);
      }
    }
    // While the token still works, so the server row goes too. Capped at a
    // couple of seconds: notifications must never hold up signing out.
    await dropPush();
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
