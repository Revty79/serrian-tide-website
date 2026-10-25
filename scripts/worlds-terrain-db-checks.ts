import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { TERRAIN, TILE_COUNT, createGrid, readTile, sculpt, finishPatch, applyPatch } from "../src/features/worlds/terrain";
export async function checkTerrainDatabase({ pool, world, foreign }: { pool: pg.Pool; world: string; foreign: string }) {
  const { changeTerrain, getTerrain } = await import("../src/features/worlds/terrain-service");
  const mapId = randomUUID(), create = { action: "create", requestId: mapId, name: "Database terrain preservation", initial: "ocean" };
  assert.equal((await changeTerrain("world-god", world, create)).id, mapId);
  await changeTerrain("world-god", world, create); assert.equal((await pool.query("select count(*)::int n from world_map_canvas where map_id=$1", [mapId])).rows[0].n, 1);
  for (const actor of ["other-god", "world-admin", "world-player"]) await assert.rejects(getTerrain(actor, world), (e: unknown) => (e as { status: number }).status === (actor === "world-player" ? 403 : 404));
  assert.equal((await getTerrain("world-admin", world, { review: true, mapId })).document?.canEdit, false);
  await assert.rejects(getTerrain("world-god", world, { ordinary: true, mapId }), (e: unknown) => (e as { status: number }).status === 404);
  await assert.rejects(changeTerrain("world-god", foreign, { ...create, requestId: randomUUID() }), (e: unknown) => (e as { status: number }).status === 404);
  const grid = createGrid(-500), tile = readTile(grid, 0); tile.samples[0] = 1000;
  const command = { action: "save", requestId: randomUUID(), mapId, revision: 1, seaLevel: 25, tiles: [tile] };
  assert.equal((await changeTerrain("world-god", world, command)).revision, 2);
  assert.equal((await changeTerrain("world-god", world, command)).revision, 2, "lost-response retry is idempotent");
  await assert.rejects(changeTerrain("world-god", world, { ...command, seaLevel: 26 }), (e: unknown) => (e as { status: number }).status === 409);
  const competing = await Promise.allSettled([0, 1].map(i => changeTerrain("world-god", world, { ...command, requestId: randomUUID(), revision: 2, seaLevel: 30 + i })));
  assert.equal(competing.filter(x => x.status === "fulfilled").length, 1); assert.equal(competing.filter(x => x.status === "rejected" && x.reason.status === 409).length, 1);
  const loaded = (await getTerrain("world-god", world, { mapId })).document!;
  assert.equal(loaded.revision, 3); assert.equal(loaded.tiles.length, 1); const rebuilt = createGrid(loaded.baseElevation, loaded.tiles); assert.equal(rebuilt[0], 1000); assert.equal(rebuilt[rebuilt.length - 1], -500);
  const before = new Map<number, number>(); for (let y = 30; y < TERRAIN.height; y += 60) for (let x = 30; x < TERRAIN.width; x += 60) sculpt(rebuilt, x, y, { tool: "raise", radius: 64, strength: 1000 }, before);
  const patch = finishPatch(rebuilt, before), whole = rebuilt.slice();
  applyPatch(rebuilt, patch, "before"); assert.deepEqual(rebuilt, createGrid(loaded.baseElevation, loaded.tiles)); applyPatch(rebuilt, patch, "after"); assert.deepEqual(rebuilt, whole);
  const large = { action: "save", requestId: randomUUID(), mapId, revision: 3, seaLevel: 100, tiles: Array.from({ length: TILE_COUNT }, (_, i) => readTile(rebuilt, i)) };
  const start = performance.now(); await changeTerrain("world-god", world, large); const saveMs = performance.now() - start;
  const reopened = (await getTerrain("world-god", world, { mapId })).document!; assert.deepEqual(createGrid(reopened.baseElevation, reopened.tiles), whole);
  const count = await pool.query("select count(*)::int n from world_terrain_version where terrain_id=(select terrain_id from world_map_canvas where map_id=$1)", [mapId]); assert.equal(count.rows[0].n, 4);
  for (const query of ["update world_terrain_tile set sha256=sha256 where terrain_id=(select terrain_id from world_map_canvas where map_id=$1)", "delete from world_terrain_version where terrain_id=(select terrain_id from world_map_canvas where map_id=$1)", "update world_terrain set revision=999 where id=(select terrain_id from world_map_canvas where map_id=$1)", "update world_terrain set base_elevation=1 where id=(select terrain_id from world_map_canvas where map_id=$1)"]) await assert.rejects(pool.query(query, [mapId]));
  // A malformed tile after a valid tile must not accept a partial revision.
  await assert.rejects(changeTerrain("world-god", world, { ...large, requestId: randomUUID(), revision: 4, tiles: [large.tiles[0], { ...large.tiles[1], samples: [1] }] }));
  assert.equal((await getTerrain("world-god", world, { mapId })).document?.revision, 4);
  assert.equal((await pool.query("select count(*)::int n from world_terrain_version where terrain_id=(select terrain_id from world_map_canvas where map_id=$1)", [mapId])).rows[0].n, 4);
  console.log("PASS terrain database", JSON.stringify({ fullGridSaveMs: saveMs, tiles: TILE_COUNT, samples: whole.length, payloadBytes: Buffer.byteLength(JSON.stringify(large)), immutableHistory: true, unrelatedCellsExact: true }));
}
