/** Evidence extraction only: preserve checkpoint artwork and crop its existing pixels. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const checkpoint = "e6f521a35bc94a27e33af422742d86619b5f1d8c";
const original = "docs/screenshots/worlds-geo-ux0a/art-direction";
const artwork = "public/cartography/serrian-atlas-island/1";
const output = path.join(root, original, "ember-review-e6f521a");
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const checkpointFile = file => execFileSync("git", ["show", `${checkpoint}:${file}`], { cwd: root });

await mkdir(path.join(output, "artwork"), { recursive: true });
await mkdir(path.join(output, "details"), { recursive: true });
const files = [];
async function record(file, bytes, metadata = {}) {
  await writeFile(path.join(output, file), bytes);
  files.push({ file, bytes: bytes.length, sha256: sha256(bytes), ...metadata });
}

for (const file of ["first-island.png", "first-island.svg", "sample-provenance.json"]) {
  const source = `${original}/${file}`;
  await record(file, checkpointFile(source), { source, method: "byte-for-byte checkpoint copy" });
}
for (const file of ["PROVENANCE.md", "mountain-rounded-1.svg", "woodland-broadleaf-grove-1.svg", "settlement-city-1.svg"]) {
  const source = `${artwork}/${file}`;
  await record(`artwork/${file}`, checkpointFile(source), { source, method: "byte-for-byte checkpoint copy" });
}

const png = checkpointFile(`${original}/first-island.png`);
const size = await sharp(png).metadata();
assert.equal(size.width, 2000);
assert.equal(size.height, 1400);
const crops = [
  ["mountains", { left: 560, top: 420, width: 530, height: 405 }],
  ["woodland", { left: 340, top: 660, width: 655, height: 395 }],
  ["settlement-river-label", { left: 955, top: 740, width: 310, height: 240 }],
  ["coastline", { left: 210, top: 245, width: 600, height: 260 }],
  ["typography-title", { left: 600, top: 45, width: 800, height: 125 }],
  ["typography-map-labels", { left: 600, top: 1005, width: 1160, height: 95 }],
];
for (const [name, crop] of crops) {
  const bytes = await sharp(png).extract(crop).png().toBuffer();
  const raw = await sharp(bytes).raw().toBuffer();
  const expected = await sharp(png).extract(crop).raw().toBuffer();
  assert.deepEqual(raw, expected, `Unmodified crop pixels: ${name}`);
  await record(`details/${name}.png`, bytes, { source: "first-island.png", method: "native-pixel crop; no resizing or retouching", crop });
}
const thumbnail = await sharp(png).resize({ width: 400, height: 280, kernel: "lanczos3" }).png().toBuffer();
await record("details/thumbnail-400.png", thumbnail, { source: "first-island.png", method: "400 x 280 downsample for composition/readability review; not a runtime palette screenshot" });
const brief = await readFile(path.join(output, "README.md"));
files.push({ file: "README.md", bytes: brief.length, sha256: sha256(brief), method: "review brief accompanying this unchanged checkpoint" });
const manifest = {
  sampleCheckpoint: checkpoint,
  emberDecision: "PENDING VISUAL REVIEW - neither approved nor rejected",
  libraryExpansionApproved: false,
  fullSize: { width: 2000, height: 1400, viewing: "100% zoom; 1 image pixel per display pixel" },
  originalPngSha256: sha256(png),
  files,
};
await writeFile(path.join(output, "review-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ output, checkpoint, originalPngSha256: manifest.originalPngSha256, files: files.length + 1, nativePixelCrops: crops.length, originalArtworkUnchanged: true }, null, 2));
