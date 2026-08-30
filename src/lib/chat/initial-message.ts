"use client";

import type { FileUIPart } from "ai";
import type { ChatMode } from "@/components/ChatInput";
import type { ProjectPlatform } from "@/lib/project-platform";

export type InitialChatMessage = {
  conversationId: string;
  text: string;
  chatMode: ChatMode;
  files: FileUIPart[];
};

export type PendingAuthChatMessage = Omit<InitialChatMessage, "conversationId"> & {
  projectPlatforms?: ProjectPlatform[];
};

let pendingInitialChatMessage: InitialChatMessage | null = null;
let pendingAuthChatMessage: PendingAuthChatMessage | null = null;

export function saveInitialChatMessage(message: InitialChatMessage) {
  pendingInitialChatMessage = message;
}

export function takeInitialChatMessage(conversationId: string) {
  if (pendingInitialChatMessage?.conversationId !== conversationId) return null;

  const message = pendingInitialChatMessage;
  pendingInitialChatMessage = null;
  return message;
}

export function savePendingAuthChatMessage(message: PendingAuthChatMessage) {
  pendingAuthChatMessage = message;
}

export function takePendingAuthChatMessage() {
  const message = pendingAuthChatMessage;
  pendingAuthChatMessage = null;
  return message;
}

export async function filesToUIParts(files: File[]): Promise<FileUIPart[]> {
  return Promise.all(
    files.map(
      (file) =>
        new Promise<FileUIPart>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve({
              type: "file",
              mediaType: file.type || "application/octet-stream",
              filename: file.name,
              url: String(reader.result),
            });
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        }),
    ),
  );
}
