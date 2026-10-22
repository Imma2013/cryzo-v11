// Prepares the static files Cryzo's in-browser runtime (Vivari, MIT — https://vivari.run)
// needs at the site root. Everything written here is generated and git-ignored.
//
//   @vivari/core/dist/index.js      -> public/vivari/index.js      loaded with a native import()
//   @vivari/core/dist/assets/*.js   -> public/assets/*             kernel + nested Web Workers (the SDK
//                                                                  requests them at /assets/<hashed name>)
//   @vivari/core/dist/assets/sw.js  -> public/sw.js                preview Service Worker
//   public/inspector-script.js      -> public/vv-devtools/chobitsu.js
//                                                                  the script slot Vivari injects into every
//                                                                  preview page; Cryzo fills it with its
//                                                                  element picker + error reporter
//   npm@NPM_VERSION                 -> public/vendor/npm-pack.bin  the real npm CLI, run inside the browser
//   pyodide@PYODIDE_VERSION         -> public/vendor/pyodide/*     CPython for `python` / `pip`
//
// Runs before `npm run dev` and `npm run build`. The npm and Pyodide downloads are
// cached under node_modules/.cache and skipped when already up to date.
//
// The npm-pack.bin layout is defined by Vivari's kernel and this packer follows
// Vivari's own scripts/vendor-npm.mjs (MIT, © Duc Trung Mai).
import { createHash } from "node:crypto";
import { patchVivariRelay } from "./vivari-relay-patch.mjs";
import { patchVivariPreview } from "./vivari-preview-patch.mjs";
import { execSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

// Pinned to what @vivari/core 1.1.1 is built and tested against. Bump together with the SDK.
const NPM_VERSION = "10.9.2";
const PYODIDE_VERSION = "314.0.7"; // CPython 3.14.2

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "node_modules", "@vivari", "core", "dist");
const publicDir = join(root, "public");
const assetsDir = join(publicDir, "assets");
const vendorDir = join(publicDir, "vendor");
const cacheDir = join(root, "node_modules", ".cache", "cryzo-vivari");

const log = (message) => console.log(`[vivari] ${message}`);
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

if (!existsSync(join(dist, "index.js"))) {
  console.error("[vivari] @vivari/core is not installed. Run `npm install` first.");
  process.exit(1);
}

function installIntoCache(spec) {
  const dir = join(cacheDir, spec.replace(/[^a-z0-9.@-]/gi, "_"));
  const name = spec.slice(0, spec.lastIndexOf("@"));
  const packageDir = join(dir, "node_modules", name);
  if (!existsSync(join(packageDir, "package.json"))) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    // Its own package.json keeps npm from installing into the Cryzo project instead.
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "cryzo-vivari-cache", private: true }));
    log(`downloading ${spec} …`);
    execSync(`npm install ${spec} --no-save --no-audit --no-fund --ignore-scripts --loglevel=error`, {
      cwd: dir,
      stdio: ["ignore", "ignore", "inherit"],
    });
  }
  return packageDir;
}

function syncRuntime() {
  const manifestPath = join(assetsDir, ".vivari-manifest.json");
  mkdirSync(assetsDir, { recursive: true });
  mkdirSync(join(publicDir, "vivari"), { recursive: true });
  mkdirSync(join(publicDir, "vv-devtools"), { recursive: true });

  // Worker file names are content-hashed: drop the ones a previous version left behind.
  if (existsSync(manifestPath)) {
    for (const name of readJson(manifestPath).files ?? []) rmSync(join(assetsDir, name), { force: true });
  }

  const { version } = readJson(join(dist, "..", "package.json"));
  const originals = readdirSync(join(dist, "assets")).filter((name) => name !== "sw.js");
  const kernelName = originals.find(name => /^kernel-worker-.*\.js$/.test(name));
  if (!kernelName) throw new Error("Vivari kernel asset was not found");
  const patched = patchVivariRelay(readFileSync(join(dist,"assets",kernelName),"utf8"),version);
  const kernelOutput = "kernel-worker-cryzo-" + createHash("sha256").update(patched).digest("hex").slice(0,16) + ".js";
  const files = originals.map(name => name === kernelName ? kernelOutput : name);
  for (const name of originals) {
    if (name === kernelName) writeFileSync(join(assetsDir,kernelOutput),patched);
    else copyFileSync(join(dist,"assets",name),join(assetsDir,name));
  }
  writeFileSync(join(publicDir, "sw.js"), patchVivariPreview(readFileSync(join(dist, "assets", "sw.js"), "utf8"), version));
  const entry = readFileSync(join(dist,"index.js"),"utf8");
  if (!entry.includes(kernelName)) throw new Error("Vivari entry no longer references the pinned kernel");
  writeFileSync(join(publicDir,"vivari","index.js"),entry.replaceAll(kernelName,kernelOutput));
  copyFileSync(join(publicDir, "inspector-script.js"), join(publicDir, "vv-devtools", "chobitsu.js"));

  writeFileSync(manifestPath, JSON.stringify({ version, files }, null, 2) + "\n");
  log(`runtime @vivari/core@${version}: ${files.length} worker files, sw.js, index.js`);
}

