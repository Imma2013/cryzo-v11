import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { patchPreviewServiceWorker } from "../scripts/patch-preview-service-worker.mjs";
it("bypasses shell APIs without breaking preview APIs", () => {
  const vendor = readFileSync(
    "node_modules/@vivari/core/dist/assets/sw.js",
    "utf8",
  );
  const source = patchPreviewServiceWorker(vendor);
  let handler: any;
  const sw = {
    addEventListener: (name: string, fn: any) => {
      if (name === "fetch") handler = fn;
    },
    location: { origin: "https://cryzo.test" },
    skipWaiting: () => {},
    clients: { claim: () => {} },
  };
  // Execute just the fetch handler, with preview/static paths disabled.
  const start = source.indexOf('self.addEventListener("fetch",');
  const end = source.indexOf("\n// Resolve a root-absolute request", start);
  new Function(
    "self",
    "WILDCARD_MODE",
    "PREVIEW_MARKER",
    "CACHE_ON",
    "referrerIsOwnDevModule",
    "referrerIsPreview",
    "routeByClient",
    source.slice(start, end),
  )(
    sw,
    false,
    "/preview/",
    false,
    () => false,
    (ref: string) => ref.includes("/preview/"),
    () => new Response("preview"),
  );
  let calls = 0;
  const dispatch = (referrer: string) =>
    handler({
      request: {
        url: "https://cryzo.test/api/chat",
        method: "POST",
        referrer,
        mode: "cors",
      },
      respondWith: () => {
        calls++;
      },
    });
  dispatch("https://cryzo.test/chat/project");
  expect(calls).toBe(0);
  dispatch("https://cryzo.test/preview/5173/");
  expect(calls).toBe(1);
});
