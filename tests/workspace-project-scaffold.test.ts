import { describe, expect, it } from "vitest";
import type { FileMap } from "@/lib/workspace/types";
import { isReactViteProject, missingReactViteScaffold, projectReadinessIssues } from "@/lib/workspace/project-scaffold";

const reactFiles = (): FileMap => ({ "src/App.tsx": { type: "file", content: "export default function App() { return <div />; }" }, "src/main.tsx": { type: "file", content: "" } });

describe("React/Vite restoration", () => {
  it("restores a complete runnable scaffold when Gemini omitted package.json", () => {
    const files = reactFiles();
    const scaffold = missingReactViteScaffold(files);
    const paths = scaffold.map((f) => f.path);
    expect(paths).toContain("package.json");
    expect(paths).toContain("index.html");
    expect(paths).toContain("vite.config.ts");
    expect(paths).not.toContain("src/App.tsx");
    expect(paths).not.toContain("src/main.tsx");
    for (const file of scaffold) files[file.path] = { type: "file", content: file.content };
    expect(projectReadinessIssues(files, "npm run dev")).toEqual([]);
    expect(JSON.parse(files["package.json"].content || "").scripts.dev).toContain("vite");
  });

  it("never replaces a model-authored manifest", () => {
    const files = { ...reactFiles(), "package.json": { type: "file" as const, content: '{"scripts":{"dev":"next dev"}}' } };
    expect(missingReactViteScaffold(files)).toEqual([]);
    expect(projectReadinessIssues(files, "npm run dev")).toEqual([]);
  });

  it("rejects an invalid manifest and absent dev script", () => {
    const files = reactFiles();
    files["package.json"] = { type: "file", content: "broken" };
    expect(projectReadinessIssues(files, "npm install")[0]).toContain("invalid JSON");
    files["package.json"].content = '{"scripts":{"build":"vite build"}}';
    expect(projectReadinessIssues(files, "npm run dev")[0]).toContain("scripts.dev");
  });

  it("does not transform Expo or Python into Vite", () => {
    const mobile: FileMap = { "app.json": { type: "file", content: "{}" }, "App.tsx": { type: "file", content: "" } };
    const python: FileMap = { "requirements.txt": { type: "file", content: "flask" }, "main.py": { type: "file", content: "" } };
    expect(isReactViteProject(mobile)).toBe(false);
    expect(missingReactViteScaffold(mobile)).toEqual([]);
    expect(missingReactViteScaffold(python)).toEqual([]);
    expect(projectReadinessIssues(python, "flask --app main run")).toEqual([]);
    const next: FileMap = { "next.config.ts": { type: "file", content: "" }, "src/app/page.tsx": { type: "file", content: "" } };
    expect(missingReactViteScaffold(next)).toEqual([]);
  });
});
