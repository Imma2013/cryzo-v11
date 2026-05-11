"use client";

import type { FileUIPart } from "ai";
import type { ChatMode } from "@/components/ChatInput";

export type InitialChatMessage = {
  conversationId: string;
  text: string;
  chatMode: ChatMode;
  files: FileUIPart[];
};

let pendingInitialChatMessage: InitialChatMessage | null = null;

export function saveInitialChatMessage(message: InitialChatMessage) {
  pendingInitialChatMessage = message;
}

export function takeInitialChatMessage(conversationId: string) {
  if (pendingInitialChatMessage?.conversationId !== conversationId) return null;

  const message = pendingInitialChatMessage;
  pendingInitialChatMessage = null;
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
