import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import type {RegionalFixture} from "./worlds-regional-editing-fixture";
import type {NativeHistoryScope} from "../src/features/worlds/native-map-history";
import type {TownMapBundle} from "../src/features/worlds/town-map";
export async function validateNativeLifecycle(f:RegionalFixture,timelineId:string){
  const {nativeContentRequest}=await import("../src/features/worlds/native-map-history-api"),{nativeHistoryUrl}=await import("../src/features/worlds/native-map-history"),{getNativeMapHistory}=await import("../src/features/worlds/native-map-history-service");
  const fixture=JSON.parse(await readFile(path.join(f.out,"native-town-creation.json"),"utf8")).fixture as {mapId:string;scope:NativeHistoryScope},scope=fixture.scope;
  const call=(binding:NativeHistoryScope,query:string,body?:unknown)=>nativeContentRequest(new Request("http://owned.invalid"+nativeHistoryUrl(`/api/worlds/${f.world}/town-maps${query?"?"+query:""}`,binding),body?{method:"POST",body:JSON.stringify(body)}:undefined),"world-god");
  const original=(await call(scope,`map=${fixture.mapId}`) as TownMapBundle).document!,laterHistory=(await getNativeMapHistory("world-god",f.world,scope.target,timelineId,{year:900})).selected!,laterScope={...scope,year:900,stateId:laterHistory.id},later=(await call(laterScope,`map=${fixture.mapId}`) as TownMapBundle).document!,canonical=(await f.pool.query("select name,design,archived,revision from world_town_map where id=$1",[fixture.mapId])).rows[0];
  const renamed="Town name recorded in500";await call(scope,"",{action:"save",requestId:randomUUID(),mapId:fixture.mapId,revision:original.revision,name:renamed,design:original.design});
  assert.equal((await call(scope,`town=${original.townId}`) as TownMapBundle).maps.find(map=>map.id===fixture.mapId)!.name,renamed);
  assert.equal((await call(laterScope,`town=${original.townId}`) as TownMapBundle).maps.find(map=>map.id===fixture.mapId)!.name,later.name);
  const snapshot=(await getNativeMapHistory("world-god",f.world,scope.target,timelineId,{year:500})).selected!.versionId,archive={action:"lifecycle",requestId:randomUUID(),mapId:fixture.mapId,revision:original.revision+1,archived:true},accepted=await call(scope,"",archive);assert.deepEqual(await call(scope,"",archive),accepted);
  const archived=(await call(scope,`map=${fixture.mapId}`) as TownMapBundle).document!;assert.equal(archived.archived,true);assert.equal(archived.canEdit,false);
  assert.equal((await call(scope,`town=${original.townId}`) as TownMapBundle).maps.find(map=>map.id===fixture.mapId)!.archived,true);
  assert.equal((await call(laterScope,`map=${fixture.mapId}`) as TownMapBundle).document!.archived,false);
  assert.equal((await call({...scope,edit:false,versionId:snapshot},`map=${fixture.mapId}`) as TownMapBundle).document!.archived,false);
  await assert.rejects(call(scope,"",{action:"save",requestId:randomUUID(),mapId:fixture.mapId,revision:archived.revision,name:renamed,design:original.design}),/Restore/);
  await call(scope,"",{action:"lifecycle",requestId:randomUUID(),mapId:fixture.mapId,revision:archived.revision,archived:false});
  assert.deepEqual((await call(scope,`map=${fixture.mapId}`) as TownMapBundle).document!.design,original.design);assert.deepEqual((await f.pool.query("select name,design,archived,revision from world_town_map where id=$1",[fixture.mapId])).rows[0],canonical);
  await writeFile(path.join(f.out,"native-lifecycle.json"),JSON.stringify({passed:true,datedTownRenameAndInventory:true,archiveRestoreAndWriteGuard:true,exactLifecycleRetry:true,earlierImmutableAndLaterAppearancesExact:true,canonicalBirthRecordExact:true,sharedDatabaseAccess:false},null,2));
}
