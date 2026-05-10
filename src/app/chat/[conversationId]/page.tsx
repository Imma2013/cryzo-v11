"use client";

import { use } from "react";
import { ChatArea } from "@/components/ChatArea";
import { Id } from "../../../../convex/_generated/dataModel";

export default function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = use(params);
  return <ChatArea conversationId={conversationId as Id<"conversations">} />;
}
