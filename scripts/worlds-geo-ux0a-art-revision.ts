/** Original vector revision and standalone review composition. No database or runtime fixture. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { generateGeography, type GeographicRecipe } from "../src/features/worlds/geographic-generation";
import { canonicalAuthoringGeometry, validateAuthoringGeometry } from "../src/features/worlds/geographic-authoring-geometry";
import { pointInsideGeographicRing } from "../src/features/worlds/geographic-geometry";
import type { Coordinate } from "../src/features/worlds/geographic";

const assets = "public/cartography/serrian-atlas-island/1";
const output = "docs/screenshots/worlds-geo-ux0a/art-direction/revision-2";
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const fixed = (n: number) => Number(n.toFixed(3));
function random(seed: number) { let state = seed; return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; }; }
function smooth(points: Coordinate[], closed = true) {
  const count = points.length, at = (i: number) => points[closed ? (i + count) % count : Math.max(0, Math.min(count - 1, i))];
  return `M${points[0].join(",")}` + points.slice(closed ? 0 : 1).map((_, j) => {
    const i = closed ? j : j, a = at(i - 1), b = at(i), c = at(i + 1), d = at(i + 2);
    return `C${fixed(b[0] + (c[0] - a[0]) / 6)},${fixed(b[1] + (c[1] - a[1]) / 6)} ${fixed(c[0] - (d[0] - b[0]) / 6)},${fixed(c[1] - (d[1] - b[1]) / 6)} ${c.join(",")}`;
  }).join("") + (closed ? "Z" : "");
}
function mountain() {
  const rnd = random(29), parts: string[] = [];
  const peaks = [
    { x: -81, y: 7, height: 103, width: 68, crown: [-7, -1, 4, 10] },
    { x: 22, y: 15, height: 177, width: 97, crown: [-11, -4, 6, 14] },
    { x: 110, y: 16, height: 94, width: 70, crown: [-13, -5, 12, 25] },
  ];
  for (const [index, p] of peaks.entries()) {
    const { x, y, height: h, width: w } = p, top = y - h;
    const silhouette = `M${x - w},${y}Q${x - w * .62},${y - h * .19} ${x - w * .54},${y - h * .36}L${x - w * .36},${y - h * .43} ${x + p.crown[0]},${top + 29} ${x + p.crown[1]},${top + 8} ${x + p.crown[2]},${top} ${x + p.crown[3]},${top + 25} ${x + w * .40},${y - h * .51} ${x + w * .42},${y - h * .33}Q${x + w * .68},${y - h * .1} ${x + w},${y + 2}Q${x + 12},${y + 15} ${x - w},${y}Z`;
    parts.push(`<g><path d="${silhouette}" fill="${index === 1 ? "#b9b4a0" : "#c6c1a9"}" stroke="#57584a" stroke-width="1.25"/>`);
    parts.push(`<path d="M${x + p.crown[2]},${top}L${x + 9},${top + h * .26} ${x - 1},${top + h * .39} ${x + 15},${top + h * .56} ${x + 6},${y - 22} ${x + 27},${y + 7}Q${x + w * .65},${y + 7} ${x + w},${y + 2}L${x + w * .42},${y - h * .33} ${x + w * .4},${y - h * .51} ${x + p.crown[3]},${top + 25}Z" fill="#8b9488" stroke="none"/>`);
    parts.push(`<path d="M${x + p.crown[2]},${top}L${x + p.crown[1]},${top + 8} ${x + p.crown[0]},${top + 29} ${x - 24},${top + 51} ${x - 9},${top + 43} ${x - 2},${top + 52} ${x + 7},${top + 39} ${x + 20},${top + 53} ${x + 15},${top + 29}Z" fill="#eae6d4" stroke="#696c5a" stroke-width=".65"/>`);
    for (let i = 0; i < 48; i++) {
      const t = .27 + rnd() * .66, side = i % 3 ? -1 : 1, spread = w * t * (.14 + rnd() * .62), px = x + side * spread, py = top + h * t, len = 7 + rnd() * 14;
      parts.push(`<path d="M${fixed(px)},${fixed(py)}q${fixed(side * 3)},${fixed(len * .4)} ${fixed(side * (5 + rnd() * 5))},${fixed(len)}" fill="none" stroke="#626858" stroke-width="${fixed(.5 + rnd() * .3)}" opacity="${fixed(.35 + rnd() * .3)}"/>`);
    }
    parts.push(`<path d="M${x - w * .55},${y - h * .25}q${w * .2},${-h * .12} ${w * .35},${h * .13}M${x - w * .85},${y - 5}q${w * .26},-9 ${w * .45},0M${x + w * .55},${y - 9}l${w * .13},7" fill="none" stroke="#6b705c" stroke-width=".8" opacity=".75"/></g>`);
  }
  parts.push('<path d="M-162 16q37 11 72 2m-49 6q23 6 41 2M-36 31q39 10 72 0m22 1q25 7 51-2m20-4q29 5 51-1" fill="none" stroke="#9c9d7e" stroke-width=".85"/>');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-175 -170 365 215">${parts.join("")}</svg>\n`;
}
function woodland() {
  const rnd = random(77), parts: string[] = [];
  const trees = [[-83, 4, 88, 34], [67, 3, 120, 43], [-28, 20, 143, 53], [110, 22, 82, 30], [25, 35, 113, 44]];
  for (const [index, [x, y, height, width]] of trees.entries()) {
    const top = y - height, crown = top + height * .34, outline: Coordinate[] = [];
    for (let i = 0; i < 22; i++) { const a = i / 22 * Math.PI * 2, factor = .88 + rnd() * .22; outline.push([fixed(x + Math.cos(a) * width * factor), fixed(crown + Math.sin(a) * height * .32 * factor)]); }
    parts.push(`<g><path d="M${x - width * .45},${y + 4}q${width * .45},-8 ${width},2" stroke="#9ca37d" stroke-width="1" fill="none"/>`);
    parts.push(`<path d="M${x - 5},${y}q4,-${height * .22} 1,-${height * .37}l-${width * .30},-${height * .23} 4,-4 ${width * .29},${height * .17} 3,-${height * .20} 5,-2 1,${height * .23} ${width * .27},-${height * .14} 3,4 -${width * .29},${height * .23} 1,${height * .27} 6,8Z" fill="#a89871" stroke="#61674b" stroke-width=".9"/>`);
    const colors = ["#a8b28b", "#98a581", "#b0b795", "#8d9e78", "#a5b08a"];
    parts.push(`<path d="${smooth(outline)}" fill="${colors[index]}" stroke="#65704f" stroke-width=".9"/>`);
    parts.push(`<path d="M${x - width * .85},${crown + height * .10}q${width * .2},${height * .22} ${width * .64},${height * .16}q${width * .37},${height * .11} ${width * .7},-${height * .02}q${width * .3},${height * .08} ${width * .44},-${height * .11}q-${width * .08},${height * .23} -${width * .55},${height * .21}q-${width * .27},${height * .10} -${width * .55},-${height * .02}q-${width * .35},${height * .06} -${width * .68},-${height * .22}Z" fill="#718c67" opacity=".58" stroke="none"/>`);
    for (let i = 0; i < 31; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * .78, px = x + Math.cos(a) * width * r, py = crown + Math.sin(a) * height * .31 * r;
      parts.push(`<path d="M${fixed(px)},${fixed(py)}q${fixed(2 + rnd() * 4)},-${fixed(2 + rnd() * 3)} ${fixed(5 + rnd() * 4)},0" fill="none" stroke="${i % 3 ? "#657650" : "#d9d8b5"}" opacity="${i % 3 ? ".55" : ".8"}" stroke-width=".65"/>`);
    }
    parts.push(`<path d="M${x - 1},${y - height * .26}l-1,${height * .22}m5,-${height * .14}v${height * .13}" fill="none" stroke="#6a6e4e" stroke-width=".7"/></g>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-130 -140 275 190">${parts.join("")}</svg>\n`;
}

async function main() {
  await mkdir(output, { recursive: true });
  await mkdir(`${output}/details`, { recursive: true });
  await mkdir(`${output}/thumbnails`, { recursive: true });
  // New immutable subject revisions; the initial three assets remain the subset.
  const candidates = [{ id: "mountain-rounded", revision: 2, svg: mountain() }, { id: "woodland-broadleaf-grove", revision: 2, svg: woodland() }, { id: "settlement-city", revision: 1, svg: (await readFile(`${assets}/settlement-city-1.svg`, "utf8")).replaceAll("\r\n", "\n") }];
  for (const asset of candidates.filter(a => a.revision === 2)) {
    const filename = `${assets}/${asset.id}-${asset.revision}.svg`;
    try { assert.equal((await readFile(filename, "utf8")).replaceAll("\r\n", "\n"), asset.svg, "Publish a new revision rather than replacing an existing candidate"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; await writeFile(filename, asset.svg); }
  }
  const recipe: GeographicRecipe = { version: 1, algorithm: "serrian-geography-v1", seed: "island-art-direction-20261015", reference: { version: 1, kind: "plane", crs: "AUTHORED:island-art-direction", units: "map units", bounds: [0, 0, 2000, 1400] }, extent: [0, 0, 2000, 1200], settings: { continents: 0, islands: 1, landCoverage: 40, complexity: 88, size: "large", shape: "balanced" } };
  const original = generateGeography(recipe).features[0].geometry;
  assert.equal(original.type, "Polygon"); if (original.type !== "Polygon") throw Error("Single island required");
  const ring = original.coordinates[0].slice(0, -1), xs = ring.map(p => p[0]), ys = ring.map(p => p[1]), left = Math.min(...xs), top = Math.min(...ys), scale = Math.min(1400 / (Math.max(...xs) - left), 820 / (Math.max(...ys) - top));
  const fitted: Coordinate[] = ring.map(([x, y]) => [430 + (x - left) * scale, 295 + (y - top) * scale]);
  // An explicit authored sample revision, not a change to the seed algorithm.
  // Corner cutting plus bounded local headlands becomes the actual source ring.
  const rounded: Coordinate[] = fitted.flatMap((a, i) => { const b = fitted[(i + 1) % fitted.length]; return [[a[0] * .8 + b[0] * .2, a[1] * .8 + b[1] * .2], [a[0] * .2 + b[0] * .8, a[1] * .2 + b[1] * .8]] as Coordinate[]; });
  const rnd = random(442), extra = Math.min(rounded.length, 256 - rounded.length), articulated: Coordinate[] = rounded.flatMap((a, i) => {
    if (Math.floor((i + 1) * extra / rounded.length) === Math.floor(i * extra / rounded.length)) return [a];
    const b = rounded[(i + 1) % rounded.length], dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy), offset = Math.min(8, length * .20) * (rnd() * 2 - 1);
    return [a, [(a[0] + b[0]) / 2 - dy / length * offset, (a[1] + b[1]) / 2 + dx / length * offset]] as Coordinate[];
  }).map(p => p.map(fixed) as Coordinate);
  const geography = canonicalAuthoringGeometry({ type: "Polygon", coordinates: [[...articulated, articulated[0]]] });
  assert.ok(articulated.length <= 256); validateAuthoringGeometry(geography, recipe.reference);
  const land = articulated.map((p, i) => `${i ? "L" : "M"}${p.join(",")}`).join("") + "Z";
  const inside = (x: number, y: number) => pointInsideGeographicRing([x, y], articulated);
  function eastCoast(y: number) { const hits: number[] = []; for (let i = 0; i < articulated.length; i++) { const a = articulated[i], b = articulated[(i + 1) % articulated.length]; if ((a[1] > y) !== (b[1] > y)) hits.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); } assert.ok(hits.length); return Math.max(...hits); }
  const city: Coordinate = [eastCoast(950) - 125, 950], mouth: Coordinate = [eastCoast(835) + 10, 835];
  const marks: string[] = [];
  const ridge = [[930, 650, .95]];
  for (const [x, y, size] of ridge) { assert.ok(inside(x, y)); marks.push(`<use href="#mountain-rounded" transform="translate(${x} ${y}) scale(${size})"/>`); }
  const groves: Coordinate[] = [];
  for (let i = 0; i < 2400 && groves.length < 40; i++) {
    const x = 555 + rnd() * 650, y = 690 + rnd() * 350;
    const clustered = [[675, 820, 115, 80], [810, 920, 130, 75], [975, 985, 105, 45]].some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < .6 + rnd() * .55);
    if (!clustered || !inside(x - 45, y) || !inside(x + 45, y) || !inside(x, y - 50) || y < 760 && x > 840 || x > 1050 && y > 850 || groves.some(p => Math.hypot(p[0] - x, (p[1] - y) * 1.6) < 48)) continue;
    groves.push([x, y]);
  }
  for (const [x, y] of groves.sort((a, b) => a[1] - b[1])) marks.push(`<use href="#woodland-broadleaf-grove" transform="translate(${fixed(x)} ${fixed(y)}) scale(${fixed(.22 + rnd() * .14)})"/>`);
  const river = `M1127 665C1161 692 1168 714 1158 745S1172 784 1213 790S1260 818 ${fixed(mouth[0])} ${mouth[1]}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1400" viewBox="0 0 2000 1400">
  <defs>${candidates.map(a => `<g id="${a.id}">${a.svg.replace(/^<svg[^>]+>/, "").replace(/<\/svg>\s*$/, "")}</g>`).join("")}
  <clipPath id="land"><path d="${land}"/></clipPath><pattern id="grain" width="71" height="59" patternUnits="userSpaceOnUse"><path d="M7 9h1m36 23h2m21-19h1M19 49h2" stroke="#928669" stroke-width=".6" opacity=".13"/></pattern>
  <pattern id="waves" width="150" height="95" patternUnits="userSpaceOnUse"><path d="M10 49q11-4 23 0t23 0m50-27q9-3 16 0" fill="none" stroke="#6d9091" stroke-width=".7" opacity=".22"/></pattern></defs>
  <rect width="2000" height="1400" fill="#f4efdd"/><rect width="2000" height="1400" fill="url(#grain)"/>
  <rect x="60" y="190" width="1880" height="1000" fill="#c7d9d6"/><rect x="60" y="190" width="1880" height="1000" fill="url(#waves)"/>
  <path d="${land}" fill="none" stroke="#a9c6c3" stroke-width="16" stroke-linejoin="round"/><path d="${land}" fill="none" stroke="#e8ecda" stroke-width="7" stroke-linejoin="round"/>
  <path d="${land}" fill="#e5ddbc" stroke="#69715e" stroke-width="1.8"/><g clip-path="url(#land)"><path d="${land}" fill="url(#grain)"/>
  <path d="M600 918Q835 888 982 964T${fixed(city[0])} 956" fill="none" stroke="#a28b67" stroke-width="1.5" stroke-dasharray="4 5"/>
  ${marks.join("")}
  <path d="${river}" fill="none" stroke="#d9dfc8" stroke-width="7"/><path d="${river}" fill="none" stroke="#789ca1" stroke-width="3.5"/>
  <use href="#settlement-city" transform="translate(${city.join(" ")}) scale(.58)"/></g>
  <g font-family="Georgia,serif" fill="#4c544b"><text x="1000" y="105" text-anchor="middle" font-size="49" letter-spacing="7">THE FIRST ISLAND</text><text x="1000" y="151" text-anchor="middle" font-size="18" letter-spacing="3">AN ORIGINAL INK-AND-WASH CARTOGRAPHIC STUDY</text>
  <text x="1010" y="438" text-anchor="middle" font-size="22" letter-spacing="3" transform="rotate(9 1010 438)">THE HIGH COUNTRY</text>
  <text x="${city[0]}" y="1000" text-anchor="middle" font-size="23">Harbor city</text><text x="650" y="698" text-anchor="middle" font-size="18" font-style="italic" letter-spacing="1.4">The greenward woods</text>
  <text x="1230" y="734" font-size="18" font-style="italic" fill="#5f7d7d">Silverwater</text><text x="1600" y="1053" text-anchor="middle" font-size="27" font-style="italic" letter-spacing="3" fill="#6a8587">The open sea</text></g>
  <g transform="translate(1750 350)" fill="none" stroke="#6a7669" stroke-width="1.3"><circle r="55"/><circle r="45"/><path d="M0-78 12-12 78 0 12 12 0 78-12 12-78 0-12-12Z"/><path d="M0-78 0 0 12-12Z M78 0 0 0 12 12Z M0 78 0 0-12 12Z M-78 0 0 0-12-12Z" fill="#6a7669"/><text y="-94" text-anchor="middle" fill="#4c544b" stroke="none" font-family="Georgia,serif" font-size="23">N</text></g>
  <g fill="none" stroke="#a39c80"><rect x="42" y="173" width="1916" height="1034"/><rect x="52" y="183" width="1896" height="1014" stroke-width=".6"/></g>
  <g font-family="Georgia,serif" fill="#6c705f" text-anchor="middle"><text x="1000" y="1260" font-size="22">One source coastline · Original illustrated subjects · Clear places and labels</text><text x="1000" y="1300" font-size="17">Revised three-subject study, with retained originals and editable geographic source.</text><text x="1000" y="1340" font-size="15" letter-spacing="1">INTERNAL ART DIRECTION / NOT CANON / NOT APPLICATION ACCEPTANCE EVIDENCE</text></g></svg>`;
  await writeFile(`${output}/first-island.svg`, svg);
  const png = await sharp(Buffer.from(svg)).png().toBuffer(); await writeFile(`${output}/first-island.png`, png);
  await sharp(png).grayscale().png().toFile(`${output}/first-island-grayscale.png`);
  await sharp(png).resize(600, 420).png().toFile(`${output}/first-island-600.png`);
  await writeFile(`${output}/sample-geography.geojson`, `${JSON.stringify({ type: "Feature", properties: { purpose: "Disposable art study; explicit source revision of generated base; no permanent canon" }, geometry: geography }, null, 2)}\n`);
  for (const a of candidates) for (const size of [64, 96]) {
    await sharp(Buffer.from(a.svg)).resize(size, size, { fit: "contain", background: "#f4efdd" }).png().toFile(`${output}/thumbnails/${a.id}-${size}.png`);
  }
  const crops = [ ["mountains", 660, 400, 580, 405], ["woodland", 520, 685, 600, 365], ["city-river-label", 1060, 650, 430, 390], ["coastline", 380, 250, 650, 290] ] as const;
  for (const [name, left, top, width, height] of crops) await sharp(png).extract({ left, top, width, height }).png().toFile(`${output}/details/${name}.png`);
  const files = [...candidates.map(a => ({ id: a.id, revision: a.revision, file: `${assets}/${a.id}-${a.revision}.svg`, sha256: hash(a.svg), viewBox: a.svg.match(/viewBox="([^"]+)"/)![1] }))];
  await writeFile(`${output}/sample-provenance.json`, `${JSON.stringify({ format: "serrian-ux0a-art-study-v2", purpose: "Independent small-subset re-review; no application readiness claim", reviewedBase: "e6f521a35bc94a27e33af422742d86619b5f1d8c", artworkMethod: "Codex-assisted original code-authored SVG; no downloaded/traced external artwork", approval: "Pending independent review of this exact revision", libraryExpansionApproved: false, recipe, sourceRevision: { method: "Explicit fitted authoring revision: 20/80 corner cutting followed by bounded normal-displaced edge midpoints; actual source ring, not a decorative duplicate", vertices: articulated.length, canonicalGeometrySha256: hash(JSON.stringify(geography)), sharedCoastAndMask: true }, assets: files, png: { file: "first-island.png", width: 2000, height: 1400, sha256: hash(png) }, city, river, groves: groves.length }, null, 2)}\n`);
  console.log(JSON.stringify({ output, subjects: candidates.length, sourceVertices: articulated.length, imageSha256: hash(png), city, mouth, groves: groves.length }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
