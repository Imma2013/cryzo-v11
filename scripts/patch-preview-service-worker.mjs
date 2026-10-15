// Patch the generated vendor asset at build time; fail closed on upstream drift.
export function patchPreviewServiceWorker(source) {
  const anchor = "  event.respondWith(routeByClient(event, url));";
  if (!source.includes(anchor))
    throw new Error(
      "Vivari fetch handler changed; review the Cryzo API bypass.",
    );
  return source.replace(
    anchor,
    `  // Cryzo shell requests must never be re-issued by the preview worker.
  // Preview iframe root-absolute APIs still belong to its in-browser runtime.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/.well-known/workflow/")) {
    // The request referrer identifies preview-origin API calls synchronously.
    if (!referrerIsPreview(event.request.referrer)) return;
  }
${anchor}`,
  );
}
