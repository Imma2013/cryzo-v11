// Cryzo restores project source from Convex after boot. Do not first replay a
// previous tab's entire OPFS filesystem; it is immediately replaced anyway.
// Leave that stored data untouched, and keep the separate dependency cache.
export function patchVivariFilesystem(source, version) {
  if (version !== "1.1.1") throw new Error("Review Vivari filesystem startup before upgrading");
  const mirror = '\ttry {\n\t\tif (typeof navigator !== "undefined" && navigator.storage && navigator.storage.getDirectory) {\n\t\t\tpersistence = await createOpfsPersistence(';
  const cache = '\ttry {\n\t\tif (typeof navigator !== "undefined" && navigator.storage && navigator.storage.getDirectory) {\n\t\t\tconst storage = await createOpfsDepStorage();';
  const ready = '\tserver = new FsServer(vfs, persistence);';
  const start = source.indexOf(mirror), cacheStart = source.indexOf(cache), end = source.indexOf(ready);
  if (start < 0 || cacheStart <= start || end <= cacheStart || source.split(mirror).length !== 2 || source.split(cache).length !== 2)
    throw new Error("Pinned Vivari filesystem boot contract changed");
  const cacheInit = source.slice(cacheStart, end);
  return source.slice(0, start) + `\t// Project files are mounted by Cryzo from Convex after ready. Old OPFS data is retained.\n` +
    `\tconst initializeDepCache = (async () => {\n${cacheInit}\t})();\n` +
    `\tlet cacheDeadline;\n\tawait Promise.race([initializeDepCache, new Promise(resolve => { cacheDeadline = setTimeout(resolve, 1500); })]).finally(() => clearTimeout(cacheDeadline));\n` + source.slice(end);
}
