import { describe, expect, it } from "vitest";
import { removeUnusedGeneratedImports } from "@/lib/server/generated-import-hygiene";

describe("generated TypeScript import hygiene", () => {
  it("removes unused Lucide icons but keeps JSX references and type uses", () => {
    const code = `import { Shield, Wrench, Award, Heart } from 'lucide-react';\nimport type { IconProps } from './types';\nexport default function View(props: IconProps) { return <Heart title={props.title}/>; }`;
    const result = removeUnusedGeneratedImports("src/components/View.tsx", code);
    expect(result).toContain("Heart");
    expect(result).toContain("IconProps");
    expect(result).not.toMatch(/import[^;]*Shield/);
    expect(result).not.toMatch(/import[^;]*Wrench/);
    expect(result).not.toMatch(/import[^;]*Award/);
  });
  it("removes an unused classic React default import with the automatic jsx transform", () => {
    const code = 'import React from "react";\nexport default function App() { return <div>Hi</div>; }';
    expect(removeUnusedGeneratedImports("src/App.tsx", code)).not.toMatch(/import React/);
  });
  it("does not break unknown side effects, local imports, or referenced icons", () => {
    const code = 'import "./global.css";\nimport { register } from "./bootstrap";\nimport { Heart } from "lucide-react";\nexport function App(){ register(); return <Heart />; }';
    expect(removeUnusedGeneratedImports("src/App.tsx", code)).toBe(code);
  });
  it("does not replace identifiers appearing only in strings, and is idempotent", () => {
    const code = 'import { Shield } from "lucide-react";\nexport const message = "Shield";';
    const once = removeUnusedGeneratedImports("src/App.ts", code);
    expect(once).not.toMatch(/import.*Shield/);
    expect(removeUnusedGeneratedImports("src/App.ts", once)).toBe(once);
  });
  it("does not edit unrelated languages", () => {
    const code = 'import { Shield } from "lucide-react";';
    expect(removeUnusedGeneratedImports("src/App.py", code)).toBe(code);
  });
});
