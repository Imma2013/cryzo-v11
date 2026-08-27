"use client";

import { use, useState, useCallback, useEffect } from "react";
import { Panel, Group, Separator } from "react-resizable-panels";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { ChatArea } from "@/components/ChatArea";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import { CryzoLogo } from "@/components/CryzoLogo";
import type { ElementInfo } from "@/components/workspace/LivePreview";
import { Id } from "../../../../convex/_generated/dataModel";
import { MessageSquareText, X } from "lucide-react";

export default function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = use(params);
  const id = conversationId as Id<"conversations">;
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [selectedElement, setSelectedElement] = useState<ElementInfo | null>(null);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const artifacts = useQuery(api.artifacts.listByConversation, {
    conversationId: id,
  });

  const hasArtifacts = !!artifacts?.length;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    setWorkspaceOpen(false);
    setSelectedElement(null);
    setMobileChatOpen(false);
  }, [id]);

  useEffect(() => {
    if (hasArtifacts) {
      setWorkspaceOpen(true);
    }
  }, [hasArtifacts]);

  const handleElementSelected = useCallback((info: ElementInfo) => {
    setSelectedElement(info);
    if (window.matchMedia("(max-width: 767px)").matches) {
      setMobileChatOpen(true);
    }
  }, []);

  if (isMobile) {
    if (!hasArtifacts) {
      return (
        <div className="h-full bg-black">
          <ChatArea
            conversationId={id}
            onArtifactCreated={() => setWorkspaceOpen(true)}
            selectedElement={selectedElement}
            onElementUsed={() => setSelectedElement(null)}
          />
        </div>
      );
    }

    return (
      <div className="relative flex h-full flex-col overflow-hidden bg-[#f7f7f5] text-zinc-950">
        <div className="min-h-0 flex-1 p-2 pb-24">
          <WorkspacePanel
            conversationId={id}
            onElementSelected={handleElementSelected}
            mobile
          />
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex justify-center px-3">
          <div className="pointer-events-auto flex w-full max-w-[430px] overflow-hidden rounded-2xl bg-black text-white shadow-2xl shadow-black/25 ring-1 ring-black/10">
            <a
              href="/"
              className="flex min-w-0 flex-1 items-center gap-2 border-r border-white/15 px-4 py-3 text-sm font-medium"
            >
              <CryzoLogo size={24} />
              <span className="truncate">Built with <strong>Cryzo</strong></span>
            </a>
            <button
              type="button"
              onClick={() => setMobileChatOpen(true)}
              className="flex items-center gap-2 px-4 py-3 text-sm font-medium"
            >
              <MessageSquareText size={17} />
              Chat to Edit
            </button>
          </div>
        </div>

        {mobileChatOpen && (
          <div className="absolute inset-0 z-50 bg-black/45 backdrop-blur-[2px]">
            <div className="absolute inset-x-0 bottom-0 flex max-h-[88%] min-h-[62%] flex-col overflow-hidden rounded-t-[28px] bg-black shadow-2xl">
              <div className="flex h-16 shrink-0 items-center gap-3 border-b border-zinc-800 px-4">
                <CryzoLogo size={28} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white">Chat to Edit</div>
                  <div className="text-xs text-zinc-500">Tell Cryzo what to change</div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileChatOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-zinc-400 hover:text-white"
                  aria-label="Close chat"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="min-h-0 flex-1">
                <ChatArea
                  conversationId={id}
                  onArtifactCreated={() => setWorkspaceOpen(true)}
                  selectedElement={selectedElement}
                  onElementUsed={() => setSelectedElement(null)}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

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
          <Separator className="w-1 cursor-col-resize bg-zinc-800 hover:bg-zinc-600" />
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
