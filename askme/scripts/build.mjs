import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = dirname(scriptsDir);
const dist = join(pluginRoot, "dist");

await mkdir(join(dist, "ui"), { recursive: true });

await build({
  entryPoints: [join(pluginRoot, "src/server/main.mjs")],
  outfile: join(dist, "server.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  minify: false,
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
});

await copyFile(join(pluginRoot, "src/ui/card.html"), join(dist, "ui/card.html"));

console.log("Built dist/server.mjs and dist/ui/card.html");
