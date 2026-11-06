import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import type {RegionalFixture} from "./worlds-regional-editing-fixture";
import type {NativeHistoryScope} from "../src/features/worlds/native-map-history";
import type {CraftBundle} from "../src/features/worlds/craft";
export async function validateNativeCraftCopy(f:RegionalFixture,timelineId:string){
  const {nativeContentRequest}=await import("../src/features/worlds/native-map-history-api"),{nativeHistoryUrl}=await import("../src/features/worlds/native-map-history"),{getNativeMapHistory}=await import("../src/features/worlds/native-map-history-service");
  const fixture=JSON.parse(await readFile(path.join(f.out,"native-craft-creation.json"),"utf8")).fixture as {craftId:string;deckId:string;scope:NativeHistoryScope;deckScope:NativeHistoryScope},scope=fixture.scope;
  const call=(binding:NativeHistoryScope,query:string,body?:unknown)=>nativeContentRequest(new Request("http://owned.invalid"+nativeHistoryUrl(`/api/worlds/${f.world}/crafts${query?"?"+query:""}`,binding),body?{method:"POST",body:JSON.stringify(body)}:undefined),"world-god");
  const original=await call(scope,`craft=${fixture.craftId}&surface=exterior`) as CraftBundle,canonical=(await f.pool.query("select id,draft,revision from world_craft where id=$1",[fixture.craftId])).rows[0];
  const command={action:"duplicate",requestId:randomUUID(),craftId:fixture.craftId,revision:original.craft!.revision,newCraftId:randomUUID(),name:"Independent dated copied ship"};
  const accepted=await call(scope,"",command) as {childHistorical:{stateId:string}};assert.deepEqual(await call(scope,"",command),accepted);
  const target={kind:"craft" as const,id:command.newCraftId},copyScope={...scope,target,stateId:accepted.childHistorical.stateId};
  const copied=await call(copyScope,`craft=${target.id}&surface=exterior`) as CraftBundle;assert.equal(copied.craft!.name,command.name);assert.equal(copied.decks.length,original.decks.length);assert.equal(copied.placement,null);
  const oldIds=new Set(original.craft!.surface.plan.features.map(f=>f.id));assert.ok(copied.craft!.surface.plan.features.every(f=>!oldIds.has(f.id)));assert.equal(copied.craft!.surface.plan.features.length,oldIds.size);
  const routes=copied.connections.filter(c=>!c.archived);assert.ok(routes.length);const route=routes[0];assert.equal(route.available,true);assert.equal(route.craftId,target.id);assert.ok(!original.connections.some(c=>c.id===route.id));assert.notEqual(route.destination,fixture.deckId);
  const arrived=await call(copyScope,`connection=${route.id}`) as {surface:string};assert.equal(arrived.surface,route.destination);
  const deckTarget={kind:"deck" as const,id:route.destination},deckHistory=await getNativeMapHistory("world-god",f.world,deckTarget,timelineId,{year:scope.year}),deckScope={...copyScope,target:deckTarget,stateId:deckHistory.selected!.id};
  const reverse=await call(deckScope,`connection=${route.id}&reverse=1`) as {surface:string};assert.equal(reverse.surface,"exterior");
  assert.deepEqual((await call(scope,`craft=${fixture.craftId}&surface=exterior`) as CraftBundle).craft,original.craft);assert.deepEqual((await f.pool.query("select id,draft,revision from world_craft where id=$1",[fixture.craftId])).rows[0],canonical);
  assert.equal((await getNativeMapHistory("world-god",f.world,target,timelineId,{year:100})).coverage,"unknown");assert.equal((await getNativeMapHistory("world-god",f.world,target,timelineId,{year:900})).coverage,"unknown");
  const foreign=await call(fixture.deckScope,`craft=${fixture.craftId}&surface=${fixture.deckId}`) as CraftBundle,source=original.craft!,{id:_,worldId:__,revision:___,archived:____,...draft}=source;void _;void __;void ___;void ____;
  const feature=foreign.deck!.surface.plan.features.find(f=>f.variant==="object")!;assert.ok(feature);
  const borrowed={...draft,surface:{...draft.surface,plan:{...draft.surface.plan,features:[...draft.surface.plan.features,feature]},details:{...draft.surface.details,[feature.id]:foreign.deck!.surface.details[feature.id]??{notes:""}}}};
  await assert.rejects(call(scope,"",{action:"save",requestId:randomUUID(),craftId:fixture.craftId,surface:"exterior",revision:source.revision,draft:borrowed}),/independent drawing identities/);
  // Copied conditions belong in the exact entrance source pins as well as the
  // current head. An immutable view must not revive an explicitly unknown hatch.
  const conditionUrl=nativeHistoryUrl(`/api/worlds/${f.world}/atlas-history/conditions`,scope),conditions=await nativeContentRequest(new Request("http://owned.invalid"+conditionUrl),"world-god") as {revision:number};
  await nativeContentRequest(new Request("http://owned.invalid"+conditionUrl,{method:"POST",body:JSON.stringify({action:"conditions",requestId:randomUUID(),revision:conditions.revision,value:{id:original.connections[0].sourceFeatureId,condition:"unknown",account:"Deliberately unestablished hatch in this appearance"}})}),"world-god");
  const uncertain=await call(scope,"",{...command,requestId:randomUUID(),newCraftId:randomUUID(),name:"Independent uncertain copied ship"}) as {craftId:string;childHistorical:{stateId:string;versionId:string}};
  const uncertainScope={...scope,target:{kind:"craft" as const,id:uncertain.craftId},stateId:uncertain.childHistorical.stateId},uncertainCopy=await call(uncertainScope,`craft=${uncertain.craftId}&surface=exterior`) as CraftBundle;
  assert.equal(uncertainCopy.connections[0].available,false);
  assert.equal((await call({...uncertainScope,edit:false,versionId:uncertain.childHistorical.versionId},`craft=${uncertain.craftId}&surface=exterior`) as CraftBundle).connections[0].available,false);
  await writeFile(path.join(f.out,"native-craft-copy.json"),JSON.stringify({passed:true,actualDatedCraftAndDeckSources:true,independentCanonicalAndDrawingAndRouteIdentities:true,exactRetry:true,copiedTwoWayRoutes:true,noInheritedPositionOrUnknownDateCoverage:true,originalCanonicalAndDatedCraftExact:true,crossSurfaceNativeIdentityCollisionRejected:true,sharedDatabaseAccess:false,fixture:{craftId:target.id,scope:copyScope}},null,2));
}
