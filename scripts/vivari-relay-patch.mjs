// Scoped to the pinned MIT Vivari build. Fail closed if its private worker ABI changes.
export function patchVivariRelay(source, version) {
  if (version !== "1.1.1") throw new Error("Review the Vivari relay extension before upgrading @vivari/core");
  const handler = /self\.onmessage\s*=\s*async\s*\(?([\w$]+)\)?\s*=>\s*\{\s*(?:const|let)\s+([\w$]+)\s*=\s*\1\.data\s*;/g;
  const matches = [...source.matchAll(handler)];
  const owner = /([\w$]+)\.setNetRelay\([\w$]+\)/.exec(source)?.[1];
  if (matches.length !== 1 || !owner) throw new Error("Pinned Vivari kernel dispatch changed: " + source.slice(source.indexOf("self.onmessage"), source.indexOf("self.onmessage") + 240));
  const [anchor,,message] = matches[0];
  const extension = `
if (${message}.type === "cryzo-set-net-relay") {
 try {
  if (!${owner}) throw new Error("Kernel not ready");
  const url = ${message}.url;
  if (url !== null && (typeof url !== "string" || !url.startsWith("wss://"))) throw new Error("Invalid relay URL");
  ${owner}.setNetRelay(url);
  self.postMessage({type:"vv-reply",reqId:${message}.reqId,ok:true});
 } catch (error) { self.postMessage({type:"vv-reply",reqId:${message}.reqId,ok:false,error:String(error)}); }
 return;
}
`;
  return source.replace(anchor,anchor+extension);
}
