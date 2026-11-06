import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import type {RegionalFixture} from "./worlds-regional-editing-fixture";
import type {NativeHistoryScope} from "../src/features/worlds/native-map-history";
import type {CraftBundle} from "../src/features/worlds/craft";
export async function validateNativeCraftRoutes(f:RegionalFixture,timelineId:string){
  const {nativeContentRequest}=await import("../src/features/worlds/native-map-history-api"),{nativeHistoryUrl}=await import("../src/features/worlds/native-map-history"),{getNativeMapHistory,changeNativeMapHistory}=await import("../src/features/worlds/native-map-history-service");
  const fixture=JSON.parse(await readFile(path.join(f.out,"native-craft-creation.json"),"utf8")).fixture as {craftId:string;deckId:string;scope:NativeHistoryScope;deckScope:NativeHistoryScope},scope=fixture.scope;
  const call=(binding:NativeHistoryScope,query:string,body?:unknown)=>nativeContentRequest(new Request("http://owned.invalid"+nativeHistoryUrl(`/api/worlds/${f.world}/crafts${query?"?"+query:""}`,binding),body?{method:"POST",body:JSON.stringify(body)}:undefined),"world-god");
  const query=`craft=${fixture.craftId}&surface=exterior`,initial=await call(scope,query) as CraftBundle,ship=initial.craft!,stairId=randomUUID(),stair={version:1 as const,id:stairId,entityId:stairId,kind:"transition" as const,variant:"object" as const,name:"Dated ship hatch500",archived:false,point:{x:12,y:30},width:1.2,height:2,rotation:0,symbol:"hatch",destination:null};
  const {id:_,worldId:__,revision:___,archived:____,...draft}=ship;void _;void __;void ___;void ____;
  const updated={...draft,surface:{...draft.surface,plan:{...draft.surface.plan,features:[...draft.surface.plan.features,stair]}}};await call(scope,"",{action:"save",requestId:randomUUID(),craftId:fixture.craftId,surface:"exterior",revision:ship.revision,draft:updated});
  const command={action:"connect",requestId:randomUUID(),craftId:fixture.craftId,connectionId:randomUUID(),source:"exterior",sourceRevision:ship.revision+1,sourceFeatureId:stairId,destination:fixture.deckId,destinationRevision:1,arrivalFeatureId:randomUUID(),arrivalPoint:{x:12,y:40},kind:"hatch",twoWay:true,newDeck:null};
  const accepted=await call(scope,"",command) as {historical:{versionId:string}};assert.deepEqual(await call(scope,"",command),accepted);
  const exterior=await call(scope,query) as CraftBundle,connection=exterior.connections.find(connection=>connection.id===command.connectionId)!;assert.equal(connection.available,true);assert.equal(connection.historicalAccount!.startYear,500);
  const forward=await call(scope,`connection=${command.connectionId}`) as {surface:string},back=await call(fixture.deckScope,`connection=${command.connectionId}&reverse=1`) as {surface:string};assert.equal(forward.surface,fixture.deckId);assert.equal(back.surface,"exterior");
  const destination=await call(fixture.deckScope,`craft=${fixture.craftId}&surface=${fixture.deckId}`) as CraftBundle;assert.equal(destination.deck!.surface.plan.features.find(feature=>feature.id===command.arrivalFeatureId)?.name,"Arrival hatch");
  const pinned=await call({...scope,edit:false,versionId:accepted.historical.versionId},`connection=${command.connectionId}`) as {nativeUrl:string};assert.ok(pinned.nativeUrl);const params=new URL(pinned.nativeUrl,"http://owned").searchParams,retained={...fixture.deckScope,edit:false,versionId:params.get("atlasVersion")!,connectionSourceVersionId:params.get("atlasConnectionSource")!,connectionSourceId:command.connectionId};
  assert.equal((await call(retained,`craft=${fixture.craftId}&surface=${fixture.deckId}`) as CraftBundle).connections.find(connection=>connection.id===command.connectionId)?.available,true);
  assert.ok((await call(retained,`connection=${command.connectionId}&reverse=1`) as {nativeUrl:string}).nativeUrl);
  await assert.rejects(call(scope,"",{...command,requestId:randomUUID(),connectionId:randomUUID()}),/already connected|changed/);
  const account=connection.historicalAccount!,{sourceVersionId,destinationVersionId,...details}=account;
  const later=await changeNativeMapHistory("world-god",f.world,{action:"create",requestId:randomUUID(),timelineId,target:scope.target,sourceVersionId:accepted.historical.versionId,baselinePin:null,details:{name:"Ship900",startYear:900,endYear:900,account:"Exact earlier ship before a separate later route account",protected:false}}),laterScope={...scope,year:900,stateId:String(later.id)};
  // Deck900 already exists from the creation check. It deliberately predates
  // the new500arrival, so it must not silently acquire a usable route.
  const laterDeck=(await getNativeMapHistory("world-god",f.world,fixture.deckScope.target,timelineId,{year:900})).selected!,laterDeckScope={...fixture.deckScope,year:900,stateId:laterDeck.id};
  assert.equal((await call(laterScope,query) as CraftBundle).connections.find(connection=>connection.id===command.connectionId)?.available,false);
  const denied={action:"historical-account",requestId:randomUUID(),craftId:fixture.craftId,id:command.connectionId,revision:1,draft:{...details,startYear:900,endYear:900,account:"Review later entrance sources without inventing a missing arrival"},refreshSources:true};await assert.rejects(call(laterScope,"",denied),/active hatch|entrance|surface/i);
  assert.equal((await call(scope,query) as CraftBundle).connections.find(connection=>connection.id===command.connectionId)?.historicalAccount!.startYear,500);
  await call(laterScope,"",{...denied,requestId:randomUUID(),draft:{...denied.draft,status:"unknown",destinationMapId:null,destinationGeographyId:null},refreshSources:false});
  await assert.rejects(call(laterScope,`connection=${command.connectionId}`),/does not establish/);
  const laterDocument=(await call(laterDeckScope,`craft=${fixture.craftId}&surface=${fixture.deckId}`) as CraftBundle).deck!;
  await call(laterDeckScope,"",{action:"lifecycle",requestId:randomUUID(),craftId:fixture.craftId,surface:fixture.deckId,revision:laterDocument.revision,archived:true});
  await call(laterScope,"",{action:"connection-lifecycle",requestId:randomUUID(),craftId:fixture.craftId,connectionId:command.connectionId,revision:2,archived:true});
  assert.equal((await call(laterScope,query) as CraftBundle).connections.find(connection=>connection.id===command.connectionId)?.archived,true);
  assert.equal((await call(scope,query) as CraftBundle).connections.find(connection=>connection.id===command.connectionId)?.available,true);
  await writeFile(path.join(f.out,"native-craft-routes.json"),JSON.stringify({passed:true,datedCraftRouteAndDeliberateArrival:true,atomicSharedAccount:true,exactRetryAndEntranceConflict:true,twoWayReturn:true,retainedGeometryAndIndependentAccountPins:true,laterCopyDoesNotInventArrivalOrCoverage:true,laterUnknownStatusAndBrokenArchive:true,earlierRouteExact:true,originalSourcePins:[sourceVersionId,destinationVersionId],sharedDatabaseAccess:false},null,2));
}
