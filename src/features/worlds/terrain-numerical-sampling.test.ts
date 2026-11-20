import assert from "node:assert/strict";
import test from "node:test";
import { samplePinnedTerrainPoint, samplePinnedTerrainPointReady, type NumericalSampleSource } from "./terrain-numerical-sampling";
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

test("verified ready samples preserve analytic heights without a promise on the hot path", async () => {
  const readyRoot = (revision: number, wrap = false): NumericalSampleSource => ({ ...root(revision, wrap), at: (x, y) => 10 * x + 100 * y + (revision === 1 ? 0 : 5000) });
  const load = (_id: string, revision: number) => readyRoot(revision);
  assert.equal(samplePinnedTerrainPointReady({ x: .25, y: .5 }, "root", 1, shape, load), 52.5);
  assert.equal(samplePinnedTerrainPointReady({ x: 4, y: 4 }, "root", 1, shape, load), 330);
  assert.equal(samplePinnedTerrainPointReady({ x: 3.75, y: 1 }, "root", 1, { ...shape, wrap: true }, (_id, rev) => readyRoot(rev, true)), 107.5);
  const fine: NumericalSampleSource = { id: "fine", revision: 7, parentId: "root", parentRevision: 1, shape: { ...shape, displayWidth: 2, displayHeight: 2 }, frame: { x: 1, y: 1, width: 2, height: 2 }, at: (x, y) => 1000 + 10 * x + 100 * y };
  const pins: string[] = [], read = (id: string, revision: number) => { pins.push(`${id}:${revision}`); return id === "fine" ? fine : readyRoot(revision); };
  assert.equal(samplePinnedTerrainPointReady({ x: 2.75, y: 1.5 }, "fine", 7, shape, read), 655);
  assert(pins.includes("root:1")); assert(!pins.includes("root:2"));
  const ordinary = samplePinnedTerrainPoint({ x: .25, y: .5 }, "root", 1, shape, async (_id, rev) => readyRoot(rev));
  assert(ordinary instanceof Promise); assert.equal(await ordinary, 52.5);
});

test("mixed ready and pending native samples retain parent refusal and failed-read behavior", async () => {
  const source: NumericalSampleSource = { ...root(1), at: (x, y) => x % 2 ? Promise.resolve(10 * x + 100 * y) : 10 * x + 100 * y };
  assert.equal(await samplePinnedTerrainPointReady({ x: .25, y: .5 }, "root", 1, shape, () => source), 52.5);
  assert.equal(await samplePinnedTerrainPointReady({ x: .25, y: .5 }, "root", 1, shape, async () => source), 52.5);
  const missing: NumericalSampleSource = { ...source, parentId: "root", parentRevision: null };
  assert.throws(() => samplePinnedTerrainPointReady({ x: 4, y: 4 }, "fine", 7, shape, () => missing), /parent revision is missing/);
  await assert.rejects(samplePinnedTerrainPoint({ x: 4, y: 4 }, "fine", 7, shape, async () => missing), /parent revision is missing/);
  const unavailable: NumericalSampleSource = { ...source, at: () => Promise.reject(Error("unavailable verified object")) };
  await assert.rejects(Promise.resolve(samplePinnedTerrainPointReady({ x: .25, y: .5 }, "root", 1, shape, () => unavailable)), /unavailable verified object/);
});
