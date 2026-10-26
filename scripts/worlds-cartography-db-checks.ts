import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {writeFile} from "node:fs/promises";
import type {checkPass8Database} from "./worlds-atlas-pass8-db-checks";
import {DEFAULT_MAP_APPEARANCE} from "../src/features/worlds/terrain-appearance";

export async function checkCartographyDatabase(options:Parameters<typeof checkPass8Database>[0]){
 await (await import("./worlds-atlas-pass8-db-checks")).checkPass8Database(options);
 const {pool,world,foreign}=options,appearance=await import("../src/features/worlds/terrain-appearance-service"),map=(await pool.query("select c.map_id from world_map_canvas c join world_atlas_map m on m.id=c.map_id where c.world_id=$1 and m.name='Pass 8 confirmed authored World'",[world])).rows[0].map_id;
 const tables=["world_terrain","world_terrain_tile","world_terrain_version","world_terrain_refinement","world_terrain_refinement_version","world_terrain_refinement_tile","world_map_canvas","world_map_place","world_shop","world_shop_location"],snapshot=async()=>{const rows:Record<string,unknown>={};for(const t of tables)rows[t]=(await pool.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) data from "${t}" t`)).rows[0].data;return rows;},before=await snapshot();
 assert.equal((await appearance.getMapAppearance("world-god",world,map)).spec,null);
 const command={mapId:map,revision:0,requestId:randomUUID(),spec:{...DEFAULT_MAP_APPEARANCE,style:"topographic" as const,intervalM:50}};
 const saved=await appearance.saveMapAppearance("world-god",world,command);assert.equal(saved.revision,1);assert.deepEqual(await appearance.saveMapAppearance("world-god",world,command),saved);assert.deepEqual((await appearance.getMapAppearance("world-god",world,map)).spec,command.spec);
 await assert.rejects(appearance.saveMapAppearance("world-god",world,{...command,spec:{...command.spec,relief:80}}),/different/);
 await assert.rejects(appearance.saveMapAppearance("world-god",world,{...command,requestId:randomUUID()}),/newer/);
 await assert.rejects(appearance.saveMapAppearance("world-god",world,{...command,revision:1,requestId:randomUUID(),spec:{...command.spec,version:3}}));
 await assert.rejects(appearance.getMapAppearance("other-god",world,map));await assert.rejects(appearance.getMapAppearance("world-god",foreign,map));await assert.rejects(appearance.getMapAppearance("world-player",world,map));await assert.rejects(appearance.getMapAppearance("world-god",world,map,{ordinary:true}));
 assert.deepEqual((await appearance.getMapAppearance("world-admin",world,map,{review:true})).spec,command.spec);await assert.rejects(appearance.saveMapAppearance("world-admin",world,{...command,revision:1,requestId:randomUUID()}));
 const races=await Promise.allSettled(["illustrated-fantasy","physical-relief"].map(style=>appearance.saveMapAppearance("world-god",world,{...command,revision:1,requestId:randomUUID(),spec:{...command.spec,style}})));assert.equal(races.filter(r=>r.status==="fulfilled").length,1);assert.equal((await appearance.getMapAppearance("world-god",world,map)).revision,2);
 assert.deepEqual(await snapshot(),before);
 const out=process.env.SERRIAN_PASS8_EVIDENCE_DIR!;await writeFile(`${out}/appearance-persistence.json`,JSON.stringify({passed:true,strictVersionedSpec:true,legacyMapsUnchanged:true,ownRevision:true,exactRetry:true,concurrentSaveProtected:true,ownerOnly:true,ordinaryHidden:true,readOnlyAdmin:true,numericalAndRelationshipTablesExact:tables,sha256:createHash("sha256").update(JSON.stringify(before)).digest("hex"),sharedDatabaseWrites:false},null,2)+"\n");
 await (await import("./worlds-cartography-migration-checks")).checkCartographyMigration(pool);
 console.log("PASS cartographic appearance independent persistence, exact retries, concurrency, privacy and unchanged numerical/relationship tables");
}
