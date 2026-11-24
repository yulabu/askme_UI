import { build } from "esbuild";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = dirname(scriptsDir);
const dist = join(pluginRoot, "dist");

// The manifest is the released version. Fail loudly when the npm package or
// the local marketplace entry drifts, instead of installing a mislabeled build.
const manifest = JSON.parse(
  await readFile(join(pluginRoot, ".zcode-plugin", "plugin.json"), "utf8"),
);
const packageJson = JSON.parse(
  await readFile(join(pluginRoot, "package.json"), "utf8"),
);
const marketplace = JSON.parse(
  await readFile(join(pluginRoot, "..", "marketplace.json"), "utf8"),
);
const listing = (marketplace.plugins || []).find(
  (plugin) => plugin.name === manifest.name,
);
if (!listing) {
  throw new Error(`marketplace.json has no entry for plugin "${manifest.name}"`);
}
if (packageJson.version !== manifest.version || listing.version !== manifest.version) {
  throw new Error(
    `Version mismatch: package.json=${packageJson.version}, ` +
      `plugin.json=${manifest.version}, marketplace.json=${listing.version}`,
  );
}

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
