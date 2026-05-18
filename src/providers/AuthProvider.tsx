"use client";

import { createContext, useContext, ReactNode } from "react";
import { useConvexAuth, useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

interface AuthContextType {
  user: { _id: Id<"users">; name?: string; email?: string } | null | undefined;
  userId: Id<"users"> | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (provider: string, params?: Record<string, any>) => Promise<any>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const user = useQuery(api.users.currentUser);

  const value: AuthContextType = {
    user: user ?? null,
    userId: user?._id ?? null,
    isAuthenticated,
    isLoading,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
