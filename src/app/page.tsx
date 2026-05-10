"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";

export default function Home() {
  const { firebaseUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      router.push(firebaseUser ? "/chat" : "/login");
    }
  }, [firebaseUser, loading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <div className="text-zinc-400">Loading...</div>
    </div>
  );
}
