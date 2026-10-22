import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
// @ts-expect-error Build helper intentionally stays executable without a TS loader.
import { patchVivariRelay } from "../scripts/vivari-relay-patch.mjs";
describe("pinned Vivari private ABI",()=>{
 it("patches the published worker exactly once and rejects an unreviewed upgrade",()=>{
  const base="node_modules/@vivari/core/dist/assets/";
  const file=readdirSync(base).find(name=>/^kernel-worker-.*\.js$/.test(name));expect(file).toBeTruthy();
  const source=readFileSync(base+file,"utf8");
  const patched=patchVivariRelay(source,"1.1.1");expect(patched.split('cryzo-set-net-relay')).toHaveLength(2);
  expect(()=>patchVivariRelay(source,"2.0.0")).toThrow();
 });
});
