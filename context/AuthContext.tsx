"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUser, clearSession, type User } from "@/lib/auth";

type AuthContextType = {
  user: User | null;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType>({ user: null, logout: () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace("/login");
    } else {
      setUser(u);
    }
  }, []);

  function logout() {
    clearSession();
    router.replace("/login");
  }

  if (!user) return null;

  return (
    <AuthContext.Provider value={{ user, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
