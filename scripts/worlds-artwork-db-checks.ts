import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {writeFile} from "node:fs/promises";
import type {checkTerrainDatabase} from "./worlds-terrain-db-checks";
import {EMPTY_ARTWORK} from "../src/features/worlds/terrain-artwork";
export const artworkFixtureId="5b000000-0000-4000-8000-000000000001";
export async function checkArtworkDatabase({pool,world,foreign}:Parameters<typeof checkTerrainDatabase>[0]){
 const u=new URL(process.env.DATABASE_URL!);assert.equal(u.hostname,"127.0.0.1");assert.notEqual(u.port,"5432");assert.equal(u.pathname,"/serrian_atlas_s32");
 const terrain=await import("../src/features/worlds/terrain-service"),service=await import("../src/features/worlds/terrain-artwork-service");
 await terrain.changeTerrain("world-god",world,{action:"create",requestId:artworkFixtureId,name:"Independent artwork workshop",initial:"land"});
 const tables=(await pool.query("select tablename from pg_tables where schemaname='public' and tablename not in ('world_artwork','world_artwork_version','session','account','verification') order by tablename")).rows.map(r=>String(r.tablename)),snapshot=async()=>{const data:Record<string,unknown>={};for(const t of tables){assert.match(t,/^[a-z0-9_]+$/);data[t]=(await pool.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) data from "${t}" t`)).rows[0].data;}return data;},before=await snapshot();
 const empty=await service.getTerrainArtwork("world-god",world,artworkFixtureId);assert.equal(empty.revision,0);assert.deepEqual(empty.layer,EMPTY_ARTWORK);
 const placement={id:randomUUID(),assetId:"fantasy.summit.v1",assetVersion:1 as const,x:1234.56789,y:2345.12345,widthM:1000,rotation:32.25,opacity:.7,mirror:true},command={mapId:artworkFixtureId,revision:0,requestId:randomUUID(),layer:{...EMPTY_ARTWORK,automatic:true,pack:"fantasy" as const,placements:[placement]}},one=await service.saveTerrainArtwork("world-god",world,command);assert.equal(one.revision,1);assert.deepEqual(one.layer,command.layer);assert.deepEqual(await service.saveTerrainArtwork("world-god",world,command),one);
 await assert.rejects(service.saveTerrainArtwork("world-god",world,{...command,layer:{...command.layer,density:1.5}}),/different work/);
 for(const actor of ["world-admin","world-player","other-god"])await assert.rejects(service.saveTerrainArtwork(actor,world,{...command,requestId:randomUUID()}));
 await assert.rejects(service.getTerrainArtwork("world-god",foreign,artworkFixtureId));await assert.rejects(service.getTerrainArtwork("world-god",world,artworkFixtureId,{ordinary:true}));assert.deepEqual((await service.getTerrainArtwork("world-admin",world,artworkFixtureId,{review:true})).layer,one.layer);
 const second={...command,revision:1,requestId:randomUUID(),layer:{...command.layer,theme:"antique" as const}},two=await service.saveTerrainArtwork("world-god",world,second);assert.equal(two.revision,2);assert.deepEqual(await service.saveTerrainArtwork("world-god",world,command),one,"successful original retry survives a new head");await assert.rejects(service.saveTerrainArtwork("world-god",world,{...command,requestId:randomUUID()}),/newer artwork/);
 const old=await service.getTerrainArtwork("world-god",world,artworkFixtureId,{revision:1});assert.equal(old.headRevision,2);assert.deepEqual(old.layer,one.layer);
 await assert.rejects(service.saveTerrainArtwork("world-god",world,{...second,revision:2,requestId:randomUUID(),restoreRevision:1}),/exact retained/);
 const restored=await service.saveTerrainArtwork("world-god",world,{...command,revision:2,requestId:randomUUID(),restoreRevision:1});assert.equal(restored.revision,3);assert.deepEqual(restored.layer,one.layer);
 await assert.rejects(pool.query("update world_artwork_version set layer=layer"),/immutable/);await assert.rejects(pool.query("delete from world_artwork_version"),/immutable/);
 await assert.rejects(service.saveTerrainArtwork("world-god",world,{...command,revision:3,requestId:randomUUID(),layer:{...command.layer,placements:[{...placement,x:1e12}]}}),/physical extent/);
 assert.deepEqual(await snapshot(),before);
 await writeFile(`${process.env.SERRIAN_PASS8_EVIDENCE_DIR}/artwork-database.json`,JSON.stringify({passed:true,emptyMapCompatible:true,exactPhysicalTransforms:true,independentLayer:true,originalRetryAfterNewHead:true,conflictAndNonceMisuseDenied:true,restoreExactAndAppendOnly:true,adminExplicitReadOnly:true,ordinaryForeignPlayerDenied:true,allOtherPublicTablesExact:tables.length,sharedDatabaseAccess:false},null,2)+"\n");
 await (await import("./worlds-artwork-migration-checks")).checkArtworkMigration(pool);
 console.log("PASS artwork coordinates, independent saves, original retries, conflicts, immutable history, exact restoration and permissions");
}
