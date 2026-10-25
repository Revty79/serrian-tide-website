import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { TERRAIN, TILE_COUNT, applyPatch, createGrid, finishPatch, fitTerrain, readTile, sculpt, terrainCommandSchema, terrainPoint, zoomTerrain, terrainGeometry, terrainSettingsSchema } from "./terrain";
import { parseTerrainRecovery } from "./terrain-recovery";
test("blank terrain and tile round trips preserve numerical values and independent dimensions", () => {
  const grid = createGrid(-500); grid[0] = -12000; grid[639] = 12000; grid[grid.length - 1] = 123;
  const rebuilt = createGrid(-500, Array.from({ length: TILE_COUNT }, (_, i) => readTile(grid, i)));
  assert.deepEqual(rebuilt, grid); assert.notEqual(TERRAIN.displayWidth, TERRAIN.width);
});
test("bounded sculpting, smoothing and undo/redo preserve every unrelated cell", () => {
  for (const tool of ["raise", "lower", "smooth"] as const) {
    const grid = createGrid(500); grid[192 * TERRAIN.width + 320] = 5000; const original = grid.slice(), before = new Map<number, number>();
    const touched = sculpt(grid, 320, 192, { tool, radius: 32, strength: 300 }, before), patch = finishPatch(grid, before), result = grid.slice();
    assert.ok(patch.indices.length); assert.ok(touched.size < TILE_COUNT);
    for (let i = 0; i < grid.length; i++) if (Math.hypot(i % TERRAIN.width - 320, Math.floor(i / TERRAIN.width) - 192) >= 32) assert.equal(grid[i], original[i]);
    applyPatch(grid, patch, "before"); assert.deepEqual(grid, original); applyPatch(grid, patch, "after"); assert.deepEqual(grid, result);
  }
});
test("smooth is stable on constant fields, crosses tile borders and never wraps edges", () => {
  const grid = createGrid(100), before = new Map<number, number>();
  sculpt(grid, 32, 32, { tool: "smooth", radius: 64, strength: 1000 }, before); assert.equal(before.size, 0);
  grid[32 * TERRAIN.width + 32] = 9000; sculpt(grid, 32, 32, { tool: "smooth", radius: 5, strength: 1000 }, before);
  assert.ok(grid[32 * TERRAIN.width + 31] > 100); assert.ok(grid[31 * TERRAIN.width + 32] > 100);
  const original = grid.slice(); sculpt(grid, 0, 0, { tool: "lower", radius: 12, strength: 1000 }, new Map());
  assert.equal(grid[grid.length - 1], original[original.length - 1]); assert.equal(grid[639], original[639]);
});
test("height bounds, outside pointers, malformed and duplicate tiles fail safely", () => {
  const grid = createGrid(12000); sculpt(grid, 5, 5, { tool: "raise", radius: 10, strength: 1000 }, new Map()); assert.equal(Math.max(...grid.subarray(0, 100)), 12000);
  assert.equal(sculpt(grid, NaN, 0, { tool: "lower", radius: 4, strength: 200 }, new Map()).size, 0);
  const tile = readTile(grid, 0), command = { action: "save", requestId: "00000000-0000-4000-8000-000000000001", mapId: "00000000-0000-4000-8000-000000000002", revision: 1, seaLevel: 0, tiles: [tile] };
  assert.ok(terrainCommandSchema.safeParse(command).success);
  for (const tiles of [[tile, tile], [{ ...tile, x: 32 }], [{ ...tile, samples: [1] }], [{ ...tile, samples: new Array(1024).fill(30001) }], [{ ...tile, samples: new Array(1024).fill(1.5) }]]) assert.equal(terrainCommandSchema.safeParse({ ...command, tiles }).success, false);
});
test("fit and cursor-anchored zoom keep grid coordinates distinct from display space", () => {
  const view = fitTerrain(1000, 600), point = terrainPoint(view, 500, 300); assert.equal(point.x, 320); assert.equal(point.y, 192);
  const next = zoomTerrain(view, 337, 205, 2); assert.deepEqual(terrainPoint(next, 337, 205), terrainPoint(view, 337, 205));
});
test("maximum-radius CPU brush benchmark and full-grid incremental tile preservation", () => {
  const grid = createGrid(-500), before = new Map<number, number>(), times: number[] = [];
  for (let i = 0; i < 100; i++) { const start = performance.now(); sculpt(grid, 64 + i % 8 * 64, 64 + i % 4 * 64, { tool: "smooth", radius: 64, strength: 300 }, before); times.push(performance.now() - start); }
  const rebuilt = createGrid(-500, Array.from({ length: TILE_COUNT }, (_, i) => readTile(grid, i))); assert.deepEqual(rebuilt, grid);
  console.log(JSON.stringify({ benchmark: "64-sample smooth brush", count: times.length, meanMs: times.reduce((a, b) => a + b, 0) / times.length, maxMs: Math.max(...times) }));
});
test("custom proportions, distance frame, grid sizes, independent elevation ranges and wrapped brushes", () => {
  const settings = terrainSettingsSchema.parse({ gridWidth: 96, gridHeight: 64, widthKm: 900, heightKm: 300, wrap: true, minElevation: -800, maxElevation: 1000 }), shape = terrainGeometry(settings), grid = createGrid(-500, [], shape);
  sculpt(grid, 0, 32, { tool: "raise", radius: 12, strength: 1000 }, new Map(), shape);
  assert.ok(grid[32 * shape.width + 95] > -500, "west-edge brush reaches the east edge");
  assert.equal(grid[32 * shape.width + 40], -500); assert.equal(shape.displayWidth / shape.displayHeight, 3); assert.equal(shape.width / shape.height, 1.5);
  const tiles = Array.from({ length: 6 }, (_, i) => readTile(grid, i, shape)); assert.deepEqual(createGrid(-500, tiles, shape), grid);
  assert.throws(() => createGrid(-500, [{ ...tiles[0], x: 3 }], shape)); assert.throws(() => createGrid(-500, [{ ...tiles[0], samples: new Array(1024).fill(1001) }], shape));
  assert.equal(terrainSettingsSchema.safeParse({ gridWidth: 95 }).success, false);
});
test("recovery rejects malformed samples, duplicate tiles and another map identity", () => {
  const value = { key: "world:map", revision: 1, seaLevel: 0, tiles: [readTile(createGrid(-500), 0)], savedAt: new Date().toISOString() };
  assert.equal(parseTerrainRecovery(value, value.key).revision, 1);
  assert.throws(() => parseTerrainRecovery(value, "world:other-map")); assert.throws(() => parseTerrainRecovery({ ...value, tiles: [...value.tiles, ...value.tiles] }, value.key));
});
