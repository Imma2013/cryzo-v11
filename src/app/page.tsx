"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.push("/chat");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <div className="text-zinc-400">Loading...</div>
    </div>
  );
}
