import type { ArtifactAction, ParsedArtifact } from "./types";

const ARTIFACT_OPEN = "<cryzoArtifact";
const ARTIFACT_CLOSE = "</cryzoArtifact>";
const ACTION_OPEN = "<cryzoAction";
const ACTION_CLOSE = "</cryzoAction>";

function extractAttr(tag: string, name: string): string {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`));
  return match?.[1] ?? "";
}

export function parseArtifacts(text: string): {
  cleanText: string;
  artifacts: ParsedArtifact[];
} {
  const artifacts: ParsedArtifact[] = [];
  let cleanText = "";
  let pos = 0;

  while (pos < text.length) {
    const artifactStart = text.indexOf(ARTIFACT_OPEN, pos);
    if (artifactStart === -1) {
      cleanText += text.slice(pos);
      break;
    }

    cleanText += text.slice(pos, artifactStart);

    const tagEnd = text.indexOf(">", artifactStart);
    if (tagEnd === -1) break;

    const openTag = text.slice(artifactStart, tagEnd + 1);
    const artifactId = extractAttr(openTag, "id") || `artifact-${artifacts.length}`;
    const title = extractAttr(openTag, "title") || "Untitled";

    const artifactEnd = text.indexOf(ARTIFACT_CLOSE, tagEnd);
    if (artifactEnd === -1) break;

    const artifactBody = text.slice(tagEnd + 1, artifactEnd);
    const actions = parseActions(artifactBody);

    artifacts.push({ id: artifactId, title, actions });
    pos = artifactEnd + ARTIFACT_CLOSE.length;
  }

  return { cleanText: cleanText.trim(), artifacts };
}

function parseActions(body: string): ArtifactAction[] {
  const actions: ArtifactAction[] = [];
  let pos = 0;

  while (pos < body.length) {
    const actionStart = body.indexOf(ACTION_OPEN, pos);
    if (actionStart === -1) break;

    const tagEnd = body.indexOf(">", actionStart);
    if (tagEnd === -1) break;

    const openTag = body.slice(actionStart, tagEnd + 1);
    const type = extractAttr(openTag, "type") as ArtifactAction["type"];
    const filePath = extractAttr(openTag, "filePath") || undefined;

    const actionEnd = body.indexOf(ACTION_CLOSE, tagEnd);
    if (actionEnd === -1) break;

    const content = body.slice(tagEnd + 1, actionEnd).trim();
    actions.push({ type: type || "file", filePath, content });
    pos = actionEnd + ACTION_CLOSE.length;
  }

  return actions;
}
