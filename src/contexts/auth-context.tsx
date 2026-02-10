"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { Role } from "@prisma/client";

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
}

interface PartnerAccessInfo {
  partnerId: string;
  businessIds: string[];
  contentPermissions: Record<string, string[]>;
  editableBusinessIds: string[];
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  partnerAccess: PartnerAccessInfo | null;
  hasContentAccess: (contentType: string) => boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  partnerAccess: null,
  hasContentAccess: () => true,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [partnerAccess, setPartnerAccess] = useState<PartnerAccessInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
          setPartnerAccess(data.partnerAccess || null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const hasContentAccess = useCallback(
    (contentType: string): boolean => {
      if (!user) return false;
      // 非パートナーは全アクセス可
      if (user.role !== "PARTNER") return true;
      if (!partnerAccess) return false;
      const perms = partnerAccess.contentPermissions[contentType];
      return Array.isArray(perms) && perms.length > 0;
    },
    [user, partnerAccess],
  );

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
    setPartnerAccess(null);
    window.location.href = "/login";
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, partnerAccess, hasContentAccess, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
