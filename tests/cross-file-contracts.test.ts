import { describe, expect, it } from "vitest";
import { localExportContractIssues } from "@/lib/server/cross-file-contracts";
import type { FileMap } from "@/lib/workspace/types";
function project(entries: Record<string, string>): FileMap {
  return Object.fromEntries(Object.entries(entries).map(([path, content]) => [path, { type: "file", content }]));
}
describe("cross-file local exports", () => {
  it("rejects missing Vehicle and ViewFilter named exports", () => {
    const issues = localExportContractIssues(project({
      "src/types.ts": "export interface Book { title: string }",
      "src/components/Collection.tsx": 'import type { Vehicle, ViewFilter } from "../types"; export const C = () => null;',
    }));
    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain("Vehicle");
    expect(issues[1]).toContain("ViewFilter");
  });
  it("accepts re-export barrels, alias exports and typed imports", () => {
    expect(localExportContractIssues(project({
      "src/model.ts": "export interface Book {title: string}",
      "src/types.ts": 'export * from "./model"; export { Book as Volume } from "./model";',
      "src/Library.tsx": 'import type { Book, Volume } from "./types"; export const book: Book = {title:"x"};',
    }))).toEqual([]);
  });
  it("ignores third party modules", () => {
    expect(localExportContractIssues(project({"src/App.tsx": 'import {useState} from "react";'}))).toEqual([]);
  });
});
