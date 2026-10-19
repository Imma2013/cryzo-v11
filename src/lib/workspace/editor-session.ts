export type EditorDraft = { base: string; content: string };
export type EditorSession = { selected: string | null; tabs: string[]; drafts: Record<string, EditorDraft> };
const sessions = new Map<string, EditorSession>();
export function editorSession(id: string): EditorSession {
  let value = sessions.get(id);
  if (!value) { value = { selected: null, tabs: [], drafts: {} }; sessions.set(id, value); }
  return value;
}
export function draftConflicts(draft: EditorDraft | undefined, current: string): boolean {
  return !!draft && draft.content !== current && draft.base !== current;
}
