// Packages the built game (dist/) into a zip ready to upload as an
// itch.io HTML5 project. itch.io requires index.html to sit at the ROOT
// of the zip, not inside a subfolder, so this zips the *contents* of
// dist/ rather than the dist/ folder itself.
import { createWriteStream, existsSync, mkdirSync, readFileSync } from "fs";
import { resolve, join } from "path";
import { fileURLToPath } from "url";
import archiver from "archiver";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(__dirname, "..");
const distDir = join(root, "dist");
const releasesDir = join(root, "releases");

if (!existsSync(distDir)) {
  console.error('dist/ not found. Run "npm run build" first (build:itch does this for you).');
  process.exit(1);
}

if (!existsSync(releasesDir)) mkdirSync(releasesDir);

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
const safeName = (pkg.name || "game").replace(/[^a-z0-9-_]/gi, "-");
const version = pkg.version || "0.0.0";
const outPath = join(releasesDir, `${safeName}-itch-v${version}.zip`);

const output = createWriteStream(outPath);
const archive = archiver("zip", { zlib: { level: 9 } });

output.on("close", () => {
  const mb = (archive.pointer() / 1024 / 1024).toFixed(2);
  console.log(`✔ Built itch.io zip: ${outPath} (${mb} MB)`);
  console.log('  Upload this file on itch.io as an HTML5 project, with "index.html" as the entry point, and check "This file will be played in the browser".');
});

archive.on("warning", (err) => {
  if (err.code === "ENOENT") console.warn(err);
  else throw err;
});
archive.on("error", (err) => {
  throw err;
});

archive.pipe(output);
// Zip the CONTENTS of dist/, so index.html ends up at the zip root.
archive.directory(distDir, false);
archive.finalize();
