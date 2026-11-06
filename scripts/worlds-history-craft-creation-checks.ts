import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import type {RegionalFixture} from "./worlds-regional-editing-fixture";
import type {NativeHistoryScope} from "../src/features/worlds/native-map-history";
import type {CraftBundle} from "../src/features/worlds/craft";
export async function validateNativeCraftCreation(f:RegionalFixture,timelineId:string){
  const {nativeContentRequest}=await import("../src/features/worlds/native-map-history-api"),{nativeHistoryUrl}=await import("../src/features/worlds/native-map-history"),{getNativeMapHistory,changeNativeMapHistory}=await import("../src/features/worlds/native-map-history-service"),{getCrafts}=await import("../src/features/worlds/craft-service"),{craftOutline,cloneCraftSurface}=await import("../src/features/worlds/craft");
  const rootId=(await f.pool.query("select id from world_atlas_map where world_id=$1 and name='Dated craft sea'",[f.world])).rows[0].id as string,target={kind:"terrain" as const,id:rootId},parent=(await getNativeMapHistory("world-god",f.world,target,timelineId,{year:500})).selected!,scope:NativeHistoryScope={target,timelineId,year:500,stateId:parent.id,edit:true};
  const call=(binding:NativeHistoryScope,query:string,body?:unknown)=>nativeContentRequest(new Request("http://owned.invalid"+nativeHistoryUrl(`/api/worlds/${f.world}/${query}`,binding),body?{method:"POST",body:JSON.stringify(body)}:undefined),"world-god");
  const baseline=await getCrafts("world-god",f.world),frame={x:0,y:0,width:24,height:80,rotation:0},id=randomUUID(),deckId=randomUUID(),draft={name:"Historical ship first built500",classification:"sailing ship",description:"Deliberately dated ship",frame,surface:craftOutline("hull",frame,randomUUID)},template={name:"Original main deck500",order:0,height:0,frame,surface:craftOutline("rectangle",frame,randomUUID)},command={action:"create",requestId:randomUUID(),craftId:id,draft,templateDecks:[{id:deckId,draft:template}]};
  const made=await call(scope,"crafts",command) as {craftId:string;childHistorical:{stateId:string}};assert.deepEqual(await call(scope,"crafts",command),made);assert.equal(made.craftId,id);
  assert.deepEqual(await getCrafts("world-god",f.world),baseline);await assert.rejects(getCrafts("world-god",f.world,{craftId:id}),/unavailable/);
  assert.equal((await getNativeMapHistory("world-god",f.world,target,timelineId,{year:500})).selected!.versionId,parent.versionId);
  assert.equal((await getNativeMapHistory("world-god",f.world,{kind:"craft",id},timelineId,{year:100})).coverage,"unknown");
  const craftScope={...scope,target:{kind:"craft" as const,id},stateId:made.childHistorical.stateId},ship=await call(craftScope,`crafts?craft=${id}&surface=exterior`) as CraftBundle;assert.deepEqual(ship.craft!.surface,draft.surface);assert.ok(ship.decks.some(deck=>deck.id===deckId));
  assert.ok((await call(scope,"crafts") as CraftBundle).crafts.some(craft=>craft.id===id));
  const copy={action:"create-deck",requestId:randomUUID(),craftId:id,deckId:randomUUID(),draft:{...template,name:"Independently copied deck500",order:1,surface:cloneCraftSurface(template.surface,randomUUID).surface},copyFrom:deckId,copyRevision:1,copyObjects:true};
  const copied=await call(craftScope,"crafts",copy) as {surface:string};assert.deepEqual(await call(craftScope,"crafts",copy),copied);assert.equal(copied.surface,copy.deckId);
  const deckTarget={kind:"deck" as const,id:deckId},deckHistory=(await getNativeMapHistory("world-god",f.world,deckTarget,timelineId,{year:500})).selected!,deckScope={...scope,target:deckTarget,stateId:deckHistory.id};
  const first=await call(deckScope,`crafts?craft=${id}&surface=${deckId}`) as CraftBundle;assert.deepEqual(first.deck!.surface,template.surface);
  const laterState=await changeNativeMapHistory("world-god",f.world,{action:"create",requestId:randomUUID(),timelineId,target:deckTarget,sourceVersionId:deckHistory.versionId,baselinePin:null,details:{name:"Deck900",startYear:900,endYear:900,account:"Retained deck before independent later changes",protected:false}}),later={...deckScope,year:900,stateId:String(laterState.id)};
  await call(later,"crafts",{action:"save",requestId:randomUUID(),craftId:id,surface:deckId,revision:1,draft:{...template,name:"Renovated deck900"}});
  assert.equal((await call(deckScope,`crafts?craft=${id}&surface=${deckId}`) as CraftBundle).deck!.name,template.name);assert.equal((await call(later,`crafts?craft=${id}&surface=${deckId}`) as CraftBundle).deck!.name,"Renovated deck900");
  assert.equal((await call(later,`crafts?craft=${id}&surface=${deckId}`) as CraftBundle).positionCoverage,"unknown");
  assert.deepEqual(await getCrafts("world-god",f.world),baseline);
  await writeFile(path.join(f.out,"native-craft-creation.json"),JSON.stringify({passed:true,firstDatedCraftAndTemplateDeck:true,independentDeckCopy:true,exactCreationRetries:true,parentTerrainHeadExact:true,noBaselineCraftOrDeckInferred:true,inventoryShowsCanonicalBornIdentities:true,laterDeckRenameIndependent:true,unknownLaterPositionExplicit:true,sharedDatabaseAccess:false,fixture:{craftId:id,deckId,scope:craftScope,deckScope}},null,2));
}
