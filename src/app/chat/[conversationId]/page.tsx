"use client";

import { use, useState } from "react";
import { Panel, Group, Separator } from "react-resizable-panels";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { ChatArea } from "@/components/ChatArea";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import { Id } from "../../../../convex/_generated/dataModel";

export default function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = use(params);
  const id = conversationId as Id<"conversations">;
  const [workspaceOpen, setWorkspaceOpen] = useState(false);

  const artifacts = useQuery(api.artifacts.listByConversation, {
    conversationId: id,
  });

  const hasArtifacts = artifacts && artifacts.length > 0;

  // Auto-open workspace when artifacts appear
  if (hasArtifacts && !workspaceOpen) {
    setWorkspaceOpen(true);
  }

  if (!workspaceOpen) {
    return <ChatArea conversationId={id} onArtifactCreated={() => setWorkspaceOpen(true)} />;
  }

  return (
    <Group orientation="horizontal" className="h-full">
      <Panel defaultSize={40} minSize={25}>
        <ChatArea conversationId={id} onArtifactCreated={() => setWorkspaceOpen(true)} />
      </Panel>
      <Separator className="w-1 bg-zinc-800 hover:bg-zinc-600 cursor-col-resize" />
      <Panel defaultSize={60} minSize={30}>
        <div className="h-full p-1">
          <WorkspacePanel conversationId={id} />
        </div>
      </Panel>
    </Group>
  );
}
