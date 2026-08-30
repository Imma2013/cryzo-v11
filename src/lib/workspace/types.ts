export interface ArtifactAction {
  type: "file" | "shell" | "start" | "supabase";
  filePath?: string;
  operation?: "migration" | "query";
  content: string;
}

export interface ParsedArtifact {
  id: string;
  title: string;
  actions: ArtifactAction[];
}

export interface FileEntry {
  type: "file" | "folder";
  content?: string;
}

export type FileMap = Record<string, FileEntry>;
