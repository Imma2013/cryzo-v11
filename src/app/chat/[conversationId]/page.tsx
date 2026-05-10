"use client";

import { use, useState, useCallback } from "react";
import { Panel, Group, Separator } from "react-resizable-panels";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { ChatArea } from "@/components/ChatArea";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import type { ElementInfo } from "@/components/workspace/LivePreview";
import { Id } from "../../../../convex/_generated/dataModel";

export default function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = use(params);
  const id = conversationId as Id<"conversations">;
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [selectedElement, setSelectedElement] = useState<ElementInfo | null>(null);

  const artifacts = useQuery(api.artifacts.listByConversation, {
    conversationId: id,
  });

  const hasArtifacts = artifacts && artifacts.length > 0;

  if (hasArtifacts && !workspaceOpen) {
    setWorkspaceOpen(true);
  }

  const handleElementSelected = useCallback((info: ElementInfo) => {
    setSelectedElement(info);
  }, []);

  if (!workspaceOpen) {
    return <ChatArea conversationId={id} onArtifactCreated={() => setWorkspaceOpen(true)} />;
  }

  return (
    <Group orientation="horizontal" className="h-full">
      <Panel defaultSize={35} minSize={20}>
        <ChatArea
          conversationId={id}
          onArtifactCreated={() => setWorkspaceOpen(true)}
          selectedElement={selectedElement}
          onElementUsed={() => setSelectedElement(null)}
        />
      </Panel>
      <Separator className="w-1 bg-zinc-800 hover:bg-zinc-600 cursor-col-resize" />
      <Panel defaultSize={65} minSize={30}>
        <div className="h-full p-1">
          <WorkspacePanel conversationId={id} onElementSelected={handleElementSelected} />
        </div>
      </Panel>
    </Group>
  );
}
