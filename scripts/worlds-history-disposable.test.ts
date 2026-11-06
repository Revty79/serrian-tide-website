/** Stage 7A owned validation. Never reads an env file or connects to a shared target. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type pg from "pg";
import { defaultPresentation } from "../src/features/worlds/cartography";
import { withRegionalEditingFixture, regionalFixtureIds as ids, type RegionalFixture } from "./worlds-regional-editing-fixture";
import {validateWorldsAtlasIntegration} from "./worlds-history-integration-checks";
import {validateNativeCraftPositions} from "./worlds-history-craft-checks";
import {validateNativeComparison} from "./worlds-history-comparison-checks";
import {validateNativeOrigins} from "./worlds-history-origin-checks";
import {validateNativeTownCreation} from "./worlds-history-town-creation-checks";
import {validateNativeFloorCreation} from "./worlds-history-floor-creation-checks";
import {validateNativeTerritories} from "./worlds-history-territory-checks";
import type { NativeManifest } from "../src/features/worlds/native-map-history";
import { terrainCommandSchema, createGrid, terrainGeometry } from "../src/features/worlds/terrain";

const out = path.resolve(process.env.SERRIAN_HISTORY_EVIDENCE ?? "artifacts/history-s7a-database-probe-1");
assert.ok(out.startsWith(path.resolve("artifacts/history-s7a-")));
process.env.SERRIAN_REGIONAL_EDIT_EVIDENCE = out;
let priorRows: Record<string, unknown>;
const priorColumns=new Map<string,string[]>();
async function rows(pool: pg.Pool) {
  const result: Record<string, unknown> = {};
  for (const { tablename } of (await pool.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows) {
    assert.match(tablename, /^[a-z0-9_]+$/);
    const columns=priorColumns.get(tablename),source=columns?'(select '+columns.map(column=>'"'+column+'"').join(',')+' from "'+tablename+'")':'"'+tablename+'"';
    result[tablename] = (await pool.query('select row_to_json(t)::text as value from ' + source + ' t order by row_to_json(t)::text')).rows;
  }
  return result;
}
async function beforeUpgrade(f: RegionalFixture) {
  assert.equal((await f.pool.query("select to_regclass('world_map_state_component') as value")).rows[0].value, null);
  for(const row of (await f.pool.query("select table_name,column_name from information_schema.columns where table_schema='public' order by table_name,ordinal_position")).rows){assert.match(row.table_name,/^[a-z0-9_]+$/);assert.match(row.column_name,/^[a-z0-9_]+$/);const names=priorColumns.get(row.table_name)??[];names.push(row.column_name);priorColumns.set(row.table_name,names);}
  priorRows = await rows(f.pool);
  f.runPostgres("pg_dump", ["-Fc", "-f", path.join(f.out, "before-0158.dump"), "--dbname", f.databaseUrl]);
}
async function validate(f: RegionalFixture) {
  const uri = new URL(f.databaseUrl);
  assert.equal(uri.hostname, "127.0.0.1"); assert.notEqual(uri.port, "5432");
  assert.equal(process.env.DATABASE_URL, f.databaseUrl);
  assert.ok(path.resolve(f.root).startsWith(path.join(out, "owned-temp") + path.sep));
  const after = await rows(f.pool);
  assert.deepEqual(Object.fromEntries(Object.keys(priorRows).map(k => [k, after[k]])), priorRows);
  const timeline = (await f.pool.query("select id from world_timeline where world_id=$1 and is_primary", [f.world])).rows[0].id as string;
  const component = randomUUID(), payload = { numericalProbe: "immutable native source" };
  await f.pool.query("insert into world_map_state_component(id,world_id,kind,content_hash,payload,author_id) values($1,$2,'terrain',$3,$4,'world-god')", [component, f.world, createHash("sha256").update(JSON.stringify(payload)).digest("hex"), payload]);
  const envelope = (targetId: string) => ({
    name: "Native history numerical probe", description: "", scope: "world", features: [], drawings: [], geographies: [], presentation: defaultPresentation(),
    nativeAtlas: { version: 1, target: { kind: "terrain", id: targetId }, resources: [{ key: "terrain", kind: "terrain", componentId: component }], dependencies: [] } satisfies NativeManifest,
  });
  const base = randomUUID();
  async function version(client: pg.PoolClient, id: string, targetId: string, stateId: string | null, start: number | null, end: number | null, source: string | null) {
    await client.query("insert into world_map_state_version(id,world_id,map_id,state_id,timeline_id,source_version_id,baseline_revision,name,start_year,end_year,account,protected,archived,payload,author_id) values($1,$2,$3,$4,$5,$6,1,'Native history numerical probe',$7,$8,'Explicit owned test source',false,false,$9,'world-god')", [id, f.world, ids.parent, stateId, timeline, source, start, end, envelope(targetId)]);
    await client.query("insert into world_map_state_component_ref(version_id,world_id,map_id,key,component_id) values($1,$2,$3,'terrain',$4)", [id, f.world, ids.parent, component]);
  }
  const connection = await f.pool.connect();
  try { await connection.query("begin"); await version(connection, base, ids.parent, null, null, null, null); await connection.query("commit"); }
  catch (e) { await connection.query("rollback"); throw e; } finally { connection.release(); }
  assert.equal((await f.pool.query("select world_map_state_is_ordinary($1,$2) as value", [base, f.world])).rows[0].value, false);
  async function appearance(targetId: string, first: number, last: number) {
    const client = await f.pool.connect(), stateId = randomUUID(), versionId = randomUUID();
    try {
      await client.query("begin");
      const source = targetId === ids.parent ? base : randomUUID();
      if (targetId !== ids.parent) await version(client, source, targetId, null, null, null, null);
      await client.query("insert into world_map_state(id,world_id,map_id,origin_timeline_id) values($1,$2,$3,$4)", [stateId, f.world, ids.parent, timeline]);
      await version(client, versionId, targetId, stateId, first, last, source);
      await client.query("insert into world_map_state_head(timeline_id,world_id,map_id,state_id,version_id,revision,mode) values($1,$2,$3,$4,$5,1,'authored')", [timeline, f.world, ids.parent, stateId, versionId]);
      await client.query("commit"); return { stateId, versionId };
    } catch (e) { await client.query("rollback"); throw e; } finally { client.release(); }
  }
  await appearance(ids.parent, -100, 0);
  await appearance(ids.parent, 100, 500);
  await assert.rejects(appearance(ids.parent, 0, 100), /coverage overlaps/);
  await appearance(ids.a, 100, 500); // Same geographic anchor, independent native target.
  await assert.rejects(f.pool.query("update world_map_state_component set payload='{}' where id=$1", [component]), /immutable/i);
  const legacy = await import("../src/features/worlds/map-state-service");
  const mapRevision = (await f.pool.query("select revision from world_atlas_map where id=$1", [ids.parent])).rows[0].revision;
  await legacy.changeMapState("world-god", f.world, { action: "create", mapId: ids.parent, timelineId: timeline, sourceVersionId: null, baselineRevision: mapRevision, details: { name: "Retained original historical editor", startYear: 100, endYear: 500, account: "Original historical source contract", protected: false } });
  const old = await legacy.getMapStates("world-god", f.world, ids.parent, timeline, { year: 100 });
  assert.equal(old.states.length, 1); assert.equal(old.selected?.name, "Retained original historical editor");
  await assert.rejects(legacy.getMapStates("world-god", f.world, ids.parent, timeline, { versionId: base, stateId: old.selected!.id }), /unavailable/);
  const missing = structuredClone(envelope(ids.parent)); delete (missing as Partial<typeof missing>).nativeAtlas;
  assert.equal((await f.pool.query("select world_native_map_manifest_valid($1) as value", [{}])).rows[0].value, false);
  assert.equal((await f.pool.query("select world_native_map_manifest_valid($1) as value", [envelope(ids.parent).nativeAtlas])).rows[0].value, true);
  await validateNativeCommands(f, timeline);
  await validateNativeConnections(f,timeline);
  await validateNativeConnectionAuthoring(f,timeline);
  await validateWorldsAtlasIntegration(f,timeline);
  await validateNativeCraftPositions(f,timeline);
  await validateNativeComparison(f,timeline);
  await validateNativeOrigins(f,timeline);
  await validateNativeTownCreation(f,timeline);
  await validateNativeFloorCreation(f,timeline);
  await validateNativeTerritories(f,timeline);
  await(await import("./worlds-history-underground-creation-checks")).validateNativeUndergroundCreation(f,timeline);
  await(await import("./worlds-history-craft-creation-checks")).validateNativeCraftCreation(f,timeline);
  await(await import("./worlds-history-floor-route-checks")).validateNativeFloorRoutes(f,timeline);
  await(await import("./worlds-history-craft-route-checks")).validateNativeCraftRoutes(f,timeline);
  await(await import("./worlds-history-craft-copy-checks")).validateNativeCraftCopy(f,timeline);
  await(await import("./worlds-native-history-context-checks")).validateNativeWorldContexts(f,timeline);
  await(await import("./worlds-history-lifecycle-checks")).validateNativeLifecycle(f,timeline);
  await(await import("./worlds-native-history-linked-families-checks")).validateNativeLinkedFamilies(f,timeline);
  await(await import("./worlds-native-history-added-building-checks")).validateNativeAddedBuilding(f);

  await writeFile(path.join(out, "initial-database.json"), JSON.stringify({ passed: true, populated0157Upgrade: true, preservedPriorPublicTables: Object.keys(priorRows).length, freshReplay: true, canonicalYearZeroNegativeAndInclusiveOverlap: true, independentNativeTargetsAndLegacyCoverage: true, immutableComponents: true, nativeOrdinaryDenied: true, retainedHistoricalEditor: true, sharedDatabaseAccess: false }, null, 2));
}
async function validateNativeCommands(f: RegionalFixture, timelineId: string) {
  const history = await import("../src/features/worlds/native-map-history-service");
  const terrain = await import("../src/features/worlds/terrain-service");
  const target = { kind: "terrain" as const, id: randomUUID() };
  await terrain.changeTerrain("world-god", f.world, { action: "create", requestId: target.id, name: "Historical numerical World", initial: "land", settings: { gridWidth: 64, gridHeight: 64, widthKm: 64, heightKm: 64, wrap: false, minElevation: -10000, maxElevation: 10000 } });
  const prepared = await history.getNativeMapHistory("world-god", f.world, target, timelineId, { year: 100, prepareBaseline: true });
  assert.equal(prepared.coverage, "unknown"); assert.ok(prepared.baselinePin); assert.ok(prepared.sourceSummary!.resources > 10);
  const details = { name: "Numerical World Year 100", startYear: 100, endYear: 100, account: "Exact accepted native source", protected: false };
  const create = { action: "create", requestId: randomUUID(), timelineId, target, sourceVersionId: null, baselinePin: prepared.baselinePin, details };
  const first = await history.changeNativeMapHistory("world-god", f.world, create);
  const versionCount = (await f.pool.query("select count(*)::int n from world_map_state_version")).rows[0].n;
  assert.deepEqual(await history.changeNativeMapHistory("world-god", f.world, create), first);
  assert.equal((await f.pool.query("select count(*)::int n from world_map_state_version")).rows[0].n, versionCount);
  await assert.rejects(history.changeNativeMapHistory("world-god", f.world, { ...create, details: { ...details, name: "Changed request bytes" } }), /newer historical/i);
  const second = await history.changeNativeMapHistory("world-god", f.world, { ...create, requestId: randomUUID(), sourceVersionId: first.versionId, baselinePin: null, details: { ...details, name: "Numerical World Year 500", startYear: 500, endYear: 500 } });
  const refs = async (versionId: unknown) => (await f.pool.query("select key,component_id from world_map_state_component_ref where version_id=$1 order by key", [versionId])).rows;
  assert.deepEqual(await refs(first.versionId), await refs(second.versionId));
  await validateNumericalCopyOnWrite(f, timelineId, target, String(first.id), String(second.id));
  assert.equal((await history.getNativeMapHistory("world-god", f.world, target, timelineId, { year: 300 })).coverage, "unknown");
  assert.equal((await history.getNativeMapHistory("world-god", f.world, target, timelineId, { year: 300, stateId: String(first.id) })).coverage, "unknown");
  const year100 = await history.getNativeMapHistory("world-god", f.world, target, timelineId, { year: 100 });
  assert.equal(year100.selected?.versionId, first.versionId); assert.equal(year100.coverage, "established");
  const concurrent = await Promise.allSettled(["First authoring", "Competing authoring"].map(name => history.changeNativeMapHistory("world-god", f.world, { action: "details", requestId: randomUUID(), timelineId, target, stateId: first.id, revision: 1, details: { ...details, name } })));
  assert.equal(concurrent.filter(v => v.status === "fulfilled").length, 1);
  assert.equal(concurrent.filter(v => v.status === "rejected").length, 1);
  assert.equal((await history.getNativeMapHistory("world-admin", f.world, target, timelineId, { year: 100, review: true })).canEdit, false);
  await assert.rejects(history.getNativeMapHistory("world-god", f.world, target, timelineId, { ordinary: true, year: 100 }), /unavailable/);
  await assert.rejects(history.changeNativeMapHistory("world-admin", f.world, create), /unavailable/);
  const branch = await import("../src/features/worlds/branching-history-service");
  const parentRevision = (await f.pool.query("select revision from world_timeline where id=$1", [timelineId])).rows[0].revision;
  const branchId = await branch.changeTimeline("world-god", f.world, { action: "create", parentRevision, draft: { name: "Independent map interpretation", description: "", explanation: "A deliberately separate account", parentId: timelineId, divergenceYear: 100 } });
  const emptyBranch = await history.getNativeMapHistory("world-god", f.world, target, branchId, { year: 100 });
  assert.equal(emptyBranch.coverage, "unknown"); assert.equal(emptyBranch.states.length, 0); assert.equal(emptyBranch.parentStates.length, 3);
  const primary = (await history.getNativeMapHistory("world-god", f.world, target, timelineId, { year: 100 })).selected!;
  const retain = { action: "retain", requestId: randomUUID(), timelineId: branchId, target, stateId: primary.id, sourceVersionId: primary.versionId, sourceRevision: primary.revision };
  const adopted = await history.changeNativeMapHistory("world-god", f.world, retain);
  assert.deepEqual(await history.changeNativeMapHistory("world-god", f.world, retain), adopted);
  await history.changeNativeMapHistory("world-god", f.world, { action: "details", requestId: randomUUID(), timelineId, target, stateId: primary.id, revision: primary.revision, details: { ...details, name: "Later Primary interpretation" } });
  const retained = (await history.getNativeMapHistory("world-god", f.world, target, branchId, { year: 100 })).selected!;
  assert.equal(retained.versionId, adopted.versionId); assert.equal(retained.mode, "retained");
  await history.changeNativeMapHistory("world-god", f.world, { action: "details", requestId: randomUUID(), timelineId: branchId, target, stateId: retained.id, revision: retained.revision, details: { ...details, name: "Branch-only authoring" } });
  assert.equal((await history.getNativeMapHistory("world-god", f.world, target, timelineId, { year: 100 })).selected!.name, "Later Primary interpretation");
  const later = (await history.getNativeMapHistory("world-god", f.world, target, timelineId, { year: 500 })).selected!;
  await history.changeNativeMapHistory("world-god", f.world, { action: "archive", requestId: randomUUID(), timelineId, target, stateId: later.id, revision: later.revision });
  assert.equal((await history.getNativeMapHistory("world-god", f.world, target, timelineId, { year: 500 })).coverage, "unknown");
  await history.changeNativeMapHistory("world-god", f.world, { action: "restore", requestId: randomUUID(), timelineId, target, stateId: later.id, revision: later.revision + 1 });
  assert.deepEqual(await refs(first.versionId), await refs(second.versionId));
  await writeFile(path.join(out, "native-commands.json"), JSON.stringify({ passed: true, realNumericalSourceCapture: true, copyOnWriteSharedComponents: true, exactCreationRetry: true, changedRetryRejected: true, missingCoverageUnknown: true, optimisticConcurrentDetails: true, explicitBranchRetentionAndIndependentInterpretation: true, archiveRestore: true, ordinaryDenied: true, administratorReviewReadOnly: true, sharedDatabaseAccess: false }, null, 2));
}
async function validateNumericalCopyOnWrite(f: RegionalFixture, timelineId: string, target: { kind: "terrain"; id: string }, earlierId: string, laterId: string) {
  const { withNativeHistoryRead, nativeResource } = await import("../src/features/worlds/native-map-history-context");
  const { readNativeTerrain, nativeHydrologySources } = await import("../src/features/worlds/native-map-history-terrain-read");
  const { withNativeHistoryWrite } = await import("../src/features/worlds/native-map-history-write");
  const { nativeContentRequest } = await import("../src/features/worlds/native-map-history-api");
  const { nativeHistoryUrl } = await import("../src/features/worlds/native-map-history");
  const {getNativeMapHistory}=await import("../src/features/worlds/native-map-history-service");
  const { getTerrain } = await import("../src/features/worlds/terrain-service");
  const before = { timelineId, target, stateId: earlierId, year: 100, edit: false };
  const after = { timelineId, target, stateId: laterId, year: 500, edit: true };
  const read = (scope: typeof before) => withNativeHistoryRead("world-god", f.world, scope, {}, readNativeTerrain);
  const early = await read(before), late = await read(after);
  const earlyGrid = createGrid(early.document.baseElevation, early.document.tiles, terrainGeometry(early.document.settings));
  const lateGrid = createGrid(late.document.baseElevation, late.document.tiles, terrainGeometry(late.document.settings));
  assert.deepEqual(lateGrid, earlyGrid);
  const source = await withNativeHistoryRead("world-god", f.world, after, {}, async (tx, context) => {
    const original = (await nativeResource(tx, context, "hydrology")).payload.sources;
    return { original, pinned: await nativeHydrologySources(tx, context) };
  });
  assert.deepEqual(source.pinned, source.original);
  const samples = new Array<number>(1024).fill(late.document.baseElevation); samples[0] += 150;
  const command = terrainCommandSchema.parse({ action: "save", requestId: randomUUID(), mapId: target.id, revision: late.document.revision, seaLevel: late.document.seaLevel, source: { kind: "manual" }, tiles: [{ x: 0, y: 0, samples }] });
  assert.ok(command.action === "save");
  const execute = () => nativeContentRequest(new Request("http://127.0.0.1" + nativeHistoryUrl(`/api/worlds/${f.world}/terrain`, after), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command) }), "world-god");
  const accepted = await execute(); assert.deepEqual(await execute(), accepted);
  const {nativeOriginalRequestScope}=await import("../src/features/worlds/native-map-history-request-service");
  assert.deepEqual((await nativeOriginalRequestScope("world-god",f.world,command.requestId)).scope,after,"Accepted receipts retain the full original year and source binding");
  await assert.rejects(nativeOriginalRequestScope("other-god",f.world,command.requestId),/unavailable/);
  await assert.rejects(nativeOriginalRequestScope("world-admin",f.world,command.requestId),/unavailable/);
  const preserved = await read(before), edited = await read(after);
  const original = (await getTerrain("world-god", f.world, { mapId: target.id })).document!;
  const values = (document: typeof original) => createGrid(document.baseElevation, document.tiles, terrainGeometry(document.settings));
  assert.deepEqual(values(preserved.document), earlyGrid);
  assert.deepEqual(values(original), earlyGrid);
  const next = values(edited.document); assert.equal(next[0], earlyGrid[0] + 150);
  assert.deepEqual(next.subarray(1), earlyGrid.subarray(1));
  await assert.rejects(withNativeHistoryWrite("world-god", f.world, { ...after, edit: false }, { requestId: randomUUID(), endpoint: "terrain", command }, async () => { throw Error("Read-only callback must not execute"); }), /read-only|Edit This Appearance/);
  const { nativeResourceRevisions } = await import("../src/features/worlds/native-map-history-resources");
  const resourceVersions = await withNativeHistoryRead("world-god", f.world, after, {}, (tx, context) => nativeResourceRevisions(tx, context, "terrain"));
  assert.equal(resourceVersions.length, 2);
  const urlFor = (scope: typeof after, suffix: string) => "http://127.0.0.1" + nativeHistoryUrl(`/api/worlds/${f.world}/${suffix}`, scope);
  const materials = await nativeContentRequest(new Request(urlFor(after, "terrain/materials") + "&terrainMap=" + target.id), "world-god") as {revision:number;layer:import("../src/features/worlds/terrain-materials").TerrainMaterials};
  const materialCommand = { mapId:target.id,requestId:randomUUID(),revision:materials.revision,layer:{...materials.layer,visible:!materials.layer.visible} };
  const saveMaterials = () => nativeContentRequest(new Request(urlFor(after, "terrain/materials"),{method:"POST",body:JSON.stringify(materialCommand)}),"world-god");
  const materialResult = await saveMaterials();assert.deepEqual(await saveMaterials(),materialResult);
  const oldMaterials = await nativeContentRequest(new Request(urlFor(before,"terrain/materials")),"world-god") as typeof materials;
  assert.equal(oldMaterials.layer.visible,materials.layer.visible);
  const {getTerrainMaterials}=await import("../src/features/worlds/terrain-material-service");
  assert.equal((await getTerrainMaterials("world-god",f.world,target.id)).layer.visible,materials.layer.visible);
  const water=await nativeContentRequest(new Request(urlFor(after,"terrain/hydrology")),"world-god") as {revision:number;layer:import("../src/features/worlds/terrain-hydrology").HydroLayer};
  const waterSave={mapId:target.id,requestId:randomUUID(),revision:water.revision,layer:water.layer};
  const waterResult=await nativeContentRequest(new Request(urlFor(after,"terrain/hydrology"),{method:"POST",body:JSON.stringify(waterSave)}),"world-god") as {revision:number};
  assert.equal(waterResult.revision,water.revision+1);
  const { initializeRefinement, gridTile } = await import("../src/features/worlds/terrain-refinement");
  const frame={x:10000,y:10000,width:10000,height:10000},fineGrid=initializeRefinement(next,terrainGeometry(edited.document.settings),{x:0,y:0,width:64000,height:64000},frame,32,32,terrainGeometry(edited.document.settings));
  const bytes=Buffer.alloc(fineGrid.length*2);for(let i=0;i<fineGrid.length;i++)bytes.writeInt16LE(fineGrid[i],i*2);
  const fineId=randomUUID(),fineCreate={action:"create",requestId:fineId,mapId:target.id,parentId:null,parentRevision:edited.document.revision,name:"Dated settlement detail",frame,gridWidth:32,gridHeight:32,previewHash:createHash("sha256").update(bytes).digest("hex")};
  const send=(suffix:string,body:unknown)=>nativeContentRequest(new Request(urlFor(after,suffix),{method:"POST",body:JSON.stringify(body)}),"world-god");
  const created=await send("terrain/refinements",fineCreate);assert.deepEqual(await send("terrain/refinements",fineCreate),created);
  const fineSamples=Array.from(fineGrid);fineSamples[16*32+16]+=25;
  const fineSave={action:"save",mapId:target.id,requestId:randomUUID(),revision:1,seaLevel:edited.document.seaLevel,source:{kind:"manual"},tiles:[{x:0,y:0,samples:fineSamples}]};
  const fineAccepted=await send("terrain/refinements?refinement="+fineId,fineSave);assert.deepEqual(await send("terrain/refinements?refinement="+fineId,fineSave),fineAccepted);
  const inspectSample=async(points:{x:number;y:number}[])=>nativeContentRequest(new Request(urlFor(after,"terrain/refinements?action=sample&points="+encodeURIComponent(JSON.stringify(points)))),"world-god") as Promise<{points:{elevation:number}[]}>;
  assert.equal((await inspectSample([{x:15000,y:15000}])).points[0].elevation,525);
  assert.equal((await inspectSample([{x:19900,y:15000}])).points[0].elevation,500);
  const protectedTile=gridTile(next,terrainGeometry(edited.document.settings).width,0,0);protectedTile.samples[15*32+15]+=1;
  await assert.rejects(send("terrain",{...command,requestId:randomUUID(),revision:edited.document.revision,tiles:[protectedTile]}),/protected|finer-source/);
  const {getRefinements}=await import("../src/features/worlds/terrain-refinement-service");assert.equal((await getRefinements("world-god",f.world,target.id)).refinements.length,0);
  await writeFile(path.join(out,"native-finer-sources.json"),JSON.stringify({passed:true,realDatedRefinementCreation:true,exactCreateRetry:true,exactFinerSaveRetry:true,pinnedBoundarySampling:true,finerNumericalEdit:25,rootInterpolationSupportProtected:true,baselineRefinementInventoryUnchanged:true,sharedDatabaseAccess:false},null,2));
  await validateRegionalAuthority(f,timelineId,target,before,after,fineId);
  const conditionRead=()=>nativeContentRequest(new Request(urlFor(after,"atlas-history/conditions")),"world-god") as Promise<import("../src/features/worlds/native-map-history").NativeConditionsPacket>;
  const conditions=await conditionRead(),condition={action:"conditions",requestId:randomUUID(),revision:conditions.revision,value:{id:target.id,condition:"destroyed",account:"The dated World representation is explicitly destroyed; saved geometry remains."}};
  const conditionResult=await send("atlas-history/conditions",condition);assert.deepEqual(await send("atlas-history/conditions",condition),conditionResult);
  assert.equal((await conditionRead()).values.find(v=>v.id===target.id)?.condition,"destroyed");
  assert.equal((await getNativeMapHistory("world-god",f.world,target,timelineId,{year:500})).conditions?.find(v=>v.id===target.id)?.condition,"destroyed");
  assert.deepEqual((await getNativeMapHistory("world-god",f.world,target,timelineId,{year:100})).conditions,[]);
  await assert.rejects(send("atlas-history/conditions",{...condition,requestId:randomUUID()}),/newer version|changed|revision/i);
  await assert.rejects(send("atlas-history/conditions",{...condition,requestId:randomUUID(),revision:conditions.revision+1,value:{...condition.value,id:randomUUID()}}),/retained by this historical source/);
  assert.equal((await getTerrain("world-god",f.world,{mapId:target.id})).document!.revision,original.revision);
  await writeFile(path.join(out,"native-conditions.json"),JSON.stringify({passed:true,exactRetry:true,metadataReflectsDatedCondition:true,earlierDateUnchanged:true,baselineUnchanged:true,staleAndForeignObjectRejected:true,sharedDatabaseAccess:false},null,2));
  const {changeNativeMapHistory}=await import("../src/features/worlds/native-map-history-service");
  const short=(await getNativeMapHistory("world-god",f.world,target,timelineId,{year:500})).selected!;
  await changeNativeMapHistory("world-god",f.world,{action:"details",requestId:randomUUID(),timelineId,target,stateId:short.id,revision:short.revision,details:{name:short.name,startYear:500,endYear:599,account:short.account,protected:short.protected}});
  const prior=(await getNativeMapHistory("world-god",f.world,target,timelineId,{year:500})).selected!;
  const split={action:"split",requestId:randomUUID(),timelineId,target,stateId:prior.id,revision:prior.revision,year:550,name:"Independent later World"};
  const splitResult=await changeNativeMapHistory("world-god",f.world,split);assert.deepEqual(await changeNativeMapHistory("world-god",f.world,split),splitResult);
  const earlier=(await getNativeMapHistory("world-god",f.world,target,timelineId,{year:500})).selected!,later=(await getNativeMapHistory("world-god",f.world,target,timelineId,{year:550})).selected!;
  assert.equal(earlier.endYear,549);assert.equal(later.startYear,550);assert.equal(later.endYear,599);assert.notEqual(later.id,earlier.id);
  const originalVersion=(await f.pool.query("select end_year,payload from world_map_state_version where id=$1",[prior.versionId])).rows[0];assert.equal(Number(originalVersion.end_year),599);
  assert.deepEqual(originalVersion.payload.nativeAtlas.resources,(await f.pool.query("select payload from world_map_state_version where id=$1",[later.versionId])).rows[0].payload.nativeAtlas.resources);
  const laterScope={...after,stateId:later.id,year:550};
  await nativeContentRequest(new Request(urlFor(laterScope,"atlas-history/conditions"),{method:"POST",body:JSON.stringify({action:"conditions",requestId:randomUUID(),revision:conditions.revision+1,value:{id:target.id,condition:"rebuilt",account:"Rebuilt later, earlier years retain their destruction"}})}),"world-god");
  assert.equal((await getNativeMapHistory("world-god",f.world,target,timelineId,{year:500})).conditions?.find(v=>v.id===target.id)?.condition,"destroyed");
  assert.equal((await getNativeMapHistory("world-god",f.world,target,timelineId,{year:550})).conditions?.find(v=>v.id===target.id)?.condition,"rebuilt");
  await assert.rejects(changeNativeMapHistory("world-god",f.world,{...split,requestId:randomUUID(),year:500,revision:earlier.revision}),/later year inside/);
  await writeFile(path.join(out,"native-period-split.json"),JSON.stringify({passed:true,earlierPeriodPreserved:true,laterAppearanceIndependent:true,oldImmutableVersionExact:true,componentsSharedUntilEdit:true,exactRetry:true,baselineUnchanged:true,sharedDatabaseAccess:false},null,2));



  await writeFile(path.join(out, "native-numerical-cow.json"), JSON.stringify({ passed: true, realNativeTileObjects: true, unchangedCopiedSourceHydrologyFingerprint: true, earlierSamplesExact: true, baselineSamplesExact: true, laterNumericalDifference: 150, outsideSamplesExact: true, exactContentRetry: true, readonlyWriteRejected: true, readerUsesPinnedObjects: true, sharedDatabaseAccess: false }, null, 2));
}
async function validateRegionalAuthority(f:RegionalFixture,timelineId:string,target:{kind:"terrain";id:string},before:import("../src/features/worlds/native-map-history").NativeHistoryScope,after:import("../src/features/worlds/native-map-history").NativeHistoryScope,fineId:string){
  const {getTerrain}=await import("../src/features/worlds/terrain-service"),{getRefinements}=await import("../src/features/worlds/terrain-refinement-service"),{createRegionalMap}=await import("../src/features/worlds/terrain-region-service");
  const {getNativeMapHistory,changeNativeMapHistory}=await import("../src/features/worlds/native-map-history-service"),{nativeContentRequest}=await import("../src/features/worlds/native-map-history-api"),{nativeHistoryUrl}=await import("../src/features/worlds/native-map-history");
  const baseline=(await getTerrain("world-god",f.world,{mapId:target.id})).document!,index=await getRefinements("world-god",f.world,target.id),regionId=randomUUID();
  await createRegionalMap("world-god",f.world,{action:"create-region",requestId:regionId,parentMapId:target.id,terrainId:baseline.terrainId,parentRevision:baseline.mapRevision,sourceRevision:baseline.revision,sourceState:index.sourceState,name:"One shared dated coast",frame:{x:8000,y:8000,width:18000,height:18000}});
  const regionalTarget={kind:"terrain" as const,id:regionId};
  for(const year of [100,500]){const prepared=await getNativeMapHistory("world-god",f.world,regionalTarget,timelineId,{prepareBaseline:true,year});await changeNativeMapHistory("world-god",f.world,{action:"create",requestId:randomUUID(),timelineId,target:regionalTarget,sourceVersionId:null,baselinePin:prepared.baselinePin,geographyVersionId:prepared.geographySource!.versionId,details:{name:`Regional ${year}`,startYear:year,endYear:year+99,account:"Exact shared parent World",protected:true}});}
  const choice=(await getNativeMapHistory("world-god",f.world,regionalTarget,timelineId,{year:500})).selected!;
  const scope={timelineId,target:regionalTarget,stateId:choice.id,year:500,edit:true,geographyStateId:after.stateId};
  const call=(suffix:string,body?:unknown,context=scope)=>nativeContentRequest(new Request("http://127.0.0.1"+nativeHistoryUrl(`/api/worlds/${f.world}/${suffix}`,context),body?{method:"POST",body:JSON.stringify(body)}:{}),"world-god");
  const fine=await call(`terrain/refinements?refinement=${fineId}&keys=0&lod=0`) as {tiles:{x:number;y:number;samples:number[]}[];headRevision:number;rootRevision:number;seaLevel:number};
  const sources=await call("terrain/refinements") as {sourceState:string};
  assert.equal(fine.tiles[0].samples[16*32+16],525);
  const samples=[...fine.tiles[0].samples];samples[16*32+16]+=35;
  const command={action:"save",mapId:regionId,requestId:randomUUID(),revision:fine.headRevision,seaLevel:fine.seaLevel,sourceState:sources.sourceState,source:{kind:"manual"},tiles:[{x:0,y:0,samples}]};
  const accepted=await call("terrain/refinements?refinement="+fineId,command);assert.deepEqual(await call("terrain/refinements?refinement="+fineId,command),accepted);
  const sample=async(context:typeof scope|typeof after)=>nativeContentRequest(new Request("http://127.0.0.1"+nativeHistoryUrl(`/api/worlds/${f.world}/terrain/refinements?action=sample&points=`+encodeURIComponent(JSON.stringify([{x:15000,y:15000}])),context)),"world-god") as Promise<{points:{elevation:number}[]}>;
  assert.equal((await sample(scope)).points[0].elevation,560);assert.equal((await sample(after)).points[0].elevation,560);assert.equal((await sample(before)).points[0].elevation,500);
  await assert.rejects(call("terrain/refinements?refinement="+fineId,{...command,requestId:randomUUID(),revision:fine.headRevision+1},{...scope,geographyStateId:before.stateId}),/binding changed/);
  const labels=await call("terrain/labels") as {revision:number;layer:import("../src/features/worlds/terrain-labels").LabelsLayer;regional:unknown};
  const worldHead=(await getNativeMapHistory("world-god",f.world,target,timelineId,{year:500})).selected!.versionId;
  const labelResult=await call("terrain/labels",{requestId:randomUUID(),mapId:regionId,revision:labels.revision,layer:{...labels.layer,visible:!labels.layer.visible},regional:labels.regional}) as {layer:typeof labels.layer};
  assert.equal(labelResult.layer.visible,!labels.layer.visible);assert.equal((await getNativeMapHistory("world-god",f.world,target,timelineId,{year:500})).selected!.versionId,worldHead);
  const worldLabels=await nativeContentRequest(new Request("http://127.0.0.1"+nativeHistoryUrl(`/api/worlds/${f.world}/terrain/labels`,after)),"world-god") as typeof labels;assert.equal(worldLabels.layer.visible,labels.layer.visible);
  assert.equal((await getRefinements("world-god",f.world,target.id)).refinements.length,0);
  await writeFile(path.join(out,"native-regional-authority.json"),JSON.stringify({passed:true,regionalAndWorldSamplesIdentical:560,earlierWorldSamplesExact:500,oneCanonicalHistoricalRefinement:true,atomicRegionalAndWorldVersions:true,exactRegionalRetry:true,wrongHistoricalWorldBindingRejected:true,regionalLabelPresentationKeepsWorldHead:true,baselineRefinementInventoryUnchanged:true,sharedDatabaseAccess:false},null,2));
}
async function validateNativeConnections(f:RegionalFixture,timelineId:string){
 const {changeUnderground,getUnderground}=await import("../src/features/worlds/underground-service");
 const {generateUnderground,defaultUndergroundSettings}=await import("../src/features/worlds/underground");
 const {getNativeMapHistory,changeNativeMapHistory}=await import("../src/features/worlds/native-map-history-service");
 const {nativeContentRequest}=await import("../src/features/worlds/native-map-history-api"),{nativeHistoryUrl}=await import("../src/features/worlds/native-map-history");
 const a=generateUnderground(defaultUndergroundSettings,randomUUID),b=generateUnderground({...defaultUndergroundSettings,mode:"cave"},randomUUID);
 const create=async(name:string,p:typeof a)=>changeUnderground("world-god",f.world,{action:"create-site",requestId:randomUUID(),name,order:0,depth:"Owned historical fixture",placeId:null,newPlace:null,frame:p.frame,design:p.design,entrance:null,entranceRevision:null});
 const left=await create("Dated crypt",a),right=await create("Dated cavern",b);
 const feature=(d:typeof a)=>d.design.features.find(v=>v.kind==="transition"&&v.variant==="object")!;
 const af=feature(a),bf=feature(b);assert.ok(af.variant==="object"&&bf.variant==="object");
 const link=await changeUnderground("world-god",f.world,{action:"connect",requestId:randomUUID(),name:"Explicit dated passage",source:{map:{kind:"underground",levelId:left.levelId!},entranceId:af.id,point:af.point},destination:{map:{kind:"underground",levelId:right.levelId!},entranceId:bf.id,point:bf.point},sourceRevision:1,destinationRevision:1,twoWay:true});
 const make=async(id:string,year:number)=>{const target={kind:"underground" as const,id};const prepared=await getNativeMapHistory("world-god",f.world,target,timelineId,{prepareBaseline:true,year});await changeNativeMapHistory("world-god",f.world,{action:"create",requestId:randomUUID(),timelineId,target,sourceVersionId:null,baselinePin:prepared.baselinePin,details:{name:year+" retained level",startYear:year,endYear:year+99,account:"Explicit source establishes copied connection identities for this period.",protected:true}});return {timelineId,target,stateId:(await getNativeMapHistory("world-god",f.world,target,timelineId,{year})).selected!.id,year,edit:true};};
 const ls=await make(left.levelId!,500),rs=await make(right.levelId!,500),early=await make(left.levelId!,100);
 const call=(scope:typeof ls,suffix:string,body?:unknown)=>nativeContentRequest(new Request("http://127.0.0.1"+nativeHistoryUrl(`/api/worlds/${f.world}/`+suffix,scope),body?{method:"POST",body:JSON.stringify(body)}:{}),"world-god");
 const route=await call(ls,`underground?navigate=${link.connectionId}`) as {url:string};const url=new URL(route.url,"http://owned");assert.equal(url.searchParams.get("atlasYear"),"500");assert.equal(url.searchParams.get("atlasTimeline"),timelineId);assert.equal(url.searchParams.get("undergroundLevel"),right.levelId);
 const reverse=await call(rs,`underground?navigate=${link.connectionId}&reverse=1`) as {url:string};assert.equal(new URL(reverse.url,"http://owned").searchParams.get("undergroundLevel"),left.levelId);
 await assert.rejects(call(early,`underground?navigate=${link.connectionId}`),/coverage|retained appearance|unknown/i);
 const baseline=await getUnderground("world-god",f.world,{levelId:right.levelId!});assert.ok(baseline.document);
 await call(rs,"atlas-history/conditions",{action:"conditions",requestId:randomUUID(),revision:0,value:{id:bf.id,condition:"destroyed",account:"Collapsed stair at this date"}});
 await assert.rejects(call(ls,`underground?navigate=${link.connectionId}`),/absent|destroyed/i);
 assert.deepEqual((await getUnderground("world-god",f.world,{levelId:right.levelId!})).document,baseline.document);
 await writeFile(path.join(out,"native-connections.json"),JSON.stringify({passed:true,sameYearAndTimeline:true,explicitConnectionIdentity:true,twoWayReturn:true,missingDestinationUnknown:true,destroyedArrivalBlocked:true,baselineGeometryUnchanged:true,sharedDatabaseAccess:false},null,2));
}
async function validateNativeConnectionAuthoring(f:RegionalFixture,timelineId:string){
 const {changeUnderground,getUnderground}=await import("../src/features/worlds/underground-service"),{generateUnderground,defaultUndergroundSettings}=await import("../src/features/worlds/underground");
 const {getNativeMapHistory,changeNativeMapHistory}=await import("../src/features/worlds/native-map-history-service"),{nativeContentRequest}=await import("../src/features/worlds/native-map-history-api"),{nativeHistoryUrl,nativeHistoryScopeSchema}=await import("../src/features/worlds/native-map-history");
 const models=[generateUnderground(defaultUndergroundSettings,randomUUID),generateUnderground({...defaultUndergroundSettings,mode:"cave"},randomUUID)];
 const scopes:import("../src/features/worlds/native-map-history").NativeHistoryScope[]=[],early:typeof scopes=[];
 const base:import("../src/features/worlds/underground").UndergroundBundle[]=[];
 for(let i=0;i<models.length;i++){const p=models[i],made=await changeUnderground("world-god",f.world,{action:"create-site",requestId:randomUUID(),name:"Historical authored endpoint "+i,order:0,depth:"Owned fixture",placeId:null,newPlace:null,frame:p.frame,design:p.design,entrance:null,entranceRevision:null});
  const target={kind:"underground" as const,id:made.levelId!};base.push(await getUnderground("world-god",f.world,{levelId:target.id}));
  for(const year of [100,500]){const prepared=await getNativeMapHistory("world-god",f.world,target,timelineId,{prepareBaseline:true,year});await changeNativeMapHistory("world-god",f.world,{action:"create",requestId:randomUUID(),timelineId,target,sourceVersionId:null,baselinePin:prepared.baselinePin,details:{name:year+" editable endpoint "+i,startYear:year,endYear:year+99,account:"Explicit dated endpoint geometry",protected:true}});const scope={timelineId,target,stateId:(await getNativeMapHistory("world-god",f.world,target,timelineId,{year})).selected!.id,year,edit:true};(year===100?early:scopes).push(scope);}
 }
 const call=(scope:typeof scopes[number],suffix:string,body?:unknown)=>nativeContentRequest(new Request("http://127.0.0.1"+nativeHistoryUrl(`/api/worlds/${f.world}/`+suffix,scope),body?{method:"POST",body:JSON.stringify(body)}:{}),"world-god");
 const features=models.map(m=>m.design.features.find(f=>f.kind==="transition"&&f.variant==="object")!);assert.ok(features[0].variant==="object"&&features[1].variant==="object");
 const command={action:"connect",requestId:randomUUID(),name:"Authored dated route",source:{map:{kind:"underground",levelId:scopes[0].target.id},entranceId:features[0].id,point:features[0].point},destination:{map:{kind:"underground",levelId:scopes[1].target.id},entranceId:features[1].id,point:features[1].point},sourceRevision:1,destinationRevision:1,twoWay:true};
 const baselineConnections=JSON.stringify((await f.pool.query("select row_to_json(c) value from world_underground_connection c order by id")).rows);
 const competing={...command,requestId:randomUUID(),name:"Competing route"},races=await Promise.allSettled([call(scopes[0],"underground",command),call(scopes[0],"underground",competing)]);
 assert.equal(races.filter(r=>r.status==="fulfilled").length,1);assert.equal(races.filter(r=>r.status==="rejected").length,1);
 const index=races[0].status==="fulfilled"?0:1,accepted=(races[index] as PromiseFulfilledResult<unknown>).value as {connectionId:string;historical:{versionId:string}},sent=index===0?command:competing,id=accepted.connectionId;
 assert.deepEqual(await call(scopes[0],"underground",sent),accepted);
 const components=async(scope:typeof scopes[number])=>{const h=(await getNativeMapHistory("world-god",f.world,scope.target,timelineId,{year:scope.year})).selected!;return (await f.pool.query("select component_id from world_map_state_component_ref where version_id=$1 and key=$2",[h.versionId,"connection:"+id])).rows[0].component_id;};
 assert.equal(await components(scopes[0]),await components(scopes[1]));
 for(const scope of early)assert.equal(((await call(scope,"underground")) as import("../src/features/worlds/underground").UndergroundBundle).connections.length,0);
 const route=await call(scopes[0],"underground?navigate="+id) as {url:string};assert.equal(new URL(route.url,"http://owned").searchParams.get("atlasYear"),"500");
 await call(scopes[0],"underground",{action:"lifecycle",requestId:randomUUID(),kind:"connection",id,revision:1,archived:true});
 await assert.rejects(call(scopes[0],"underground?navigate="+id),/unavailable/);
 const retained={...scopes[0],edit:false,versionId:accepted.historical.versionId};
 const pinned=await call(retained,"underground?navigate="+id) as {url:string},q=new URL(pinned.url,"http://owned").searchParams;
 assert.equal(q.get("atlasConnectionSource"),accepted.historical.versionId);assert.equal(q.get("atlasConnection"),id);
 const destinationHistory=await getNativeMapHistory("world-god",f.world,scopes[1].target,timelineId,{year:500,stateId:q.get("atlasState")!,versionId:q.get("atlasVersion")!});
 const destScope={...scopes[1],edit:false,stateId:destinationHistory.selected!.id,versionId:q.get("atlasVersion")!,connectionSourceVersionId:q.get("atlasConnectionSource")!,connectionSourceId:q.get("atlasConnection")!};
 const dst=await call(destScope,"underground") as import("../src/features/worlds/underground").UndergroundBundle;assert.equal(dst.connections.find(c=>c.id===id)?.available,true);
 const back=await call(destScope,"underground?navigate="+id+"&reverse=1") as {url:string};assert.equal(new URL(back.url,"http://owned").searchParams.get("undergroundLevel"),scopes[0].target.id);
 assert.equal(nativeHistoryScopeSchema.safeParse({...destScope,edit:true}).success,false);
 await call(scopes[0],"underground",{action:"lifecycle",requestId:randomUUID(),kind:"connection",id,revision:2,archived:false});
 assert.ok((await call(scopes[0],"underground?navigate="+id) as {url:string}).url);
 for(let i=0;i<scopes.length;i++)assert.deepEqual((await getUnderground("world-god",f.world,{levelId:scopes[i].target.id})).document,base[i].document);
 assert.equal(JSON.stringify((await f.pool.query("select row_to_json(c) value from world_underground_connection c order by id")).rows),baselineConnections);
 await writeFile(path.join(out,"native-connection-authoring.json"),JSON.stringify({passed:true,atomicSharedAccountBothHeads:true,concurrentEntranceConflict:true,exactRetry:true,earlierAppearancesUnchanged:true,baselineDrawingsAndConnectionsExact:true,datedArchiveRestore:true,retainedConnectionAndGeometrySourcesIndependent:true,retainedTwoWayReturn:true,retainedScopeCannotWrite:true,sharedDatabaseAccess:false},null,2));
}
async function main() {
  const owned = path.join(out, "owned-temp"); await mkdir(owned, { recursive: true });
  process.env.TEMP = owned; process.env.TMP = owned;
  await withRegionalEditingFixture(validate, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, beforeUpgrade);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
