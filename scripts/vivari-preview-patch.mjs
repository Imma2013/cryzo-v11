// Keep Cryzo network requests outside Vivari's virtual HTTP router.
export function patchVivariPreview(source, version) {
  if (version !== "1.1.1") throw new Error("Review the preview service worker before upgrading Vivari");
  const originGuard = 'if (url.origin !== self.location.origin) return;';
  const previewMatch = 'const idx = url.pathname.indexOf(PREVIEW_MARKER);';
  if (source.split(originGuard).length !== 2 || source.split(previewMatch).length !== 2) {
    throw new Error("Pinned Vivari service worker routing changed");
  }
  return source.replace(originGuard, originGuard + '\n  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return;')
    .replace(previewMatch, 'const match = url.pathname.match(/^\\/preview\\/([1-9]\\d{0,4})(?:\\/|$)/);\n  const idx = match && Number(match[1]) <= 65535 ? 0 : -1;');
}
