"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  auth,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User,
} from "@/lib/firebase";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

interface AuthContextType {
  firebaseUser: User | null;
  convexUserId: Id<"users"> | null;
  userId: Id<"users"> | null;
  loading: boolean;
  isLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [convexUserId, setConvexUserId] = useState<Id<"users"> | null>(null);
  const [loading, setLoading] = useState(true);

  const getOrCreateUser = useMutation(api.users.getOrCreate);
  const convexUser = useQuery(
    api.users.getByEmail,
    firebaseUser?.email ? { email: firebaseUser.email } : "skip"
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        const userId = await getOrCreateUser({
          email: user.email || "",
          name: user.displayName || user.email || "User",
        });
        setConvexUserId(userId);
      } else {
        // TEST MODE: create a test user when no Firebase auth
        const userId = await getOrCreateUser({
          email: "test@cryzo.dev",
          name: "Test User",
        });
        setConvexUserId(userId);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [getOrCreateUser]);

  useEffect(() => {
    if (convexUser) {
      setConvexUserId(convexUser._id);
    }
  }, [convexUser]);

  const handleSignInWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const handleSignInWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const handleSignUpWithEmail = async (email: string, password: string) => {
    await createUserWithEmailAndPassword(auth, email, password);
  };

  const handleLogout = async () => {
    await signOut(auth);
    setConvexUserId(null);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        convexUserId,
        userId: convexUserId,
        loading,
        isLoading: loading,
        signInWithGoogle: handleSignInWithGoogle,
        signInWithEmail: handleSignInWithEmail,
        signUpWithEmail: handleSignUpWithEmail,
        logout: handleLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
