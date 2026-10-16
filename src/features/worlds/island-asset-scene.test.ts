import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { assetTerrainMarks } from "./island-asset-scene";
import { assetReference, islandAssets } from "./island-assets";
import { CartographyScene } from "./cartography-scene";
import { defaultPresentation, type MapDrawing, type TerrainDrawing } from "./cartography";
import type { MapDraft } from "./atlas";
import {readFile} from "node:fs/promises";
import {islandArtwork} from "./island-artwork-source";

const mountain = islandAssets.find(a => a.id === "mountain-rounded")!, city = islandAssets.find(a => a.id === "settlement-city")!;
const terrain = (): Extract<TerrainDrawing, { version: 2 }> => ({ version: 2, type: "terrain", id: randomUUID(), name: "Illustrated mountains", kind: "mountains", archived: false, geographyId: null, points: [{ id: randomUUID(), x: 400, y: 300 }, { id: randomUUID(), x: 700, y: 450 }], radius: 60, spacing: 70, density: 2, seed: 425, assetRefs: [assetReference(mountain)] });
const symbol = (): MapDrawing => ({ version: 2, type: "symbol", id: randomUUID(), name: "Illustrated city", kind: "city", archived: false, geographyId: randomUUID(), point: { x: 1200, y: 750 }, scale: .7, rotation: 8, style: "colored", role: "place", assetRef: assetReference(city) });
function render(drawings: MapDrawing[]) {
  const draft: MapDraft = { name: "Retained artwork", description: "", scope: "regional", features: [], geographies: [], drawings, presentation: defaultPresentation() };
  return renderToStaticMarkup(createElement("svg", { xmlns: "http://www.w3.org/2000/svg" }, createElement(CartographyScene, { draft, id: "proof", editable: false })));
}
test("v2 rendering shares one exact original SVG image definition per reference across retained drawings", async t => {
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL)=>new Response(await readFile(`public${String(input)}`,"utf8")));
  for(const asset of [mountain,city])await islandArtwork.ensure(asset);
  const first = symbol(), second = { ...first, id: randomUUID() }, markup = render([first, second, terrain()]);
  assert.equal((markup.match(/id="proof-asset-serrian-atlas-island-1-settlement-city-1"/g) ?? []).length, 1);
  assert.equal((markup.match(/href="#proof-asset-serrian-atlas-island-1-settlement-city-1"/g) ?? []).length, 2);
  assert.ok(markup.includes('data-asset-revision="mountain-rounded:1"'));
  const images=[...markup.matchAll(/href="(data:image\/svg\+xml[^\"]+)"/g)].map(match=>decodeURIComponent(match[1].slice(match[1].indexOf(",")+1).replaceAll("&amp;","&").replaceAll("&#x27;","'")));
  assert.equal(images.length,2);assert.ok(images.some(svg=>svg.includes(islandArtwork.read(mountain).svg!)));assert.ok(images.some(svg=>svg.includes(islandArtwork.read(city).svg!)));
  assert.ok(markup.includes('data-illustrated-terrain="true"'));
  assert.ok(!/href="#proof-mountains-\d/.test(markup));
});
test("missing exact revisions produce a retained-data warning with no substituted illustration", () => {
  const placed = symbol(); if (placed.version !== 2 || placed.type !== "symbol") throw Error("Expected v2 symbol");
  const markup = render([{ ...placed, assetRef: { ...placed.assetRef, assetRevision: 999 } }]);
  assert.ok(markup.includes("data-missing-artwork"));
  assert.ok(markup.includes("Illustration unavailable"));
  assert.ok(!markup.includes('data-asset-revision="settlement-city:1"'));
  assert.ok(!markup.includes("<image"));
});
test("asset scattering is reproducible across reopen and preserves complete source data", () => {
  const source = terrain(), before = structuredClone(source), first = assetTerrainMarks(source), reopened = assetTerrainMarks(structuredClone(source));
  assert.deepEqual(first, reopened); assert.deepEqual(source, before);
  assert.notDeepEqual(first, assetTerrainMarks({ ...source, seed: source.seed + 1 }));
  assert.ok(first.every(mark => mark.reference.assetId === "mountain-rounded" && mark.reference.assetRevision === 1 && Number.isFinite(mark.scale) && mark.scale > 0));
  assert.ok(first.every((mark, i) => i === 0 || mark.y >= first[i - 1].y));
});
