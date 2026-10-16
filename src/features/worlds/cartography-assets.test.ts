import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { assetReference, islandAssets } from "./island-assets";
import { defaultPresentation, drawingSchema, drawingSchemaV1, presentationSchemaV1, validateDrawings, validatePresentation, moveDrawing, terrainMarks, type MapDrawing, type TerrainDrawing } from "./cartography";

const mountain = islandAssets.find(a => a.id === "mountain-rounded")!, city = islandAssets.find(a => a.id === "settlement-city")!;
const placed = (): MapDrawing => ({ version: 2, id: randomUUID(), name: "City", archived: false, geographyId: randomUUID(), type: "symbol", kind: "city", point: { x: 600, y: 700 }, scale: .7, rotation: 0, style: "colored", role: "place", assetRef: assetReference(city) });
const painted = (): TerrainDrawing => ({ version: 2, id: randomUUID(), name: "Painted mountains", archived: false, geographyId: null, type: "terrain", kind: "mountains", points: [{ id: randomUUID(), x: 500, y: 300 }, { id: randomUUID(), x: 800, y: 600 }], radius: 60, spacing: 80, density: 1, seed: 527, assetRefs: [assetReference(mountain)] });

test("v2 placed/painted sources retain identity, exact revisions and all source points through movement", () => {
  for (const source of [placed(), painted()]) {
    validateDrawings([source]);
    assert.deepEqual(drawingSchema.parse(source), source);
    const moved = moveDrawing(source, 50, -20);
    assert.equal(moved.id, source.id);
    assert.equal(moved.version, 2);
    if (moved.version !== 2 || source.version !== 2) throw Error("Expected v2");
    if (moved.type === "terrain" && source.type === "terrain") { assert.deepEqual(moved.assetRefs, source.assetRefs); assert.deepEqual(moved.points.map(p => p.id), source.points.map(p => p.id)); }
    if (moved.type === "symbol" && source.type === "symbol") assert.deepEqual(moved.assetRef, source.assetRef);
    validateDrawings([moved]);
  }
});

test("catalog validation rejects unknown revisions, counterfeit place roles and unsuitable brush assets", () => {
  const source = placed(); if (source.type !== "symbol" || source.version !== 2) throw Error("Expected placed artwork");
  for (const bad of [{ ...source, geographyId: null }, { ...source, role: "decoration" as const }, { ...source, kind: "mountain" as const }, { ...source, assetRef: { ...source.assetRef, assetRevision: 999 } }]) assert.throws(() => validateDrawings([bad]));
  const brush = painted(); if (brush.type !== "terrain" || brush.version !== 2) throw Error("Expected painted artwork");
  for (const bad of [{ ...brush, geographyId: randomUUID() }, { ...brush, assetRefs: [assetReference(city)] }, { ...brush, assetRefs: [assetReference(mountain), assetReference(mountain)] }]) assert.throws(() => validateDrawings([bad]));
  for (const assetRef of [{ ...source.assetRef, svg: "<script/>" }, { ...source.assetRef, assetRevision: 0 }, { ...source.assetRef, libraryId: "https://example.com/image.svg" }]) assert.equal(drawingSchema.safeParse({ ...source, assetRef }).success, false);
});

test("v1 remains its own strict source contract and is never silently upgraded", () => {
  const next = painted(); if (next.version !== 2) throw Error("Expected v2");
  const { assetRefs: refs, ...fields } = next, legacy = { ...fields, version: 1 as const };
  assert.equal(refs.length, 1);
  validateDrawings([legacy]); assert.deepEqual(drawingSchema.parse(legacy), legacy);
  assert.deepEqual(drawingSchemaV1.parse(legacy), legacy);
  assert.equal(drawingSchemaV1.safeParse(next).success, false);
  assert.equal(drawingSchema.safeParse({ ...legacy, assetRefs: refs }).success, false);
  assert.deepEqual(terrainMarks(legacy), terrainMarks(structuredClone(legacy)));
  const presentation = defaultPresentation(); validatePresentation(presentation); assert.deepEqual(presentationSchemaV1.parse(presentation), presentation);
  assert.equal(presentationSchemaV1.safeParse({ ...presentation, styleRef: { id: "island-ink-wash", revision: 1 } }).success, false);
});

test("pinned v2 style references reject unavailable revisions and retain explicit legacy styles", () => {
  const presentation = { ...defaultPresentation(), version: 2 as const, styleRef: { id: "island-ink-wash", revision: 1 } };
  validatePresentation(presentation);
  assert.throws(() => validatePresentation({ ...presentation, styleRef: { ...presentation.styleRef, revision: 99 } }), /unavailable/);
  assert.equal(defaultPresentation().version, 1);
  assert.equal(defaultPresentation().style, "parchment");
});
