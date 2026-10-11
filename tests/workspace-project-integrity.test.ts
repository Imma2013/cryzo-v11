import { describe, expect, it } from "vitest";
import type { FileMap } from "@/lib/workspace/types";
import { analyzeProject } from "@/lib/workspace/project-integrity";

function web(extra: FileMap): FileMap {
  return {
    "package.json": { type: "file", content: JSON.stringify({ scripts: { dev: "vite", build: "vite build" }, dependencies: { react: "^19.2.0" }, devDependencies: { vite: "^6.3.0" } }) },
    ...extra,
  };
}

describe("generated project preflight", () => {
  it("repairs canvas-confetti from generated imports and preserves existing dependencies", () => {
    const f = web({ "src/AdoptionSection.tsx": { type: "file", content: 'import confetti from "canvas-confetti"; import React from "react"; export default () => <div />;' } });
    expect(analyzeProject(f).diagnostics.some((d) => d.message.includes("canvas-confetti"))).toBe(true);
    const patched = analyzeProject(f, true);
    const pkg = JSON.parse(patched.repairedFiles.find((x) => x.path === "package.json")!.content);
    expect(pkg.dependencies.react).toBe("^19.2.0");
    expect(pkg.dependencies["canvas-confetti"]).toMatch(/^\^1/);
    f["package.json"].content = JSON.stringify(pkg);
    expect(analyzeProject(f).diagnostics).toEqual([]);
  });

  it("repairs legacy Tailwind/PostCSS dependencies without picking Tailwind v4", () => {
    const f = web({ "postcss.config.js": { type: "file", content: "module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };" } });
    const r = analyzeProject(f, true);
    const pkg = JSON.parse(r.repairedFiles.find((x) => x.path === "package.json")!.content);
    expect(pkg.devDependencies.tailwindcss).toMatch(/^\^3/);
    expect(pkg.devDependencies.autoprefixer).toBeTruthy();
    expect(r.diagnostics.filter((x) => x.type === "import")).toEqual([]);
  });

  it("migrates incompatible PostCSS Tailwind v4 plugin", () => {
    const f = web({
      "src/index.css": { type: "file", content: '@import "tailwindcss";' },
      "postcss.config.js": { type: "file", content: "module.exports={plugins:{tailwindcss:{}}};" },
    });
    const result = analyzeProject(f, true);
    const pkg = JSON.parse(result.repairedFiles.find((x) => x.path === "package.json")!.content);
    expect(pkg.devDependencies["@tailwindcss/postcss"]).toBeTruthy();
    expect(pkg.devDependencies.tailwindcss).toMatch(/^\^4/);
    expect(result.repairedFiles.find((x) => x.path === "postcss.config.js")?.content).toContain("@tailwindcss/postcss");
  });

  it("catches nonexistent relative imports before reporting a healthy preview", () => {
    const f = web({ "src/App.tsx": { type: "file", content: 'import { Dog } from "./MissingDog"; export default Dog;' } });
    expect(analyzeProject(f).diagnostics[0]).toMatchObject({ type: "import", file: "src/App.tsx" });
  });

  it("allows relative assets and exact declared npm dependencies", () => {
    const f = web({
      "src/App.tsx": { type: "file", content: 'import "./index.css"; import React from "react"; import { Hero } from "./components/Hero"; export default Hero;' },
      "src/index.css": { type: "file", content: "body { margin: 0 }" },
      "src/components/Hero.tsx": { type: "file", content: "export const Hero=()=><h1>Hi</h1>" },
    });
    expect(analyzeProject(f).diagnostics).toEqual([]);
  });

  it("does not invent versions for unknown packages", () => {
    const f = web({ "src/App.tsx": { type: "file", content: 'import Widget from "some-new-unverified-package"; export default Widget;' } });
    const r = analyzeProject(f, true);
    expect(r.diagnostics[0].type).toBe("dependency");
    expect(r.repairedFiles).toEqual([]);
  });
});