function packNpm() {
  const out = join(vendorDir, "npm-pack.bin");
  const marker = join(vendorDir, ".npm-pack.json");
  if (existsSync(out) && existsSync(marker) && readJson(marker).version === NPM_VERSION) {
    log(`npm@${NPM_VERSION} pack is up to date`);
    return;
  }

  const npmDir = installIntoCache(`npm@${NPM_VERSION}`);
  const files = [];
  let totalBytes = 0;
  (function walk(dir, rel) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(abs, path);
      else if (entry.isFile()) {
        const size = statSync(abs).size;
        files.push({ path, abs, size });
        totalBytes += size;
      }
    }
  })(npmDir, "");

  // [u32le header length][header JSON][file bytes …], gzipped. The header indexes each
  // file by path, offset and length. Deliberately not named .gz so no static host
  // serves it with Content-Encoding and decompresses it before the kernel does.
  let offset = 0;
  const index = files.map((file) => {
    const entry = { p: file.path, o: offset, l: file.size };
    offset += file.size;
    return entry;
  });
  const header = Buffer.from(JSON.stringify({ version: NPM_VERSION, files: index }), "utf8");
  const headerLength = Buffer.alloc(4);
  headerLength.writeUInt32LE(header.length, 0);
  const body = Buffer.concat(files.map((file) => readFileSync(file.abs)), totalBytes);
  const packed = gzipSync(Buffer.concat([headerLength, header, body]), { level: 9 });

  mkdirSync(vendorDir, { recursive: true });
  writeFileSync(out, packed);
  writeFileSync(marker, JSON.stringify({ version: NPM_VERSION, files: files.length }) + "\n");
  log(`npm@${NPM_VERSION} packed: ${files.length} files, ${(packed.length / 1e6).toFixed(1)} MB`);
}

function syncPyodide() {
  const out = join(vendorDir, "pyodide");
  const marker = join(out, ".cryzo-pyodide.json");
  if (existsSync(marker) && readJson(marker).version === PYODIDE_VERSION) {
    log(`pyodide@${PYODIDE_VERSION} is up to date`);
    return;
  }

  const pyodideDir = installIntoCache(`pyodide@${PYODIDE_VERSION}`);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  // pyodide.asm.js was renamed pyodide.asm.mjs in 314.x; copy whichever the package ships.
  const core = ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.js", "pyodide.asm.wasm", "python_stdlib.zip"];
  const copied = core.filter((name) => existsSync(join(pyodideDir, name)));
  for (const name of copied) copyFileSync(join(pyodideDir, name), join(out, name));

  // Only the interpreter and standard library are hosted by Cryzo. Package wheels
  // (micropip, numpy, …) resolve to Pyodide's CDN the first time a project needs them.
  const lock = readJson(join(pyodideDir, "pyodide-lock.json"));
  const cdn = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
  for (const entry of Object.values(lock.packages ?? {})) {
    if (entry.file_name && !/^https?:/.test(entry.file_name)) entry.file_name = cdn + entry.file_name;
  }
  writeFileSync(join(out, "pyodide-lock.json"), JSON.stringify(lock));
  writeFileSync(marker, JSON.stringify({ version: PYODIDE_VERSION, python: lock.info?.python }) + "\n");
  log(`pyodide@${PYODIDE_VERSION} (Python ${lock.info?.python}): ${copied.length} core files`);
}

try {
  syncRuntime();
  packNpm();
  syncPyodide();
} catch (error) {
  console.error(`[vivari] failed to prepare runtime assets: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
