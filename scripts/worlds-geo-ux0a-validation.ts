/** Service/SQL proof in the receipt-verified new compatibility target only. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ownedPool, ux0aEnvironment, ux0aSnapshot, UX0A_DIRECTORY } from "./worlds-geo-ux0a-harness";
import { assetReference, islandAssets } from "../src/features/worlds/island-assets";
import { defaultPresentation, type MapDrawing } from "../src/features/worlds/cartography";
import { draftOf } from "../src/features/worlds/atlas";

async function main() {
  const e = await ux0aEnvironment(), pool = await ownedPool(e, "compat"), fixture = JSON.parse(await readFile(path.join(UX0A_DIRECTORY, "legacy-fixture.json"), "utf8"));
  process.env.DATABASE_URL = e.compat; process.env.SERRIAN_RASTER_ROOT = e.assetRoot;
  const service = await import("../src/features/worlds/atlas-service"), history = await import("../src/features/worlds/map-state-service"), { pool: applicationPool } = await import("../src/db");
  const results: string[] = [];
  const check = async (name: string, work: () => Promise<void>) => { await work(); results.push(name); console.log("PASS", name); };
  try {
    const mountain = islandAssets.find(a => a.id === "mountain-rounded")!, city = islandAssets.find(a => a.id === "settlement-city")!;
    const terrain: MapDrawing = { version: 2, id: randomUUID(), name: "Versioned mountain stroke", archived: false, geographyId: null, type: "terrain", kind: "mountains", points: [{ id: randomUUID(), x: 450, y: 450 }, { id: randomUUID(), x: 700, y: 500 }], radius: 55, spacing: 80, density: 1, seed: 539, assetRefs: [assetReference(mountain)] };
    const placed: MapDrawing = { version: 2, id: randomUUID(), name: "Versioned city", archived: false, geographyId: fixture.city, type: "symbol", kind: "city", point: { x: 1300, y: 750 }, scale: .7, rotation: 5, style: "colored", role: "place", assetRef: assetReference(city) };
    const presentation = { ...defaultPresentation(), version: 2 as const, styleRef: { id: "island-ink-wash", revision: 1 } };
    const oldPayloads = (await pool.query("select id,payload from world_map_state_version order by id")).rows;
    await check("actual SQL validators accept v1/v2 and reject malformed refs, counterfeit metadata, missing places and bad geometry", async () => {
      for (const value of [terrain, placed, ...(fixture.bundle.maps.find((m: { id: string }) => m.id === fixture.map).drawings as MapDrawing[])]) assert.equal((await pool.query("select world_atlas_drawing_valid($1::jsonb) valid", [JSON.stringify(value)])).rows[0].valid, true);
      const bad = [ { ...placed, geographyId: null }, { ...placed, role: null }, { ...placed, role: "arbitrary" }, { ...placed, style: "ink" }, { ...placed, assetRef: null }, { ...placed, assetRef: { ...placed.assetRef, assetRevision: 0 } }, { ...placed, assetRef: { ...placed.assetRef, url: "https://example.invalid/asset" } }, { ...placed, point: { x: 2001, y: 10 } }, { ...terrain, assetRefs: [] }, { ...terrain, assetRefs: [terrain.assetRefs[0], terrain.assetRefs[0]] }, { ...terrain, geographyId: fixture.city }, { ...terrain, density: 99 }, { ...placed, version: 3 } ];
      for (const value of bad) {
        assert.equal((await pool.query("select world_atlas_drawing_valid($1::jsonb) valid", [JSON.stringify(value)])).rows[0].valid, false);
        const id = randomUUID(); await assert.rejects(pool.query("insert into world_atlas_drawing(id,world_id,map_id,geography_id,content) values($1,$2,$3,$4,$5)", [id, fixture.world, fixture.map, value.geographyId, { ...value, id }]), /check constraint/);
      }
      for (const value of [defaultPresentation(), presentation]) assert.equal((await pool.query("select world_atlas_presentation_valid($1::jsonb) valid", [JSON.stringify(value)])).rows[0].valid, true);
      for (const value of [{ ...presentation, styleRef: null }, { ...presentation, styleRef: { id: "island-ink-wash", revision: 0 } }, { ...presentation, styleRef: { id: "island-ink-wash", revision: 1, script: "x" } }, { ...presentation, extra: true }]) assert.equal((await pool.query("select world_atlas_presentation_valid($1::jsonb) valid", [JSON.stringify(value)])).rows[0].valid, false);
    });
    await check("normal save/read preserves old drawings and exact v2 references with independent original historical payloads", async () => {
      let bundle = await service.getAtlas(e.users.owner, fixture.world), map = bundle.maps.find(m => m.id === fixture.map)!;
      const draft = draftOf(map, bundle.geographies); draft.drawings!.push(terrain, placed); draft.presentation = presentation;
      await service.changeAtlas(e.users.owner, fixture.world, { action: "save", id: map.id, revision: map.revision, draft });
      bundle = await service.getAtlas(e.users.owner, fixture.world); map = bundle.maps.find(m => m.id === fixture.map)!;
      assert.deepEqual(map.drawings!.slice(-2), [terrain, placed]); assert.deepEqual(map.presentation, presentation);
      assert.deepEqual((await pool.query("select id,payload from world_map_state_version order by id")).rows, oldPayloads);
      await history.changeMapState(e.users.owner, fixture.world, { action: "create", mapId: map.id, timelineId: fixture.timeline, sourceVersionId: null, baselineRevision: map.revision, details: { name: "New v2 appearance", startYear: 21, endYear: 40, account: "Disposable versioned asset compatibility proof", protected: true } });
      const states = await history.getMapStates(e.users.owner, fixture.world, map.id, fixture.timeline);
      const current = states.states.find(s => s.name === "New v2 appearance")!; assert.ok(current);
      const shown = await history.getMapStates(e.users.owner, fixture.world, map.id, fixture.timeline, { stateId: current.id });
      assert.deepEqual(shown.bundle.maps.find(m => m.id === map.id)!.drawings!.slice(-2), [terrain, placed]);
      const ordinary = await history.getMapStates(e.users.owner, fixture.world, map.id, fixture.timeline, { ordinary: true });
      assert.ok(!ordinary.states.some(s => s.id === current.id));
    });
    await check("server rejects unknown catalog/style revisions and false place roles without partial writes", async () => {
      const bundle = await service.getAtlas(e.users.owner, fixture.world), map = bundle.maps.find(m => m.id === fixture.map)!, draft = draftOf(map, bundle.geographies), before = await ux0aSnapshot(pool);
      for (const drawing of [{ ...placed, id: randomUUID(), role: "decoration" }, { ...placed, id: randomUUID(), assetRef: { ...placed.assetRef, assetRevision: 999 } }, { ...terrain, id: randomUUID(), assetRefs: [placed.assetRef] }]) await assert.rejects(service.changeAtlas(e.users.owner, fixture.world, { action: "save", id: map.id, revision: map.revision, draft: { ...draft, drawings: [...draft.drawings!, drawing] } }));
      await assert.rejects(service.changeAtlas(e.users.owner, fixture.world, { action: "save", id: map.id, revision: map.revision, draft: { ...draft, presentation: { ...presentation, styleRef: { id: "unavailable", revision: 1 } } } }));
      assert.deepEqual(await ux0aSnapshot(pool), before);
    });
    await check("owner/admin/player boundaries and concurrent map saves retain established authoritative behavior", async () => {
      const bundle = await service.getAtlas(e.users.owner, fixture.world), map = bundle.maps.find(m => m.id === fixture.map)!, draft = draftOf(map, bundle.geographies);
      for (const user of [e.users.foreign, e.users.admin, e.users.player]) {
        await assert.rejects(service.getAtlas(user, fixture.world));
        await assert.rejects(service.changeAtlas(user, fixture.world, { action: "save", id: map.id, revision: map.revision, draft }));
      }
      assert.equal((await service.getAtlas(e.users.admin, fixture.world, true)).canEdit, false);
      const race = await Promise.allSettled([0, 1].map(() => service.changeAtlas(e.users.owner, fixture.world, { action: "save", id: map.id, revision: map.revision, draft })));
      assert.equal(race.filter(result => result.status === "fulfilled").length, 1);
      assert.equal(race.filter(result => result.status === "rejected").length, 1);
    });
    for (const row of oldPayloads) assert.deepEqual((await pool.query("select id,payload from world_map_state_version where id=$1", [row.id])).rows[0], row);
    const empty = await ownedPool(e, "empty"); try { assert.equal(Number((await empty.query("select count(*) n from world")).rows[0].n), 0); } finally { await empty.end(); }
    await writeFile(path.join(UX0A_DIRECTORY, "validation-results.json"), JSON.stringify({ passed: true, target: "receipt-verified owned compatibility database", groups: results, priorHistoricalSourcesExact: oldPayloads.length, emptyAcceptanceWorlds: 0, noSharedDatabaseOrBackupAccess: true }, null, 2));
  } finally { await pool.end(); await applicationPool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
