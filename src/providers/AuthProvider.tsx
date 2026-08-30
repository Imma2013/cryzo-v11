"use client";

import { createContext, useContext, ReactNode } from "react";
import {
  useConvexAuth,
  useAuthActions,
  useAuthToken,
} from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { setStreamingRuntimeAuthToken } from "@/lib/workspace/streaming-runtime";

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
  const authToken = useAuthToken();
  const user = useQuery(api.users.currentUser);

  // The sandbox runtime is a browser-side module singleton. Keep its bearer token
  // synchronized during render instead of waiting for a passive effect. This is
  // important when a user signs out and immediately signs into another account:
  // child workspace effects must never get a chance to send the previous account's
  // token to /api/sandbox/*.
  setStreamingRuntimeAuthToken(authToken ?? null);

  const safeSignOut = async () => {
    // Clear the runtime credential before Convex starts the sign-out transition so
    // queued preview work cannot race with the old session.
    setStreamingRuntimeAuthToken(null);
    await signOut();
  };

  const value: AuthContextType = {
    user: user ?? null,
    userId: user?._id ?? null,
    isAuthenticated,
    isLoading,
    signIn,
    signOut: safeSignOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
