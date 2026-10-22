import type { FileMap } from "./types";
export type TreeNode = { path: string; name: string; directory: boolean; children: TreeNode[] };
/** FileMap does not require explicit folder entries. Derive every ancestor. */
export function buildFileTree(files: FileMap, query = ""): TreeNode[] {
  const roots: TreeNode[] = [];
  const nodes = new Map<string, TreeNode>();
  const needle = query.trim().toLowerCase();
  for (const [path, entry] of Object.entries(files)) {
    if (entry.type !== "file" || (needle && !path.toLowerCase().includes(needle))) continue;
    const parts = path.split("/").filter(Boolean);
    let siblings = roots;
    for (let i = 0; i < parts.length; i++) {
      const key = parts.slice(0, i + 1).join("/");
      let node = nodes.get(key);
      if (!node) { node = { path: key, name: parts[i], directory: i < parts.length - 1, children: [] }; nodes.set(key, node); siblings.push(node); }
      siblings = node.children;
    }
  }
  const sort = (items: TreeNode[]) => { items.sort((a,b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name)); items.forEach(n => sort(n.children)); };
  sort(roots); return roots;
}
