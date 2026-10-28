import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {writeFile} from "node:fs/promises";
import type {checkTerrainDatabase} from "./worlds-terrain-db-checks";
import {DEFAULT_MAP_APPEARANCE} from "../src/features/worlds/terrain-appearance";
import {DEFAULT_TERRAIN_STYLE} from "../src/features/worlds/terrain-style";
export const styleFixtureId="5a000000-0000-4000-8000-000000000001";
export async function checkStyleDatabase({pool,world,foreign}:Parameters<typeof checkTerrainDatabase>[0]){
 const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,"127.0.0.1");assert.notEqual(url.port,"5432");assert.equal(url.pathname,"/serrian_atlas_s32");
 const terrain=await import("../src/features/worlds/terrain-service"),appearance=await import("../src/features/worlds/terrain-appearance-service"),service=await import("../src/features/worlds/terrain-style-service");
 await terrain.changeTerrain("world-god",world,{action:"create",requestId:styleFixtureId,name:"Style workshop isolation",initial:"land"});
 const tables=["world_terrain","world_terrain_version","world_terrain_tile","world_terrain_refinement","world_terrain_refinement_version","world_terrain_refinement_tile","world_terrain_material","world_terrain_material_version","world_hydrology","world_hydrology_version","world_environment","world_environment_version"],snapshot=async()=>{const result:Record<string,unknown>={};for(const t of tables)result[t]=(await pool.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) rows from "${t}" t`)).rows[0].rows;return result;},before=await snapshot();
 const spec={...DEFAULT_MAP_APPEARANCE,version:2 as const,style:"realistic-terrain" as const,art:{...DEFAULT_TERRAIN_STYLE,palette:"ochre" as const,brightness:1.1}},command={requestId:randomUUID(),mapId:styleFixtureId,appearanceRevision:0,name:"Warm coast immutable v1",spec},saved=await service.saveMapStyle("world-god",world,command);
 assert.equal(saved.id,command.requestId);assert.deepEqual(saved.spec,spec);assert.equal((await appearance.getMapAppearance("world-god",world,styleFixtureId)).revision,0);assert.equal((await service.saveMapStyle("world-god",world,command)).id,saved.id);
 await assert.rejects(service.saveMapStyle("world-god",world,{...command,name:"Alter original nonce"}),/different choices/);
 for(const actor of ["world-admin","other-god","world-player"])await assert.rejects(service.saveMapStyle(actor,world,{...command,requestId:randomUUID()}));
 await assert.rejects(service.getMapStyles("world-god",world,styleFixtureId,{ordinary:true}));await assert.rejects(service.getMapStyles("world-god",foreign,styleFixtureId));assert.equal((await service.getMapStyles("world-admin",world,styleFixtureId,{review:true})).presets.length,1);
 await assert.rejects(pool.query("update world_map_style set name=name where id=$1",[saved.id]),/immutable/);await assert.rejects(pool.query("delete from world_map_style where id=$1",[saved.id]),/immutable/);
 const head=await appearance.saveMapAppearance("world-god",world,{mapId:styleFixtureId,revision:0,requestId:randomUUID(),spec});assert.equal(head.revision,1);assert.deepEqual((await appearance.getMapAppearance("world-god",world,styleFixtureId)).spec,spec);
 await assert.rejects(service.saveMapStyle("world-god",world,{...command,requestId:randomUUID()}),/changed/);assert.equal((await service.saveMapStyle("world-god",world,command)).id,saved.id,"original successful retry remains valid after a newer appearance");
 assert.deepEqual(await snapshot(),before);
 await writeFile(`${process.env.SERRIAN_PASS8_EVIDENCE_DIR}/style-database.json`,JSON.stringify({passed:true,oneImmutableSnapshot:true,mapAppearanceIndependent:true,originalRetryAfterNewHead:true,conflictAndNonceMisuseDenied:true,ordinaryForeignPlayerDenied:true,adminExplicitReadOnly:true,geographicTablesExact:tables,sharedDatabaseAccess:false},null,2)+"\n");
 await (await import("./worlds-style-migration-checks")).checkStyleMigration(pool);
 console.log("PASS immutable World styles, explicit independent appearance save, exact geographical preservation and authorization");
}
