import assert from "node:assert/strict";
import {randomBytes,randomUUID,createHash} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {withCollaborationFixture} from "./worlds-collaboration-fixture";
import {createGrid,terrainGeometry,type TerrainDocument} from "../src/features/worlds/terrain";
import type {WorldEditorProof} from "../src/features/worlds/world-permissions";

/** Rehearse a published older producer's unfinished job. Original requests,
 * assigned identities and every old preparation payload must remain retained. */
withCollaborationFixture(async f=>{
  const {withWorldRequestAuthority}=await import("../src/features/worlds/world-authorization-context"),collaboration=await import("../src/features/worlds/world-collaboration-service"),canon=await import("../src/features/worlds/world-canon-service"),terrain=await import("../src/features/worlds/terrain-service");
  const owner="collab-owner-a",player="collab-player",admin="collab-admin",proof:WorldEditorProof={clientId:randomUUID(),token:randomBytes(32).toString("hex")};
  const as=<T>(actor:string,run:()=>Promise<T>)=>withWorldRequestAuthority({userId:actor,sessionId:f.sessions.get(actor)!,proof:actor===owner?proof:null,review:false,operationId:randomUUID(),reads:new Map()},run);
  const control=await as(owner,()=>collaboration.changeWorldCollaboration(owner,f.worldA,{action:"acquire-control",requestId:randomUUID(),proof}));proof.fence=control.access.editor.fence!;
  const map=randomUUID();await as(owner,()=>terrain.changeTerrain(owner,f.worldA,{action:"create",requestId:map,name:"Earlier preparation recovery terrain",initial:"land",settings:{gridWidth:64,gridHeight:64,widthKm:64,heightKm:64}}));
  const source=(await as(owner,()=>terrain.getTerrain(owner,f.worldA,{mapId:map}))).document!;
  await as(owner,()=>collaboration.changeWorldCollaboration(owner,f.worldA,{action:"release-control",requestId:randomUUID(),proof}));
  await as(admin,()=>canon.changeWorldCanon(admin,f.worldA,{requestId:randomUUID(),revision:0,isCanon:true,confirm:true,note:"Owned old-format recovery rehearsal"}));
  const packet={requestId:randomUUID(),revision:1,name:"Same original personal World request"},submit=()=>as(player,()=>canon.createPersonalCanonWorld(player,f.worldA,packet));
  let result=await submit();const assigned=result.id;
  while((await f.pool.query("select phase from world_canon_copy where request_id=$1",[packet.requestId])).rows[0].phase<12)result=await submit();
  const before=(await f.pool.query("select family,record_key,payload from world_canon_copy_row where request_id=$1 and family<>'canon_copy_format' order by family,record_key",[packet.requestId])).rows;assert.ok(before.length>0);
  const identity=(await f.pool.query("select target_id from world_canon_copy_identity where request_id=$1 and source_id=$2",[packet.requestId,map])).rows[0].target_id as string,inputHash=(await f.pool.query("select input_hash from world_canon_copy where request_id=$1",[packet.requestId])).rows[0].input_hash;
  // The published older producer had no format marker. Keep its real partial
  // rows and cursor, rather than inventing a completed World or navigation.
  await f.pool.query("delete from world_canon_copy_row where request_id=$1 and family='canon_copy_format'",[packet.requestId]);
  result=await submit();assert.equal(result.id,assigned);assert.equal(result.pending,true);assert.equal((await f.pool.query("select count(*)::int n from world where id=$1",[assigned])).rows[0].n,0);
  for(const row of before){const retained=(await f.pool.query("select payload,ready from world_canon_copy_row where request_id=$1 and family=$2 and record_key=$3",[packet.requestId,"retained-v1:"+row.family,row.record_key])).rows[0];assert.ok(retained);assert.deepEqual(retained.payload,row.payload);assert.equal(retained.ready,1);}
  assert.equal((await f.pool.query("select target_id from world_canon_copy_identity where request_id=$1 and source_id=$2",[packet.requestId,map])).rows[0].target_id,identity);
  let calls=0;while(result.pending){assert.ok(calls++<1000);result=await submit();}assert.equal(result.id,assigned);
  const hash=(d:TerrainDocument)=>createHash("sha256").update(new Uint8Array(createGrid(d.baseElevation,d.tiles,terrainGeometry(d.settings)).buffer)).digest("hex");
  const copied=(await as(player,()=>terrain.getTerrain(player,assigned,{mapId:identity}))).document!;assert.equal(hash(copied),hash(source));assert.equal(hash((await as(player,()=>terrain.getTerrain(player,f.worldA,{mapId:map}))).document!),hash(source));
  assert.equal((await f.pool.query("select input_hash from world_canon_copy where request_id=$1",[packet.requestId])).rows[0].input_hash,inputHash);
  // Accepted receipts never rebuild or rewrite an already independent World.
  await f.pool.query("delete from world_canon_copy_row where request_id=$1 and family='canon_copy_format'",[packet.requestId]);assert.deepEqual(await submit(),{id:assigned});
  assert.equal((await f.pool.query("select count(*)::int n from world_access_audit where world_id=$1 and request_id=$2 and action='canon-personal-world'",[f.worldA,packet.requestId])).rows[0].n,1);
  await writeFile(path.join(f.out,"copy-format-recovery.json"),JSON.stringify({passed:true,legacyRowsRetained:before.length,sameOriginalPacket:true,sameTargetWorld:assigned,sameAssignedMap:identity,sourceTerrainExact:true,acceptedReceiptUnchanged:true,calls,noSharedAccess:true},null,2));console.log("PASS earlier copy preparation recovery",before.length,"retained payloads");
}).catch(error=>{console.error(error);process.exitCode=1;});
