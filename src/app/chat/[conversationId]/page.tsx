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
import { Maximize2, MessageSquareText, Minimize2, X } from "lucide-react";

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
  const [mobileChatExpanded, setMobileChatExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

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

  // Bolt.diy starts one shared WebContainer promise early and keeps it warm.
  // Do the same while the user is chatting / the model is generating so the
  // cold boot happens before package installation becomes visible.
  useEffect(() => {
    void import("@/lib/workspace/webcontainer")
      .then(({ prewarmWebContainer }) => prewarmWebContainer())
      .catch(() => {
        // useWorkspace surfaces a useful error if WebContainer really fails.
      });
  }, []);

  useEffect(() => {
    setWorkspaceOpen(false);
    setSelectedElement(null);
    setMobileChatOpen(false);
    setMobileChatExpanded(false);
  }, [id]);

  useEffect(() => {
    if (hasArtifacts) {
      setWorkspaceOpen(true);
    }
  }, [hasArtifacts]);

  const closeMobileChat = useCallback(() => {
    setMobileChatOpen(false);
    setMobileChatExpanded(false);
  }, []);

  const handleElementSelected = useCallback((info: ElementInfo) => {
    setSelectedElement(info);
    if (window.matchMedia("(max-width: 767px)").matches) {
      setMobileChatOpen(true);
    }
  }, []);

  // Do not briefly mount the desktop WorkspacePanel on an iPhone before the
  // media query effect runs. That old false-first render could start an npm
  // install, immediately unmount it, tear down WebContainer, then cold boot a
  // second mobile workspace.
  if (isMobile === null) {
    return <div className="h-full bg-black" />;
  }

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
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-white text-zinc-950">
        <div className="min-h-0 flex-1 overflow-hidden">
          <WorkspacePanel
            conversationId={id}
            onElementSelected={handleElementSelected}
            mobile
          />
        </div>

        {!mobileChatOpen && (
          <button
            type="button"
            onClick={() => setMobileChatOpen(true)}
            className="absolute bottom-4 right-4 z-30 inline-flex h-12 items-center gap-2 rounded-2xl bg-black px-5 text-sm font-medium text-white shadow-2xl shadow-black/25 ring-1 ring-white/10"
          >
            <MessageSquareText size={18} />
            Chat to Edit
          </button>
        )}

        {mobileChatOpen && (
          <div className="absolute inset-0 z-50 bg-black/45 backdrop-blur-[2px]">
            <section
              className={`absolute inset-x-0 bottom-0 flex min-h-0 flex-col overflow-hidden bg-[#f8f7f4] text-zinc-950 shadow-2xl transition-[top,border-radius] duration-200 ${
                mobileChatExpanded
                  ? "top-0 rounded-none"
                  : "top-3 rounded-t-[28px]"
              }`}
              role="dialog"
              aria-modal="true"
              aria-label="Chat to Edit"
            >
              <div className="flex h-16 shrink-0 items-center gap-3 border-b border-zinc-200 bg-[#f8f7f4] px-4">
                <CryzoLogo size={30} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-semibold text-zinc-950">Chat to Edit</div>
                  <div className="truncate text-xs text-zinc-500">Tell Cryzo what to change</div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileChatExpanded((value) => !value)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-200/70 hover:text-zinc-950"
                  aria-label={mobileChatExpanded ? "Restore chat sheet" : "Expand chat sheet"}
                >
                  {mobileChatExpanded ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                </button>
                <button
                  type="button"
                  onClick={closeMobileChat}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-200/70 hover:text-zinc-950"
                  aria-label="Close chat"
                >
                  <X size={22} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <ChatArea
                  conversationId={id}
                  onArtifactCreated={() => setWorkspaceOpen(true)}
                  selectedElement={selectedElement}
                  onElementUsed={() => setSelectedElement(null)}
                  appearance="light"
                />
              </div>
            </section>
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
