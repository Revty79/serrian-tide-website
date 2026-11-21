/** Newly owned synthetic fixture only. Owner DEV and external geography are never loaded. */
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {withCollaborationFixture,publicTableDigests,type CollaborationFixture} from "./worlds-collaboration-fixture";
import {terrainGeometry,createGrid,type TerrainDocument} from "../src/features/worlds/terrain";
import type {RefinementMeta} from "../src/features/worlds/terrain-refinement";
import type {SharedProfile} from "../src/features/worlds/terrain-shared-relief";
import {decodeSharedReliefPreview} from "../src/features/worlds/terrain-shared-relief-packet";
process.env.SERRIAN_COLLAB_OUT??=`artifacts/collaboration-s7b-shared-relief-database-${Date.now()}`;
const digest=(g:Int16Array)=>createHash("sha256").update(new Uint8Array(g.buffer,g.byteOffset,g.byteLength)).digest("hex");
let seed:{mapId:string;root:TerrainDocument;fine:RefinementMeta;child:RefinementMeta}|undefined;
async function beforeSharedReliefUpgrade(f:CollaborationFixture){
 const terrain=await import("../src/features/worlds/terrain-service"),detail=await import("../src/features/worlds/terrain-refinement-service"),mapId=randomUUID();
 await terrain.changeTerrain("collab-owner-a",f.worldA,{action:"create",requestId:mapId,name:"Owned shared-relief parent context",initial:"land",settings:{gridWidth:128,gridHeight:128,widthKm:12.8,heightKm:12.8,wrap:false}});
 const root=(await terrain.getTerrain("collab-owner-a",f.worldA,{mapId})).document!;
 async function create(parentId:string|null,parentRevision:number,name:string,frame:RefinementMeta["frame"]){const id=randomUUID();await detail.createRefinement("collab-owner-a",f.worldA,{action:"create",requestId:id,mapId,parentId,parentRevision,name,frame,gridWidth:128,gridHeight:128,previewHash:digest(new Int16Array(128*128).fill(500))});return (await detail.getRefinements("collab-owner-a",f.worldA,mapId)).refinements.find(s=>s.id===id)!;}
 const fine=await create(null,root.revision,"Owned retained parent",{x:3200,y:3200,width:6400,height:6400}),child=await create(fine.id,1,"Owned retained child",{x:4800,y:4800,width:1600,height:1600});
 seed={mapId,root,fine,child};
 assert.equal((await f.pool.query("select to_regprocedure('public.world_native_shared_relief_schema()') capability")).rows[0].capability,null);
}
withCollaborationFixture(async f=>{
 assert(seed);const s=seed,terrain=await import("../src/features/worlds/terrain-service"),detail=await import("../src/features/worlds/terrain-refinement-service"),shared=await import("../src/features/worlds/terrain-shared-relief-service"),groups:string[]=[];
 const pass=async(name:string)=>{groups.push(name);console.log("PASS "+name);await writeFile(path.join(f.out,"progress.json"),JSON.stringify({groups},null,2));};
 const operation:SharedProfile={kind:"landform-profile",selection:{frame:{x:2000,y:2000,width:8000,height:8000}},points:[{x:3000,y:3500,elevationM:3200,widthM:6000},{x:9000,y:8500,elevationM:4700,widthM:6000}],mode:"shape",preserveManual:false,strength:100,hardness:.2,endBlendM:1000,featherM:0},command={action:"preview",mapId:s.mapId,operation,workArea:operation.selection.frame};
 const before=await publicTableDigests(f.pool),bytes=await shared.previewSharedRelief("collab-owner-a",f.worldA,command),preview=await decodeSharedReliefPreview(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer);
 assert.deepEqual(await publicTableDigests(f.pool),before);assert.equal(preview.header.windows.length,3);assert.equal(preview.header.effects.length,3);assert(preview.header.effects.every(e=>e.changed>0));
 await assert.rejects(shared.previewSharedRelief("collab-owner-b",f.worldA,command));await pass("additive populated upgrade preserves all prior tables; bounded preview is read-only and private");
 const accept={...command,action:"accept",requestId:randomUUID(),contextPin:preview.header.contextPin,previewHash:preview.header.previewHash};
 await assert.rejects(shared.changeSharedRelief("collab-owner-a",f.worldA,{...accept,previewHash:"0".repeat(64)}),/changed|retained/);assert.deepEqual(await publicTableDigests(f.pool),before);
 const result=await shared.changeSharedRelief("collab-owner-a",f.worldA,accept),retry=await shared.changeSharedRelief("collab-owner-a",f.worldA,accept);assert.deepEqual(retry,result);assert.equal(result.revision,2);
 const root=(await terrain.getTerrain("collab-owner-a",f.worldA,{mapId:s.mapId})).document!,shape=terrainGeometry(root.settings),grid=createGrid(root.baseElevation,root.tiles,shape),expected=new Int16Array(128*128).fill(500),rootWindow=preview.header.windows[0];
 for(let y=0;y<rootWindow.height;y++)expected.set(preview.windows[0].after.subarray(y*rootWindow.width,(y+1)*rootWindow.width),(rootWindow.y+y)*128+rootWindow.x);assert.deepEqual(grid,expected);
 const metas=(await detail.getRefinements("collab-owner-a",f.worldA,s.mapId)).refinements;
 for(const m of metas){const old=m.id===s.fine.id?s.fine:s.child;assert.equal(m.revision,2);assert.equal(m.parentRevision,2);assert.deepEqual(m.frame,old.frame);assert.equal(m.gridWidth,old.gridWidth);assert.equal(m.gridHeight,old.gridHeight);assert.equal(m.parentId,old.parentId);const row=(await f.pool.query("select source from world_terrain_refinement_version where refinement_id=$1 and revision=2",[m.id])).rows[0];assert.equal(row.source.sharedRelief.groupId,accept.requestId);const oldRead=await detail.getRefinementTiles("collab-owner-a",f.worldA,s.mapId,m.id,{revision:1,historical:true,lod:0,keys:[0]});assert.equal(oldRead.refinement.parentRevision,1);assert(oldRead.tiles[0].samples.every((n:number)=>n===500));}
 assert.equal((await f.pool.query("select count(*)::int n from world_terrain_relief_group")).rows[0].n,1);await pass("one atomic group advances the Root and unequal native sources, preserves identity and old pins, and exact retries add no revision");
 const current=await publicTableDigests(f.pool);await assert.rejects(shared.changeSharedRelief("collab-owner-a",f.worldA,{...accept,requestId:randomUUID()}),/changed|retained/);assert.deepEqual(await publicTableDigests(f.pool),current);
 const group=(await f.pool.query("select * from world_terrain_relief_group where id=$1",[accept.requestId])).rows[0],state=group.after_state;
 assert.equal((await f.pool.query("select world_relief_state_matches($1::jsonb,$2,$3) matches",[JSON.stringify(state),s.root.terrainId,f.worldA])).rows[0].matches,true);
 assert.equal((await f.pool.query("select world_relief_state_matches($1::jsonb,$2,$3) matches",[JSON.stringify(state.slice(1)),s.root.terrainId,f.worldA])).rows[0].matches,false);
 const partialId=randomUUID(),after=state.map((r:Record<string,unknown>,i:number)=>i? r:{...r,revision:Number(r.revision)+1,contentHash:"0".repeat(64)}),connection=await f.pool.connect();
 try{await connection.query("begin");await connection.query("select set_config('serrian.shared_relief_group',$1,true)",[partialId]);await connection.query("insert into world_terrain_relief_group(id,world_id,terrain_id,map_id,action,content_hash,context_pin,preview_hash,sea_level,operation,work_area,before_state,after_state,effects,author_id) values($1,$2,$3,$4,'apply',$5,$5,$5,0,$6,$7,$8,$9,'[]'::jsonb,'collab-owner-a')",[partialId,f.worldA,s.root.terrainId,s.mapId,"0".repeat(64),operation,command.workArea,JSON.stringify(state),JSON.stringify(after)]);await assert.rejects(connection.query("commit"),/partial source vector/);}finally{await connection.query("rollback");connection.release();}
 for(const query of ["update world_terrain_relief_group set sea_level=1","delete from world_terrain_relief_group","truncate world_terrain_relief_group"])await assert.rejects(f.pool.query(query),/immutable/i);
 await assert.rejects(f.pool.query("update world_terrain_refinement set parent_revision=1,revision=revision+1 where id=$1",[s.fine.id]),/checked|identity|coverage/i);
 assert.deepEqual(await publicTableDigests(f.pool),current);await pass("stale acceptance, incomplete source vectors, partial publication, immutable-history writes and unchecked parent rebases are refused with exact rollback");
 const undoCommand={action:"undo",mapId:s.mapId,requestId:randomUUID(),groupId:result.groupId},undo=await shared.changeSharedRelief("collab-owner-a",f.worldA,undoCommand);assert.equal(undo.revision,3);assert.deepEqual(await shared.changeSharedRelief("collab-owner-a",f.worldA,undoCommand),undo);
 const undone=(await terrain.getTerrain("collab-owner-a",f.worldA,{mapId:s.mapId})).document!;assert.deepEqual(createGrid(undone.baseElevation,undone.tiles,shape),new Int16Array(128*128).fill(500));
 for(const m of (await detail.getRefinements("collab-owner-a",f.worldA,s.mapId)).refinements){assert.equal(m.revision,3);assert.equal(m.parentRevision,1);for(let key=0;key<16;key++){const old=await detail.getRefinementTiles("collab-owner-a",f.worldA,s.mapId,m.id,{revision:3,lod:0,keys:[key]});assert(old.tiles[0].samples.every((n:number)=>n===500));}}
 const history=await shared.getSharedReliefHistory("collab-owner-a",f.worldA,s.mapId);assert.equal(history.current?.canRedo,true);assert.equal(history.current?.canUndo,false);
 const redoCommand={action:"redo",mapId:s.mapId,requestId:randomUUID(),groupId:undo.groupId},redo=await shared.changeSharedRelief("collab-owner-a",f.worldA,redoCommand);assert.equal(redo.revision,4);assert.deepEqual(await shared.changeSharedRelief("collab-owner-a",f.worldA,redoCommand),redo);
 const redone=(await terrain.getTerrain("collab-owner-a",f.worldA,{mapId:s.mapId})).document!;assert.deepEqual(createGrid(redone.baseElevation,redone.tiles,shape),grid);
 for(const m of (await detail.getRefinements("collab-owner-a",f.worldA,s.mapId)).refinements){assert.equal(m.revision,4);assert.equal(m.parentRevision,2);const slot=preview.header.windows.findIndex(w=>w.id===m.id),w=preview.header.windows[slot],g=new Int16Array(128*128).fill(500);for(let y=0;y<w.height;y++)g.set(preview.windows[slot].after.subarray(y*w.width,(y+1)*w.width),(w.y+y)*128+w.x);for(let key=0;key<16;key++){const packet=await detail.getRefinementTiles("collab-owner-a",f.worldA,s.mapId,m.id,{revision:4,lod:0,keys:[key]});const tile=packet.tiles[0];for(let i=0;i<1024;i++)assert.equal(tile.samples[i],g[(tile.y*32+Math.floor(i/32))*128+tile.x*32+i%32]);}}
 assert.equal((await shared.getSharedReliefHistory("collab-owner-a",f.worldA,s.mapId)).current?.canUndo,true);await pass("whole-group Undo and Redo restore every native height and the original immutable fallback pins exactly; history retries add no revision");
 await (await import("./worlds-shared-relief-integrity-checks")).checkSharedReliefIntegrity(f,s,operation,redo.groupId,pass);
 await writeFile(path.join(f.out,"results.json"),JSON.stringify({passed:true,groups,ownerEnvironmentAccessed:false,rootRevision:4,allSources:3,ledger:167},null,2));
},{beforeSharedReliefUpgrade}).catch(error=>{console.error(error);process.exitCode=1;});
