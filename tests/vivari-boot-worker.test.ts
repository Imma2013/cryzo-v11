import {readFileSync, readdirSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {webcrypto} from "node:crypto";
import {describe, expect, it, vi} from "vitest";
import {patchVivariFilesystem} from "../scripts/vivari-boot-patch.mjs";
const assets="node_modules/@vivari/core/dist/assets/";
const source=readFileSync(assets+readdirSync(assets).find(name=>/^fs-worker-.*\.js$/.test(name)),"utf8");
describe("pinned Vivari filesystem startup", () => {
  it("boots the actual Wasm filesystem even when browser storage never responds", async () => {
    const storage=vi.fn(()=>new Promise(()=>{})), messages:any[]=[];
    let ready!:()=>void;const completed=new Promise<void>(resolve=>{ready=resolve;});
    const worker=patchVivariFilesystem(source,"1.1.1").replaceAll("import.meta.url", JSON.stringify("https://cryzo.test/assets/fs-worker.js"));
    runInNewContext(worker, {
      self:{postMessage(message:any){messages.push(message);if(message.type==="ready")ready();}},
      navigator:{storage:{getDirectory:storage}}, WebAssembly, URL, fetch, Response, Request, Headers,
      TextEncoder,TextDecoder,SharedArrayBuffer,Atomics,crypto:webcrypto,performance,console,setTimeout,clearTimeout,setInterval,clearInterval,
    });
    await completed;
    expect(messages.some(message=>message.type==="ready")).toBe(true);
    // Only optional dependency-cache initialization touches storage; no old project replay.
    expect(storage).toHaveBeenCalledOnce();
  }, 8000);
  it("rejects an unreviewed SDK or a changed worker instead of silently mispatching", () => {
    expect(()=>patchVivariFilesystem(source,"2.0.0")).toThrow("Review");
    expect(()=>patchVivariFilesystem(source.replace("persistence = await createOpfsPersistence(","persistence = await other("),"1.1.1")).toThrow("contract changed");
  });
});
