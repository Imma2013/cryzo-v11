import type { FileMap } from "./types";

/** The mobile publishing API requires SourceFile[], not the Vivari FileMap. */
export function mobileSourceFiles(files: FileMap): Array<{ path: string; content: string }> {
  return Object.entries(files)
    .filter(([, entry]) => entry.type === "file" && typeof entry.content === "string")
    .map(([path, entry]) => ({ path, content: entry.content! }));
}
