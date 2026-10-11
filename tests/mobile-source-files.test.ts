import { describe, expect, it } from "vitest";
import { mobileSourceFiles } from "@/lib/workspace/mobile-source-files";
describe("Expo source payload", () => {
  it("converts FileMap to array while omitting folders", () => {
    expect(mobileSourceFiles({
      "app.json": { type: "file", content: "{}" },
      "src": { type: "folder" },
      "src/App.tsx": { type: "file", content: "export default function App() {}" },
    })).toEqual([
      { path: "app.json", content: "{}" },
      { path: "src/App.tsx", content: "export default function App() {}" },
    ]);
  });
});
