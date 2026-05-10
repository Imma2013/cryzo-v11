import type { ArtifactAction, ParsedArtifact } from "./types";

const ARTIFACT_TAG = "cryzoArtifact";
const ACTION_TAG = "cryzoAction";

function extractAttr(tag: string, name: string): string {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`));
  return match?.[1] ?? "";
}

export function parseArtifacts(text: string): {
  cleanText: string;
  artifacts: ParsedArtifact[];
} {
  const artifacts: ParsedArtifact[] = [];

  // Find artifact boundaries using a more robust approach
  // that handles nested angle brackets in file content
  const openPattern = new RegExp(`<${ARTIFACT_TAG}([^>]*)>`, "g");
  const closeTag = `</${ARTIFACT_TAG}>`;

  let cleanText = "";
  let lastEnd = 0;
  let match: RegExpExecArray | null;

  while ((match = openPattern.exec(text)) !== null) {
    const artifactStart = match.index;
    const attrs = match[1];
    const bodyStart = match.index + match[0].length;

    // Find the closing tag — must handle nested content
    const closeIdx = text.indexOf(closeTag, bodyStart);
    if (closeIdx === -1) break;

    // Add text before this artifact to cleanText
    cleanText += text.slice(lastEnd, artifactStart);

    const artifactId = extractAttr(attrs, "id") || `artifact-${artifacts.length}`;
    const title = extractAttr(attrs, "title") || "Untitled Project";

    const body = text.slice(bodyStart, closeIdx);
    const actions = parseActions(body);

    if (actions.length > 0) {
      artifacts.push({ id: artifactId, title, actions });
    }

    lastEnd = closeIdx + closeTag.length;
    openPattern.lastIndex = lastEnd;
  }

  cleanText += text.slice(lastEnd);
  return { cleanText: cleanText.trim(), artifacts };
}

function parseActions(body: string): ArtifactAction[] {
  const actions: ArtifactAction[] = [];
  const openPattern = new RegExp(`<${ACTION_TAG}([^>]*)>`, "g");
  const closeTag = `</${ACTION_TAG}>`;

  let match: RegExpExecArray | null;

  while ((match = openPattern.exec(body)) !== null) {
    const attrs = match[1];
    const contentStart = match.index + match[0].length;

    // Find closing tag — scan forward carefully
    const closeIdx = body.indexOf(closeTag, contentStart);
    if (closeIdx === -1) break;

    const type = extractAttr(attrs, "type") as ArtifactAction["type"];
    const filePath = extractAttr(attrs, "filePath") || undefined;
    const content = body.slice(contentStart, closeIdx);

    if (type && content) {
      actions.push({ type, filePath, content });
    }

    openPattern.lastIndex = closeIdx + closeTag.length;
  }

  return actions;
}
