import type { Sandbox } from "./sandbox";
export const EXPO_PORT = 8081;
export const EXPO_ENV = { EXPO_OFFLINE: "1", EXPO_UNSTABLE_HEADLESS: "1", EXPO_UNSTABLE_BONJOUR: "0", EXPO_NO_TELEMETRY: "1", BROWSER: "none" };
export const EXPO_COMMAND = "node node_modules/expo/bin/cli start --go --web --localhost --port 8081";
/** Native-only host assumptions must not leak into the browser kernel. */
export async function prepareVivariMetro(runtime: Sandbox) {
  await runtime.fs.writeFile("metro.config.js", 'const { getDefaultConfig } = require("expo/metro-config");\nconst config = getDefaultConfig(__dirname);\nconfig.resolver.useWatchman = false;\nconfig.maxWorkers = 1;\nmodule.exports = config;\n');
  const patch = `const fs=require('fs'),path=require('path');
for(const name of ['lightningcss','lightningcss-wasm']){try{
 const entry=require.resolve(name), file=path.join(path.dirname(entry),'wasm-node.cjs');
 if(!fs.existsSync(file))continue;
 const source=fs.readFileSync(file,'utf8');
 const fixed=source.replace(/var import_meta_url = [^\n]+;/, 'var import_meta_url = require("url").pathToFileURL(require("path").resolve(__dirname,"wasm-node.cjs")).href;');
 if(source!==fixed)fs.writeFileSync(file,fixed);
}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}}`;
  const proc = await runtime.spawn("node", ["-e", patch]);
  await proc.output.pipeTo(new WritableStream({write() {}}));
  if (await proc.exit !== 0) throw new Error("Metro compatibility setup failed");
}
