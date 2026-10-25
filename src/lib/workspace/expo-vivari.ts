import type { Sandbox } from "./sandbox";
import schema from "./expo-sdk58-schema.json";
export const EXPO_PORT = 8081;
export const EXPO_ENV = { EXPO_OFFLINE: "1", EXPO_UNIVERSE_DIR: ".cryzo-expo", EXPO_UNSTABLE_HEADLESS: "1", EXPO_UNSTABLE_BONJOUR: "0", EXPO_NO_TELEMETRY: "1", BROWSER: "none" };
export const EXPO_COMMAND = "node node_modules/expo/bin/cli start --go --web --localhost --port 8081";
/** Native-only host assumptions must not leak into the browser kernel. */
export async function prepareVivariMetro(runtime: Sandbox) {
  // Expo's asset resolver otherwise fetches configuration schemas even offline.
  // This is the official SDK 58 schema, supplied through Expo's local-schema path.
  await runtime.fs.mkdir(".cryzo-expo/server/www/xdl-schemas");
  await runtime.fs.writeFile(".cryzo-expo/server/www/xdl-schemas/UNVERSIONED-schema.json", JSON.stringify(schema));
  await runtime.fs.writeFile("metro.config.js", 'const { getDefaultConfig } = require("expo/metro-config");\nconst config = getDefaultConfig(__dirname);\nconfig.resolver.useWatchman = false;\nconfig.maxWorkers = 1;\nmodule.exports = config;\n');
  const patch = String.raw`const fs=require('fs'),path=require('path');
const [major,minor]=process.versions.node.split('.').map(Number);
if(!((major===22&&minor>=13)||(major===24&&minor>=3)||major>=26))throw new Error('Expo SDK 58 needs a supported Node runtime. Update the Vivari runtime before starting Metro.');
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
