import assert from "node:assert/strict";
import test from "node:test";
import { samplePinnedTerrainPoint, type NumericalSampleSource } from "./terrain-numerical-sampling";
import type { TerrainGeometry } from "./terrain";

const shape: TerrainGeometry = { width: 4, height: 4, tileSize: 32, displayWidth: 4, displayHeight: 4, min: -1000, max: 30000, wrap: false };
const root = (revision: number, wrap = false): NumericalSampleSource => ({ id: "root", revision, parentId: null, parentRevision: null, shape: { ...shape, wrap }, frame: { x: 0, y: 0, width: 4, height: 4 }, at: async (x, y) => 10 * x + 100 * y + (revision === 1 ? 0 : 5000) });
test("native numerical sampling preserves analytic interpolation, edge clamping and World wrapping", async () => {
  assert.equal(await samplePinnedTerrainPoint({ x: .25, y: .5 }, "root", 1, shape, async (_id, rev) => root(rev)), 52.5);
  assert.equal(await samplePinnedTerrainPoint({ x: 4, y: 4 }, "root", 1, shape, async (_id, rev) => root(rev)), 330);
  assert.equal(await samplePinnedTerrainPoint({ x: 3.75, y: 1 }, "root", 1, { ...shape, wrap: true }, async (_id, rev) => root(rev, true)), 107.5);
});
test("a finer boundary samples its explicitly pinned earlier parent revision", async () => {
  const calls: string[] = [];
  const fine: NumericalSampleSource = { id: "fine", revision: 7, parentId: "root", parentRevision: 1, shape: { ...shape, displayWidth: 2, displayHeight: 2 }, frame: { x: 1, y: 1, width: 2, height: 2 }, at: async (x, y) => 1000 + 10 * x + 100 * y };
  const value = await samplePinnedTerrainPoint({ x: 2.75, y: 1.5 }, "fine", 7, shape, async (id, rev) => { calls.push(`${id}:${rev}`); return id === "fine" ? fine : root(rev); });
  assert.equal(value, 655);
  assert.ok(calls.includes("root:1")); assert.ok(!calls.includes("root:2"));
});
