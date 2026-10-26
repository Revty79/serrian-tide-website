import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {writeFile} from "node:fs/promises";
import type {checkCartographyDatabase} from "./worlds-cartography-db-checks";
import {EMPTY_TERRAIN_MATERIALS} from "../src/features/worlds/terrain-materials";
import {DEFAULT_MAP_APPEARANCE} from "../src/features/worlds/terrain-appearance";
export async function checkSurfaceDatabase(options:Parameters<typeof checkCartographyDatabase>[0]){
 await (await import("./worlds-cartography-db-checks")).checkCartographyDatabase(options);
 const {pool,world,foreign}=options;assert.equal((await pool.query("select current_database() as name")).rows[0].name,"serrian_atlas_s32");
 await (await import("./worlds-surface-migration-checks")).checkSurfaceMigration(pool);
 const service=await import("../src/features/worlds/terrain-material-service"),appearance=await import("../src/features/worlds/terrain-appearance-service"),map=(await pool.query("select c.map_id from world_map_canvas c join world_atlas_map m on m.id=c.map_id where c.world_id=$1 and m.name='Pass 8 confirmed authored World'",[world])).rows[0].map_id;
 const tables=["world_terrain","world_terrain_tile","world_terrain_version","world_terrain_refinement","world_terrain_refinement_version","world_terrain_refinement_tile","world_map_canvas","world_map_place","world_shop","world_shop_location"],snapshot=async()=>{const result:Record<string,unknown>={};for(const t of tables)result[t]=(await pool.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) data from "${t}" t`)).rows[0].data;return result;},before=await snapshot();
 const layer={...EMPTY_TERRAIN_MATERIALS,strokes:[{id:randomUUID(),material:"sand" as const,radiusM:100,strength:.6,points:[{x:100,y:100},{x:220,y:150}]}]},command={mapId:map,revision:0,requestId:randomUUID(),layer};
 const saved=await service.saveTerrainMaterials("world-god",world,command);assert.equal(saved.revision,1);assert.deepEqual(await service.saveTerrainMaterials("world-god",world,command),saved);
 const races=await Promise.allSettled([.4,.8].map(opacity=>service.saveTerrainMaterials("world-god",world,{...command,revision:1,requestId:randomUUID(),layer:{...layer,opacity}})));assert.equal(races.filter(r=>r.status==="fulfilled").length,1);assert.deepEqual(await service.saveTerrainMaterials("world-god",world,command),saved);
 assert.equal((await service.getTerrainMaterials("world-god",world,map)).revision,2);assert.deepEqual((await service.getTerrainMaterials("world-god",world,map,{revision:1})).layer,layer);
 await assert.rejects(service.saveTerrainMaterials("world-god",world,{...command,layer:{...layer,visible:false}}),/different/);await assert.rejects(service.saveTerrainMaterials("world-god",world,{...command,requestId:randomUUID()}),/newer/);
 await assert.rejects(service.getTerrainMaterials("other-god",world,map));await assert.rejects(service.getTerrainMaterials("world-player",world,map));await assert.rejects(service.getTerrainMaterials("world-god",foreign,map));await assert.rejects(service.getTerrainMaterials("world-god",world,map,{ordinary:true}));
 assert.equal((await service.getTerrainMaterials("world-admin",world,map,{review:true})).revision,2);await assert.rejects(service.saveTerrainMaterials("world-admin",world,{...command,revision:2,requestId:randomUUID()}));
 await assert.rejects(service.saveTerrainMaterials("world-god",world,{...command,revision:2,requestId:randomUUID(),layer:{...layer,strokes:[{...layer.strokes[0],points:[{x:1e12,y:100}]}]}}),/outside/);
 await assert.rejects(pool.query("update world_terrain_material_version set layer=layer where map_id=$1",[map]),/immutable/);await assert.rejects(pool.query("delete from world_terrain_material_version where map_id=$1",[map]),/immutable/);
 const current=await appearance.getMapAppearance("world-god",world,map);await appearance.saveMapAppearance("world-god",world,{mapId:map,revision:current.revision,requestId:randomUUID(),spec:{...DEFAULT_MAP_APPEARANCE,version:2,style:"realistic-terrain"}});assert.equal((await appearance.getMapAppearance("world-god",world,map)).spec?.style,"realistic-terrain");assert.deepEqual(await snapshot(),before);
 await writeFile(`${process.env.SERRIAN_PASS8_EVIDENCE_DIR}/material-persistence.json`,JSON.stringify({passed:true,independentRevisions:true,immutableHistory:true,exactRetryAfterNewerSave:true,oneConcurrentWinner:true,frameValidated:true,ownerOnly:true,readOnlyAdmin:true,ordinaryHidden:true,appearanceV1AndV2:true,numericalAndIdentityTablesExact:tables,sha256:createHash("sha256").update(JSON.stringify(before)).digest("hex"),sharedDatabaseWrites:false},null,2)+"\n");
 console.log("PASS independently versioned physical materials, immutable history, retries/concurrency, roles and exact terrain/identity preservation");
}
