import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import type {RegionalFixture} from "./worlds-regional-editing-fixture";

export async function validateNativeOrigins(f:RegionalFixture,timelineId:string){
  const {getCrafts,changeCraft}=await import("../src/features/worlds/craft-service"),{emptyCraftSurface}=await import("../src/features/worlds/craft"),{getNativeMapHistory,changeNativeMapHistory}=await import("../src/features/worlds/native-map-history-service"),{getAssetComposition}=await import("../src/features/worlds/atlas-asset-service");
  for(const table of ["world_town_map","world_building_floor","world_underground_level","world_craft","world_craft_deck"])assert.equal((await f.pool.query(`select count(*)::int n from ${table} where native_origin_version_id is not null`)).rows[0].n,0);
  const mapId=(await f.pool.query("select id from world_atlas_map where world_id=$1 and name='Historical numerical World'",[f.world])).rows[0].id;
  const source=(await getNativeMapHistory("world-god",f.world,{kind:"terrain",id:mapId},timelineId,{year:500})).selected!;
  const craftId=randomUUID(),frame={x:0,y:0,width:20,height:50,rotation:0},draft={name:"Identity first introduced in dated history",classification:"sailing ship",description:"No baseline appearance",frame,surface:emptyCraftSurface()};
  const insert=async(id:string,worldId:string,versionId:string)=>{
    const tx=await f.pool.connect(),requestId=randomUUID();
    try{await tx.query("begin");await tx.query("insert into world_craft(id,world_id,name,classification,frame,draft,revision,native_origin_version_id) values($1,$2,$3,$4,$5,$6,1,$7)",[id,worldId,draft.name,draft.classification,frame,draft,versionId]);await tx.query("insert into world_craft_operation(request_id,world_id,author_id,input_hash,result) values($1,$2,'world-god',$3,$4)",[requestId,worldId,"a".repeat(64),{craftId:id,surface:"exterior",revision:1}]);await tx.query("insert into world_craft_version(craft_id,world_id,revision,draft,archived,request_id) values($1,$2,1,$3,false,$4)",[id,worldId,draft,requestId]);await tx.query("commit");}
    catch(error){await tx.query("rollback");throw error;}finally{tx.release();}
  };
  await assert.rejects(insert(randomUUID(),f.foreign,source.versionId),/same World/);
  await insert(craftId,f.world,source.versionId);
  await assert.rejects(f.pool.query("update world_craft set native_origin_version_id=null where id=$1",[craftId]),/immutable/);
  assert.equal((await getCrafts("world-god",f.world)).crafts.some(craft=>craft.id===craftId),false);
  await assert.rejects(getCrafts("world-god",f.world,{craftId}),/unavailable/);
  await assert.rejects(changeCraft("world-god",f.world,{action:"lifecycle",requestId:randomUUID(),craftId,surface:"exterior",revision:1,archived:true}),/unavailable/);
  await assert.rejects(getAssetComposition("world-god",f.world,{kind:"craft",id:craftId}),/unavailable/);
  const target={kind:"craft" as const,id:craftId},history=await getNativeMapHistory("world-god",f.world,target,timelineId,{year:100});assert.equal(history.baselineAvailable,false);assert.equal(history.coverage,"unknown");assert.equal(history.anchorMapId,mapId);
  await assert.rejects(changeNativeMapHistory("world-god",f.world,{action:"create",requestId:randomUUID(),timelineId,target,sourceVersionId:null,baselinePin:"0".repeat(64),details:{name:"Invented baseline",startYear:100,endYear:100,account:"Rejected baseline substitution",protected:false}}),/no current baseline/);
  await writeFile(path.join(f.out,"native-identity-origins.json"),JSON.stringify({passed:true,existingOriginColumnsNull:true,sameWorldExactDatedOriginRequired:true,originImmutable:true,baselineInventoryAndDirectReadAndWriteAndAssetsWithheld:true,unknownCoverageNotInvented:true,sourceWorldAnchorExact:true,baselineCopyRejected:true,sharedDatabaseAccess:false},null,2));
}
