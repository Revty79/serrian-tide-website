import assert from "node:assert/strict";
import {cp,mkdir,readFile,writeFile,access} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {createHash,randomUUID,randomBytes} from "node:crypto";
import path from "node:path";
import pg from "pg";
import {ownedFreePort} from "./worlds-regional-editing-fixture";
import {publicTableDigests} from "./worlds-collaboration-fixture";
import type {ConsumptionRequest,ConsumptionManifest} from "../src/features/worlds/atlas-map-consumption";
import type {WorldEditorProof} from "../src/features/worlds/world-permissions";

async function sourceFingerprint(){
 const files=execFileSync("git",["ls-files","--cached","--others","--exclude-standard","-z"],{encoding:"utf8",windowsHide:true}).split("\0").filter(file=>file&&(file.startsWith("src/")||file.startsWith("data/")||file.startsWith("public/")||["package.json","package-lock.json","next.config.ts","postcss.config.mjs","tsconfig.json"].includes(file))).sort(),hash=createHash("sha256");
 for(const file of files)hash.update(file+"\0").update(await readFile(file));return {sourceHash:hash.digest("hex"),applicationDataAssetConfigFiles:files.length};
}
async function main(){
 const fingerprint=await sourceFingerprint();
 const source=path.resolve(process.env.SERRIAN_CONSUMPTION_SOURCE??"artifacts/collaboration-s7b-checkpoint-checkpoint-26"),out=path.resolve(process.env.SERRIAN_CONSUMPTION_OUT??"artifacts/collaboration-s7b-s7c-contract-1");
 assert.ok(source.startsWith(path.resolve("artifacts/collaboration-s7b-checkpoint-checkpoint-")));assert.ok(out.startsWith(path.resolve("artifacts/collaboration-s7b-s7c-")));assert.equal(await access(out).then(()=>true,()=>false),false);
 const old=JSON.parse(await readFile(path.join(source,"environment.json"),"utf8"));assert.equal(old.root,path.join(source,"owned-temp","resource"));assert.equal(old.data,path.join(old.root,"data"));assert.equal(await access(path.join(old.data,"postmaster.pid")).then(()=>true,()=>false),false);
 const checkpoint=JSON.parse(await readFile(path.join(source,"integration-checkpoint-browser.json"),"utf8"));assert.equal(checkpoint.passed,true);assert.equal(checkpoint.sourceWorld,old.world);
 const root=path.join(out,"owned-temp","contract"),data=path.join(root,"data");await mkdir(root,{recursive:true});await cp(old.data,data,{recursive:true});await cp(path.join(old.root,"terrain"),path.join(root,"terrain"),{recursive:true});
 const port=await ownedFreePort(),url=new URL(old.databaseUrl);assert.equal(url.hostname,"127.0.0.1");assert.notEqual(url.port,"5432");url.port=String(port);
 process.env.DATABASE_URL=url.toString();process.env.SERRIAN_TERRAIN_ROOT=path.join(root,"terrain");process.env.SERRIAN_ASSET_ROOT=path.join(root,"private-artwork");process.env.BETTER_AUTH_SECRET="stage7c-owned-disposable-only-secret";process.env.BETTER_AUTH_URL=`http://127.0.0.1:${await ownedFreePort()}`;process.env.RENDER="false";
 const bin="C:/Program Files/PostgreSQL/18/bin",run=(args:string[])=>execFileSync(path.join(bin,"pg_ctl.exe"),args,{windowsHide:true,stdio:"ignore"});let started=false;const pool=new pg.Pool({connectionString:url.toString()}),groups:string[]=[],receipts:unknown[]=[];
 try{
  run(["-D",data,"-l",path.join(root,"postgres.log"),"-o",`-h 127.0.0.1 -p ${port}`,"-w","start"]);started=true;
  assert.equal((await pool.query("select count(*)::int n from drizzle.__drizzle_migrations")).rows[0].n,161);
  const {hashPassword}=await import("better-auth/crypto"),password="Stage7C-Owned-Fixture-Only!",actors=["world-god","world-player","world-admin","collab-viewer","collab-editor","collab-uninvited"];
  await pool.query("update account set password=$1 where user_id=any($2::text[]) and provider_id='credential'",[await hashPassword(password),actors]);
  const {auth}=await import("../src/lib/auth"),sessions=new Map<string,string>();
  for(const [index,actor] of actors.entries()){
   const email=(await pool.query('select email from "user" where id=$1',[actor])).rows[0].email;
   const response=await auth.handler(new Request(process.env.BETTER_AUTH_URL+"/api/auth/sign-in/email",{method:"POST",headers:{Origin:process.env.BETTER_AUTH_URL,"Content-Type":"application/json","X-Forwarded-For":`198.51.100.${index+1}`},body:JSON.stringify({email,password})}));
   assert.equal(response.status,200,`Real authentication ${actor}`);const result=await response.json();const session=(await pool.query("select id from session where user_id=$1 and token=$2",[actor,result.token])).rows[0];assert.ok(session);sessions.set(actor,session.id);
  }
  const {withWorldRequestAuthority}=await import("../src/features/worlds/world-authorization-context"),service=await import("../src/features/worlds/atlas-map-consumption-service"),contract=await import("../src/features/worlds/atlas-map-consumption");
  const as=<T>(actor:string,run:()=>Promise<T>,review=false,proof:WorldEditorProof|null=null)=>withWorldRequestAuthority({userId:actor,sessionId:sessions.get(actor)!,review,proof,operationId:randomUUID(),reads:new Map()},run);
  const rejected=(status:number)=>(e:unknown)=>!!e&&typeof e==="object"&&"status" in e&&e.status===status;
  const request=async(world:string,kind:string,id:string):Promise<ConsumptionRequest>=>{
   const row=(await pool.query("select v.id,v.state_id,v.timeline_id,v.start_year,v.payload->'nativeAtlas'->'target' target from world_map_state_head h join world_map_state_version v on v.id=h.version_id where h.world_id=$1 and v.payload#>>'{nativeAtlas,target,kind}'=$2 and v.payload#>>'{nativeAtlas,target,id}'=$3 and not v.protected and not v.archived order by v.start_year,v.id limit 1",[world,kind,id])).rows[0];assert.ok(row,`Saved ${kind} ${id}`);return {target:row.target,timelineId:row.timeline_id,stateId:row.state_id,versionId:row.id,year:Number(row.start_year)};
  };
  const world=old.world as string,route=checkpoint.journeys.find((j:{world:string;route:{root:string}})=>j.world===world&&j.route.root===checkpoint.fixture.publicHall.root)?.route;assert.ok(route);const targets=[["terrain",route.root],["terrain",route.region],["town",route.townMap],["floor",route.groundId],["underground",route.dungeonId],["craft",checkpoint.fixture.craftRoute.craftId],["deck",checkpoint.fixture.craftRoute.deckId]] as [string,string][];
  const before=await publicTableDigests(pool),manifests:ConsumptionManifest[]=[];
  groups.push=(...items:string[])=>{for(const item of items)console.log("PASS contract group",item);return Array.prototype.push.apply(groups,items);};
  for(const [kind,id]of targets){
   const r=await request(world,kind,id),start=performance.now(),m=await as("world-god",()=>service.readAtlasMapContract("world-god",world,r));service.validateAtlasMapManifest(m);assert.equal(m.publication,"not-published");
   for(const resource of m.resources){const value=await as("world-god",()=>service.readAtlasMapResource("world-god",m.pin,resource.key));service.validateAtlasMapResource(m,resource.key,value);assert.equal(JSON.stringify(value).includes("CANON-GEOGRAPHY-SECRET-NOTE"),false);}
   assert.equal(m.source.versionId,r.versionId);manifests.push(m);receipts.push({family:m.family,source:m.source,resources:m.resources.length,connections:m.connections.count,bytes:Buffer.byteLength(JSON.stringify(m)),durationMs:performance.now()-start});console.log("PASS native family",m.family);
  }
  assert.deepEqual(new Set(manifests.map(m=>m.family)),new Set(["world","regional","town","floor","underground","craft","deck"]));groups.push("seven-native-families");
  const rootManifest=manifests[0],rootRequest=rootManifest.source,{worldId:_,...rootScope}=rootRequest;void _;
  const ordinary=await as("world-player",()=>service.readAtlasMapContract("world-player",world,rootScope));assert.equal(ordinary.provenance.kind,"canon-source");
  const past=await as("world-god",()=>service.readAtlasMapContract("world-god",world,{...rootScope,year:rootManifest.history.startYear-1}));assert.equal(past.history.coverage,"unknown");assert.equal(past.source.versionId,rootManifest.source.versionId);groups.push("historical-identity-and-unknown-coverage");
  const tileResource=await as("world-god",()=>service.readAtlasMapResource("world-god",rootManifest.pin,"geometry"));assert.equal(tileResource.kind,"geometry");
  if(tileResource.kind==="geometry"&&"tiles" in tileResource.value&&tileResource.value.tiles.length){const tiles=await as("world-player",()=>service.readAtlasMapTiles("world-player",ordinary.pin,"geometry",[0]));assert.equal(tiles[0].samples.length,1024);}
  await assert.rejects(as("world-player",()=>service.readAtlasMapResource("world-player",{...ordinary.pin,sha256:"a".repeat(64)},"geometry")),rejected(409));
  await assert.rejects(as("world-player",()=>service.readAtlasMapResource("world-player",ordinary.pin,"private-file")),rejected(404));
  const copies=(await pool.query("select target_world_id from world_canon_copy where source_world_id=$1 and status='accepted' order by target_world_id",[world])).rows;assert.equal(copies.length,2);
  const personal=copies[0].target_world_id,identity=(await pool.query("select i.target_id from world_canon_copy_identity i join world_canon_copy c on c.request_id=i.request_id where c.target_world_id=$1 and i.source_id=$2",[personal,targets[0][1]])).rows[0].target_id;
  const personalRequest=await request(personal,"terrain",identity),personalManifest=await as("world-player",()=>service.readAtlasMapContract("world-player",personal,personalRequest));assert.equal(personalManifest.provenance.kind,"personal-variation");assert.equal(personalManifest.provenance.sourceWorldId,world);assert.notEqual(personalManifest.source.target.id,rootManifest.source.target.id);assert.equal(personalManifest.provenance.sourceTarget?.id,rootManifest.source.target.id);assert.ok(personalManifest.provenance.sourceVersionId);
  await assert.rejects(as("collab-uninvited",()=>service.readAtlasMapContract("collab-uninvited",personal,personalRequest)),rejected(404));
  const review=await as("world-admin",()=>service.readAtlasMapContract("world-admin",personal,personalRequest),true);assert.equal(review.publication,"not-published");assert.equal(review.readOnly,true);
  const protectedVersion=(await pool.query("select v.id,v.state_id,v.timeline_id,v.start_year,v.payload->'nativeAtlas'->'target' target from world_map_state_head h join world_map_state_version v on v.id=h.version_id where h.world_id=$1 and v.protected and v.payload ? 'nativeAtlas' and v.state_id is not null limit 1",[world])).rows[0];assert.ok(protectedVersion);
  await assert.rejects(as("world-admin",()=>service.readAtlasMapContract("world-admin",world,{target:protectedVersion.target,stateId:protectedVersion.state_id,versionId:protectedVersion.id,timelineId:protectedVersion.timeline_id,year:Number(protectedVersion.start_year)}),true),rejected(404));groups.push("canon-personal-admin-and-uninvited-boundaries");
  assert.deepEqual(await publicTableDigests(pool),before,"All producer reads preserve every public table, including audit/session/lease state");groups.push("read-only-all-public-table-equality");
  const collaboration=await import("../src/features/worlds/world-collaboration-service");
  for(const [actor,username,role]of [["collab-viewer","invited_viewer","viewer"],["collab-editor","invited_editor","editor"]] as const){
   await as("world-player",()=>collaboration.changeWorldCollaboration("world-player",personal,{action:"invite",requestId:randomUUID(),username,role,scopes:["history","appearances","atlas"],protectedContent:false}));
   const invite=(await collaboration.worldInvitationInbox(actor)).find(i=>i.worldId===personal&&i.state==="pending");assert.ok(invite);
   await as(actor,()=>collaboration.decideWorldInvitation(actor,{action:"accept",requestId:randomUUID(),invitationId:invite.id,revision:invite.revision}));
   const scoped=await as(actor,()=>service.readAtlasMapContract(actor,personal,personalRequest));assert.equal(scoped.readOnly,true);assert.equal(scoped.resources.some(r=>r.kind==="composition"),false);
  }
  const mapped=async(copyWorld:string,sourceId:string)=>(await pool.query("select i.target_id from world_canon_copy_identity i join world_canon_copy c on c.request_id=i.request_id where c.target_world_id=$1 and i.source_id=$2",[copyWorld,sourceId])).rows[0].target_id as string;
  const townRequest=await request(personal,"town",await mapped(personal,targets[2][1]));
  await assert.rejects(as("collab-viewer",()=>service.readAtlasMapContract("collab-viewer",personal,townRequest)),rejected(404));
  await assert.rejects(service.readAtlasMapContract("world-player",personal,personalRequest),rejected(401));
  const limited=await as("collab-viewer",()=>service.readAtlasMapContract("collab-viewer",personal,personalRequest));
  const blocker=await pool.connect();await blocker.query("begin");await blocker.query("lock table world_map_state_component in access exclusive mode");
  const inFlight=as("collab-viewer",()=>service.readAtlasMapResource("collab-viewer",limited.pin,"geometry")),denied=assert.rejects(inFlight,rejected(404));
  try{
   const deadline=Date.now()+15000;for(;;){const waiting=(await pool.query("select count(*)::int n from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query ilike '%world_map_state_component%' and pid<>pg_backend_pid()")).rows[0].n;if(waiting)break;assert.ok(Date.now()<deadline,"Actual retained-resource read must block after authorization");await new Promise(r=>setTimeout(r,25));}
   const membership=(await pool.query("select revision from world_access_participant where world_id=$1 and user_id='collab-viewer'",[personal])).rows[0];
   await as("world-player",()=>collaboration.changeWorldCollaboration("world-player",personal,{action:"revoke",requestId:randomUUID(),userId:"collab-viewer",revision:membership.revision}));
  }finally{await blocker.query("rollback");blocker.release();}
  await denied;await assert.rejects(as("collab-viewer",()=>service.readAtlasMapResource("collab-viewer",limited.pin,"geometry")),rejected(404));groups.push("real-scoped-grants-and-blocked-read-revocation");console.log("PASS scoped and concurrent revocation");
  const prior=await as("world-player",()=>service.readAtlasMapContract("world-player",personal,townRequest)),priorGeometry=await as("world-player",()=>service.readAtlasMapResource("world-player",prior.pin,"geometry"));
  assert.equal(priorGeometry.kind,"geometry");assert.ok(priorGeometry.kind==="geometry"&&priorGeometry.value.family==="town");
  const otherWorld=copies[1].target_world_id,otherRequest=await request(otherWorld,"town",await mapped(otherWorld,targets[2][1])),otherBefore=await as("world-player",()=>service.readAtlasMapContract("world-player",otherWorld,otherRequest));
  const proof:WorldEditorProof={clientId:randomUUID(),token:randomBytes(32).toString("hex")};const control=await as("world-player",()=>collaboration.changeWorldCollaboration("world-player",personal,{action:"reclaim-control",requestId:randomUUID(),proof,confirm:true}),false,proof);proof.fence=control.access.editor.fence!;assert.ok(proof.fence!==null&&proof.fence!==undefined);
  const design=structuredClone(priorGeometry.value.design),building=design.features.find(f=>f.kind==="building"&&!f.archived);assert.ok(building);assert.equal(building.kind,"building");
  design.features=design.features.map(f=>f.id===building.id&&f.kind==="building"?{...f,points:f.points.map(p=>({...p,x:p.x+.25}))}:f);design.layers.buildings.locked=false;
  const command={action:"save",requestId:randomUUID(),mapId:townRequest.target.id,revision:prior.sourceRevision,name:"Consumer pin later geometric edit",design};
  const {withNativeHistoryWrite}=await import("../src/features/worlds/native-map-history-write"),{saveNativeTown}=await import("../src/features/worlds/native-map-history-shapes"),{versionId:oldVersion,...working}=townRequest;void oldVersion;
  await as("world-player",()=>withNativeHistoryWrite("world-player",personal,{...working,edit:true},{requestId:command.requestId,endpoint:"town-maps",command},(tx,c)=>saveNativeTown(tx,c,command)),false,proof);
  const afterEdit=await as("world-player",()=>service.readAtlasMapContract("world-player",personal,townRequest));assert.deepEqual(afterEdit,prior);assert.deepEqual(await as("world-player",()=>service.readAtlasMapResource("world-player",prior.pin,"geometry")),priorGeometry);
  const newRequest=await request(personal,"town",townRequest.target.id);assert.notEqual(newRequest.versionId,townRequest.versionId);const newer=await as("world-player",()=>service.readAtlasMapContract("world-player",personal,newRequest));assert.notEqual(newer.pin.sha256,prior.pin.sha256);
  assert.deepEqual(await as("world-player",()=>service.readAtlasMapContract("world-player",otherWorld,otherRequest)),otherBefore);assert.deepEqual(await as("world-god",()=>service.readAtlasMapContract("world-god",world,rootScope)),rootManifest);
  groups.push("actual-later-geometry-edit-preserves-original-pin-source-and-other-variation");console.log("PASS actual geometry edit and immutable pin");
  // Deliberate authoring of a retained appearance is fixture setup. The
  // consumption producer never captures or writes a baseline itself.
  const fixture=JSON.parse(await readFile(path.join(source,"integration-checkpoint-browser.json"),"utf8")).fixture;
  const largeId=await mapped(personal,fixture.largeMap),history=await import("../src/features/worlds/native-map-history-service"),largeTarget={kind:"terrain" as const,id:largeId};
  const largeHistory=await as("world-player",()=>history.getNativeMapHistory("world-player",personal,largeTarget,personalRequest.timelineId,{prepareBaseline:true,year:9000}),false,proof);assert.ok(largeHistory.baselinePin);
  await as("world-player",()=>history.changeNativeMapHistory("world-player",personal,{action:"create",requestId:randomUUID(),timelineId:personalRequest.timelineId,target:largeTarget,sourceVersionId:null,baselinePin:largeHistory.baselinePin,details:{name:"Largest contract numerical fixture",startYear:9000,endYear:9001,account:"",protected:false}}),false,proof);
  const largeRequest=await request(personal,"terrain",largeId),time=performance.now(),large=await as("world-player",()=>service.readAtlasMapContract("world-player",personal,largeRequest)),manifestMs=performance.now()-time;
  const largeGeometry=await as("world-player",()=>service.readAtlasMapResource("world-player",large.pin,"geometry"));assert.ok(largeGeometry.kind==="geometry"&&"settings" in largeGeometry.value);assert.equal(largeGeometry.value.settings.gridWidth*largeGeometry.value.settings.gridHeight,1048576);assert.equal(largeGeometry.value.tiles.length,1024);assert.ok(manifestMs<10000);assert.ok(Buffer.byteLength(JSON.stringify(large))<=contract.ATLAS_CONSUMPTION.manifestBytes);
  const restored=new Int16Array(1048576).fill(largeGeometry.value.baseElevation);let batches=0;
  for(let offset=0;offset<largeGeometry.value.tiles.length;offset+=contract.ATLAS_CONSUMPTION.tileBatch){const indexes=Array.from({length:Math.min(contract.ATLAS_CONSUMPTION.tileBatch,largeGeometry.value.tiles.length-offset)},(_,i)=>offset+i),tiles=await as("world-player",()=>service.readAtlasMapTiles("world-player",large.pin,"geometry",indexes));batches++;for(const tile of tiles)for(let row=0;row<32;row++)for(let column=0;column<32;column++)restored[(tile.y*32+row)*1024+tile.x*32+column]=tile.samples[row*32+column];}
  const terrain=await import("../src/features/worlds/terrain-service"),numeric=await import("../src/features/worlds/terrain"),actual=await as("world-player",()=>terrain.getTerrain("world-player",personal,{mapId:largeId}));assert.ok(actual.document);const saved=numeric.createGrid(actual.document.baseElevation,actual.document.tiles,numeric.terrainGeometry(actual.document.settings)),digest=(grid:Int16Array)=>createHash("sha256").update(new Uint8Array(grid.buffer)).digest("hex");assert.equal(digest(restored),digest(saved));groups.push("largest-million-sample-source-verifies-through-32-bounded-tile-batches");receipts.push({family:"largest-world",source:large.source,manifestMs,manifestBytes:Buffer.byteLength(JSON.stringify(large)),samples:1048576,batches,gridSha256:digest(restored)});
  assert.throws(()=>service.validateAtlasMapManifest({...large,sourceRevision:large.sourceRevision+1}));
  const first=largeGeometry.value.tiles[0],storage=await import("../src/features/worlds/terrain-storage"),object=storage.terrainObjectPath(process.env.SERRIAN_TERRAIN_ROOT!,first.sha256);assert.ok(object.startsWith(path.join(root,"terrain")+path.sep));const original=await readFile(object);
  try{await writeFile(object,Buffer.alloc(2048,7));await assert.rejects(as("world-player",()=>service.readAtlasMapTiles("world-player",large.pin,"geometry",[0])),rejected(409));}finally{await writeFile(object,original);}
  await assert.rejects(as("world-player",()=>service.readAtlasMapTiles("world-player",large.pin,"geometry",Array.from({length:33},(_,i)=>i))));groups.push("corrupt-objects-and-incompatible-pins-fail-without-unbounded-file-access");
  const branches=await import("../src/features/worlds/branching-history-service"),parent=(await pool.query("select revision from world_timeline where world_id=$1 and id=$2",[personal,personalRequest.timelineId])).rows[0];
  const branch=await as("world-player",()=>branches.changeTimeline("world-player",personal,{action:"create",parentRevision:parent.revision,draft:{name:"Consumer adopted branch",description:"",explanation:"",parentId:personalRequest.timelineId,divergenceYear:9000}}),false,proof);
  await assert.rejects(as("world-player",()=>service.readAtlasMapContract("world-player",personal,{...largeRequest,timelineId:branch})),rejected(404));
  await as("world-player",()=>history.changeNativeMapHistory("world-player",personal,{action:"retain",requestId:randomUUID(),target:largeTarget,timelineId:branch,stateId:largeRequest.stateId,sourceVersionId:largeRequest.versionId,sourceRevision:1}),false,proof);
  const adopted=await as("world-player",()=>service.readAtlasMapContract("world-player",personal,{...largeRequest,timelineId:branch}));assert.equal(adopted.source.timelineId,branch);assert.equal(adopted.history.originTimelineId,largeRequest.timelineId);assert.equal(adopted.source.versionId,largeRequest.versionId);groups.push("alternate-branch-requires-explicit-adoption-and-retains-source-timeline");
  const geographic=await import("../src/features/worlds/geographic-service"),surface=await as("world-player",()=>geographic.changeGeography("world-player",personal,{action:"surface",requestId:randomUUID(),name:"Contract protected geographic surface",reference:{version:1,kind:"plane",crs:"LOCAL:METRES",units:"metres",bounds:[0,0,640000,640000]},realmId:null,timelineId:personalRequest.timelineId,protected:true}),false,proof);
  await pool.query("insert into world_geo_view(map_id,world_id,surface_id) values($1,$2,$3)",[personalRequest.target.id,personal,surface.id]);
  await assert.rejects(as("world-player",()=>service.readAtlasMapResource("world-player",personalManifest.pin,"geometry")),rejected(404));await assert.rejects(as("world-admin",()=>service.readAtlasMapContract("world-admin",personal,personalRequest),true),rejected(404));groups.push("ordinary-consumer-never-bypasses-protected-geographic-bindings-even-in-review");
  await as("world-player",()=>collaboration.changeWorldCollaboration("world-player",personal,{action:"release-control",requestId:randomUUID(),proof}),false,proof);
  await writeFile(path.join(out,"manifest-samples.json"),JSON.stringify(manifests,null,2));
  assert.deepEqual(await sourceFingerprint(),fingerprint,"Source files remain frozen throughout the contract fixture");
  await writeFile(path.join(out,"contract-results.json"),JSON.stringify({passed:true,...fingerprint,groups,receipts,sourceCheckpoint:"5961382469f8c3014b09db8bc644f93dc74aa191",allPublicTablesExact:Object.keys(before).length,realAuthentication:actors.length,publicationImplemented:false,newMigration:false,noSharedAccess:true},null,2));
 }catch(error){await writeFile(path.join(out,"failure.txt"),error instanceof Error?error.stack??error.message:String(error));throw error;}
 finally{await pool.end();if(process.env.DATABASE_URL===url.toString()){const {pool:app}=await import("../src/db");if(!app.ended)await app.end();}if(started)run(["-D",data,"-m","fast","-w","stop"]);await writeFile(path.join(out,"owned-services-stopped.json"),JSON.stringify({stopped:true,noSharedAccess:true}));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
