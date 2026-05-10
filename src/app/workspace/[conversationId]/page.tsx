"use client";

import { use } from "react";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { Id } from "../../../../convex/_generated/dataModel";

export default function WorkspacePage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = use(params);
  return (
    <WorkspaceShell
      conversationId={conversationId as Id<"conversations">}
    />
  );
}
