"use client";

import { useAuth } from "@/providers/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { firebaseUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [firebaseUser, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="text-zinc-400">Loading...</div>
      </div>
    );
  }

  if (!firebaseUser) return null;

  return <div className="h-screen bg-black">{children}</div>;
}
