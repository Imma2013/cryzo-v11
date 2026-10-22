import { describe, expect, it } from "vitest";
import { buildFileTree } from "../src/lib/workspace/file-tree";
import { draftConflicts, editorSession } from "../src/lib/workspace/editor-session";
describe("workbench state", () => {
  it("derives nested folders from file-only snapshots and keeps search ancestors", () => {
    const files = { "src/screens/Home.tsx": { type: "file" as const, content: "a" }, "package.json": { type: "file" as const, content: "{}" } };
    const tree = buildFileTree(files);
    expect(tree[0].path).toBe("src");
    expect(tree[0].children[0].children[0].path).toBe("src/screens/Home.tsx");
    expect(buildFileTree(files,"home")[0].children[0].children).toHaveLength(1);
    expect(buildFileTree(files,"missing")).toEqual([]);
  });
  it("retains drafts across panel remounts and isolates conversations", () => {
    const first = editorSession("first"); first.drafts["App.tsx"] = {base:"old",content:"my edit"};
    expect(editorSession("first").drafts["App.tsx"].content).toBe("my edit");
    expect(editorSession("second").drafts["App.tsx"]).toBeUndefined();
    expect(draftConflicts(first.drafts["App.tsx"],"old")).toBe(false);
    expect(draftConflicts(first.drafts["App.tsx"],"AI edit")).toBe(true);
    expect(draftConflicts(first.drafts["App.tsx"],"my edit")).toBe(false);
  });
});
