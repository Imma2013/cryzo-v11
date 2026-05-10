"use client";

import { use, useState, useCallback, useEffect } from "react";
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

  // Reset workspace state when conversation changes
  useEffect(() => {
    setWorkspaceOpen(false);
    setSelectedElement(null);
  }, [id]);

  // Auto-open workspace when artifacts appear for THIS conversation
  useEffect(() => {
    if (hasArtifacts) {
      setWorkspaceOpen(true);
    }
  }, [hasArtifacts]);

  const handleElementSelected = useCallback((info: ElementInfo) => {
    setSelectedElement(info);
  }, []);

  // Always render the split layout to prevent ChatArea from remounting
  // (remounting loses in-memory messages from useChat)
  return (
    <Group orientation="horizontal" className="h-full">
      <Panel defaultSize={workspaceOpen ? 35 : 100} minSize={20}>
        <ChatArea
          conversationId={id}
          onArtifactCreated={() => setWorkspaceOpen(true)}
          selectedElement={selectedElement}
          onElementUsed={() => setSelectedElement(null)}
        />
      </Panel>
      {workspaceOpen && (
        <>
          <Separator className="w-1 bg-zinc-800 hover:bg-zinc-600 cursor-col-resize" />
          <Panel defaultSize={65} minSize={30}>
            <div className="h-full p-1">
              <WorkspacePanel conversationId={id} onElementSelected={handleElementSelected} />
            </div>
          </Panel>
        </>
      )}
    </Group>
  );
}
