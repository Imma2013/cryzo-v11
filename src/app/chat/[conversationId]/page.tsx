"use client";

import { use, useCallback, useEffect, useState } from "react";
import { Panel, Group, Separator } from "react-resizable-panels";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { ChatArea } from "@/components/ChatArea";
import {
  WorkspacePanel,
  type WorkspaceStatus,
} from "@/components/workspace/WorkspacePanel";
import { MobileBuilderHeader } from "@/components/MobileBuilderHeader";
import type { ElementInfo } from "@/components/workspace/LivePreview";
import { prebootStreamingRuntime } from "@/lib/workspace/streaming-runtime";
import { Id } from "../../../../convex/_generated/dataModel";

export default function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = use(params);
  const id = conversationId as Id<"conversations">;
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"chat" | "preview">("chat");
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [selectedElement, setSelectedElement] = useState<ElementInfo | null>(null);
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus>({
    isBooting: false,
    progress: null,
    previewUrl: null,
  });

  const conversation = useQuery(api.conversations.get, { id });
  const artifacts = useQuery(api.artifacts.listByConversation, {
    conversationId: id,
  });

  const hasArtifacts = !!artifacts?.length;
  const workspaceStarted = workspaceOpen || hasArtifacts;

  useEffect(() => {
    void prebootStreamingRuntime(String(id)).catch(() => {
      // Workspace state will surface an actionable error if startup fails.
    });
  }, [id]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const showChat = () => setMobileView("chat");
    window.addEventListener("cryzo:show-chat", showChat);
    return () => window.removeEventListener("cryzo:show-chat", showChat);
  }, []);

  useEffect(() => {
    setWorkspaceOpen(false);
    setMobileView("chat");
    setSelectedElement(null);
    setWorkspaceStatus({
      isBooting: false,
      progress: null,
      previewUrl: null,
    });
  }, [id]);

  useEffect(() => {
    if (hasArtifacts && isMobile === false) setWorkspaceOpen(true);
  }, [hasArtifacts, isMobile]);

  const handleElementSelected = useCallback(
    (info: ElementInfo) => {
      setSelectedElement(info);
      if (isMobile) setMobileView("chat");
    },
    [isMobile],
  );

  const handleArtifactCreated = useCallback(() => {
    setWorkspaceOpen(true);
  }, []);

  const handleWorkspaceStatus = useCallback((status: WorkspaceStatus) => {
    setWorkspaceStatus(status);
  }, []);

  const isBuilding =
    workspaceStarted &&
    (workspaceStatus.isBooting ||
      !workspaceStatus.previewUrl ||
      workspaceStatus.progress === "writing" ||
      workspaceStatus.progress === "installing" ||
      workspaceStatus.progress === "starting");

  if (isMobile === null) {
    return <div className="h-full bg-black" />;
  }

  if (isMobile) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-black">
        {mobileView === "chat" && (
          <MobileBuilderHeader
            title={conversation?.title || "Cryzo"}
            view="chat"
            canPreview={workspaceStarted}
            isBuilding={isBuilding}
            conversationId={conversationId}
            onPreview={() => setMobileView("preview")}
            onBackToChat={() => setMobileView("chat")}
          />
        )}

        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div
            className={`absolute inset-0 ${
              mobileView === "chat"
                ? "visible z-10"
                : "invisible z-0 pointer-events-none"
            }`}
          >
            <ChatArea
              conversationId={id}
              onArtifactCreated={handleArtifactCreated}
              selectedElement={selectedElement}
              onElementUsed={() => setSelectedElement(null)}
            />
          </div>

          {workspaceStarted && (
            <div
              className={`absolute inset-0 ${
                mobileView === "preview"
                  ? "visible z-10"
                  : "invisible z-0 pointer-events-none"
              }`}
            >
              <WorkspacePanel
                conversationId={id}
                onElementSelected={handleElementSelected}
                onStatusChange={handleWorkspaceStatus}
                onBackToChat={() => setMobileView("chat")}
                mobile
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <Group orientation="horizontal" className="h-full">
      <Panel defaultSize={workspaceOpen ? 35 : 100} minSize={20}>
        <ChatArea
          conversationId={id}
          onArtifactCreated={handleArtifactCreated}
          selectedElement={selectedElement}
          onElementUsed={() => setSelectedElement(null)}
        />
      </Panel>
      {workspaceOpen && (
        <>
          <Separator className="w-1 cursor-col-resize bg-zinc-800 hover:bg-zinc-600" />
          <Panel defaultSize={65} minSize={30}>
            <div className="h-full p-1">
              <WorkspacePanel
                conversationId={id}
                onElementSelected={handleElementSelected}
                onStatusChange={handleWorkspaceStatus}
              />
            </div>
          </Panel>
        </>
      )}
    </Group>
  );
}
