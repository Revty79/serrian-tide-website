/** Synthetic owned PG18 only. No owner environment or reference geography is loaded. */
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {withRegionalEditingFixture,type RegionalFixture} from "./worlds-regional-editing-fixture";
import {createGrid,readTile,terrainGeometry,type TerrainDocument} from "../src/features/worlds/terrain";
import {frameGeometry,initializeRefinement,rootFrame,type RefinementMeta} from "../src/features/worlds/terrain-refinement";
import {initializeExpandedRefinement} from "../src/features/worlds/terrain-refinement-expansion";

process.env.SERRIAN_REGIONAL_EDIT_EVIDENCE??="artifacts/collaboration-s7b-earth-pass1-expansion-database-20261113-1";
const digest=(a:Int16Array)=>createHash("sha256").update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest("hex");
const growth={gridWidth:256,gridHeight:128,columnsToWest:32,rowsToNorth:32};
type Seed={world:string;mapId:string;meta:RefinementMeta;child:RefinementMeta;childBoundarySample:number;document:TerrainDocument;parent:Int16Array;old:Int16Array;expanded:Int16Array;command:Record<string,unknown>};
let seed:Seed|undefined;

async function beforeUpgrade(f:RegionalFixture){
 const url=new URL(f.databaseUrl);assert.equal(url.hostname,"127.0.0.1");assert(!["5432","5433"].includes(url.port));assert.equal(url.pathname,"/serrian_regional_editing");
 const worlds=await import("../src/features/worlds/world-service"),terrain=await import("../src/features/worlds/terrain-service"),detail=await import("../src/features/worlds/terrain-refinement-service");
 const world=await worlds.createWorld("world-god",{name:"Synthetic retained coverage verification"}),mapId=randomUUID();
 await terrain.changeTerrain("world-god",world,{action:"create",requestId:mapId,name:"Synthetic physical source",initial:"ocean",settings:{gridWidth:640,gridHeight:384,widthKm:3200,heightKm:1600,wrap:true}});
 let document=(await terrain.getTerrain("world-god",world,{mapId})).document!;const shape=terrainGeometry(document.settings),parent=createGrid(document.baseElevation,document.tiles,shape),frame={x:600000,y:400000,width:128000,height:64000};
 // A nonuniform parent feature falls in the subsequently added coverage.
 parent[116*shape.width+160]=1500;await terrain.changeTerrain("world-god",world,{action:"save",requestId:randomUUID(),mapId,revision:document.revision,seaLevel:0,source:{kind:"manual"},tiles:[readTile(parent,65,shape)]});document=(await terrain.getTerrain("world-god",world,{mapId})).document!;
 const old=initializeRefinement(parent,shape,rootFrame(shape),frame,128,64,shape);
 const made=await detail.createRefinement("world-god",world,{action:"create",requestId:randomUUID(),mapId,parentId:null,parentRevision:document.revision,name:"Synthetic native detail",frame,gridWidth:128,gridHeight:64,previewHash:digest(old)});
 let meta=(await detail.getRefinements("world-god",world,mapId)).refinements.find(r=>r.id===made.refinementId)!;
 old[37*128+37]=431;
 await detail.saveRefinement("world-god",world,meta.id,{action:"save",requestId:randomUUID(),mapId,revision:1,seaLevel:0,tiles:[readTile(old,5,frameGeometry(meta,shape))]});
 meta=(await detail.getRefinements("world-god",world,mapId)).refinements.find(r=>r.id===meta.id)!;
 const childFrame={x:630000,y:430000,width:8000,height:8000},childGrid=initializeRefinement(old,frameGeometry(meta,shape),frame,childFrame,32,32,shape);
 const childMade=await detail.createRefinement("world-god",world,{action:"create",requestId:randomUUID(),mapId,parentId:meta.id,parentRevision:meta.revision,name:"Synthetic protected child",frame:childFrame,gridWidth:32,gridHeight:32,previewHash:digest(childGrid)});
 const index=await detail.getRefinements("world-god",world,mapId),child=index.refinements.find(r=>r.id===childMade.refinementId)!;
 assert.equal(index.expansionAvailable,false);
 const {grid:expanded}=await initializeExpandedRefinement(old,meta,parent,shape,rootFrame(shape),shape,growth);
 const command={action:"expand",requestId:randomUUID(),mapId,refinementId:meta.id,revision:2,parentRevision:document.revision,...growth,previewHash:digest(expanded)};
 await assert.rejects(detail.expandRefinement("world-god",world,meta.id,command),/0163/);
 const childBoundarySample=(await detail.sampleWorldTerrain("world-god",world,mapId,[{x:637900,y:437900}])).points[0].elevation;
 assert.notEqual(childBoundarySample,-500);
 seed={world,mapId,meta,child,childBoundarySample,document,parent,old,expanded,command};
 await writeFile(path.join(f.out,"expansion-before-upgrade.json"),JSON.stringify({passed:true,migrationCount:163,existingAuthoringWorks:true,extensionRefusedWithoutMigration:true,sourceRevision:meta.revision,grid:digest(old)},null,2));
}

withRegionalEditingFixture(async f=>{
 assert(seed);const s=seed,detail=await import("../src/features/worlds/terrain-refinement-service"),terrain=await import("../src/features/worlds/terrain-service"),shape=terrainGeometry(s.document.settings);
 const indexBefore=await detail.getRefinements("world-god",s.world,s.mapId);assert.equal(indexBefore.expansionAvailable,true);
 async function load(meta:RefinementMeta,revision:number,lod=0){
  const header=await detail.getRefinementTiles("world-god",s.world,s.mapId,meta.id,{revision,lod,keys:[0],historical:true});
  const actualMeta=header.refinement,width=actualMeta.gridWidth/2**lod,height=actualMeta.gridHeight/2**lod,grid=new Int16Array(width*height);
  for(let start=0;start<grid.length/1024;start+=64){const keys=Array.from({length:Math.min(64,grid.length/1024-start)},(_,n)=>start+n),packet=await detail.getRefinementTiles("world-god",s.world,s.mapId,meta.id,{revision,lod,keys,historical:true});for(const tile of packet.tiles)for(let row=0;row<32;row++)grid.set(tile.samples.slice(row*32,row*32+32),(tile.y*32+row)*width+tile.x*32);}
  return {grid,meta:actualMeta};
 }
 assert.deepEqual((await load(s.meta,2)).grid,s.old);
 await assert.rejects(detail.expandRefinement("other-god",s.world,s.meta.id,s.command));
 await assert.rejects(detail.expandRefinement("world-god",f.foreign,s.meta.id,s.command));
 await assert.rejects(detail.expandRefinement("world-god",s.world,s.meta.id,{...s.command,previewHash:"0".repeat(64)}),/preview/);
 assert.equal((await detail.getRefinements("world-god",s.world,s.mapId)).refinements.find(r=>r.id===s.meta.id)!.revision,2);
 assert.equal((await f.pool.query("select count(*)::int n from world_terrain_refinement_geometry where refinement_id=$1",[s.meta.id])).rows[0].n,0);
 const accepted=await detail.expandRefinement("world-god",s.world,s.meta.id,s.command);assert.equal(accepted.refinementId,s.meta.id);assert.equal(accepted.revision,3);
 assert.deepEqual(await detail.expandRefinement("world-god",s.world,s.meta.id,s.command),accepted);
 await assert.rejects(detail.expandRefinement("world-god",s.world,s.meta.id,{...s.command,rowsToNorth:0}),/newer|retained|stale/i);
 let meta=(await detail.getRefinements("world-god",s.world,s.mapId)).refinements.find(r=>r.id===s.meta.id)!;
 assert.equal(meta.gridWidth,256);assert.equal(meta.gridHeight,128);assert.deepEqual((await load(meta,3)).grid,s.expanded);
 const old=await load(meta,2);assert.equal(old.meta.gridWidth,128);assert.equal(old.meta.gridHeight,64);assert.deepEqual(old.meta.frame,s.meta.frame);assert.deepEqual(old.grid,s.old);
 assert.equal((await load(meta,1)).meta.parentRevision,s.document.revision);
 assert.deepEqual((await load(s.child,1)).meta.frame,s.child.frame);
 let expected=s.expanded.slice(),revision=3;
 async function saveAt(x:number,y:number,value:number){const grid=expected.slice();grid[y*meta.gridWidth+x]=value;const tile=readTile(grid,Math.floor(y/32)*(meta.gridWidth/32)+Math.floor(x/32),frameGeometry(meta,shape));const result=await detail.saveRefinement("world-god",s.world,meta.id,{action:"save",requestId:randomUUID(),mapId:s.mapId,revision,seaLevel:0,tiles:[tile]});revision=result.revision;expected=grid;}
 async function deniedAt(x:number,y:number){const grid=expected.slice();grid[y*meta.gridWidth+x]++;const tile=readTile(grid,Math.floor(y/32)*(meta.gridWidth/32)+Math.floor(x/32),frameGeometry(meta,shape));await assert.rejects(detail.saveRefinement("world-god",s.world,meta.id,{action:"save",requestId:randomUUID(),mapId:s.mapId,revision,seaLevel:0,tiles:[tile]}),/protected|boundary|finer/);}
 await deniedAt(0,0);await deniedAt(66,66);
 await saveAt(32,52,123);assert.equal(revision,4);
 revision=(await detail.restoreRefinement("world-god",s.world,meta.id,{action:"restore",requestId:randomUUID(),mapId:s.mapId,revision,targetRevision:3})).revision;
 assert.deepEqual((await load(meta,revision)).grid,s.expanded);expected=s.expanded.slice();
 revision=(await detail.restoreRefinement("world-god",s.world,meta.id,{action:"restore",requestId:randomUUID(),mapId:s.mapId,revision,targetRevision:4})).revision;expected[52*256+32]=123;
 assert.deepEqual((await load(meta,revision)).grid,expected);
 await saveAt(12,12,321);
 revision=(await detail.restoreRefinement("world-god",s.world,meta.id,{action:"restore",requestId:randomUUID(),mapId:s.mapId,revision,targetRevision:2})).revision;
 expected[52*256+32]=-500;assert.deepEqual((await load(meta,revision)).grid,expected);assert.equal(expected[12*256+12],321);
 meta=(await detail.getRefinements("world-god",s.world,s.mapId)).refinements.find(r=>r.id===s.meta.id)!;
 const sampled=await detail.sampleWorldTerrain("world-god",s.world,s.mapId,[{x:637000,y:437000},{x:637900,y:437900}]);assert.equal(sampled.points[0].elevation,431);assert.equal(sampled.points[1].sourceId,s.child.id);assert.equal(sampled.points[1].elevation,s.childBoundarySample);
 let level=expected;
 for(let lod=0;lod<=meta.overviewLevels;lod++){
  assert.deepEqual((await load(meta,revision,lod)).grid,level);
  const width=meta.gridWidth/2**lod,height=meta.gridHeight/2**lod,next=new Int16Array(width*height/4);
  for(let y=0;y<height/2;y++)for(let x=0;x<width/2;x++){const at=y*2*width+x*2;next[y*(width/2)+x]=Math.round((level[at]+level[at+1]+level[at+width]+level[at+width+1])/4);}level=next;
 }
 await assert.rejects(f.pool.query("update world_terrain_refinement set name='forbidden' where id=$1",[meta.id]),/immutable/i);
 await assert.rejects(f.pool.query("update world_terrain_refinement set width_metres=width_metres+1000 where id=$1",[meta.id]),/checked|immutable/i);
 await assert.rejects(f.pool.query("update world_terrain_refinement_geometry set x_metres=x_metres+1 where refinement_id=$1",[meta.id]),/immutable/i);
 const parent=(await terrain.getTerrain("world-god",s.world,{mapId:s.mapId})).document!;assert.equal(parent.revision,s.document.revision);assert.deepEqual(createGrid(parent.baseElevation,parent.tiles,shape),s.parent);
 assert.deepEqual((await load(meta,2)).grid,s.old);
 const records=(await f.pool.query("select from_revision,grid_width,grid_height from world_terrain_refinement_geometry where refinement_id=$1 order by from_revision",[meta.id])).rows;assert.deepEqual(records,[{from_revision:1,grid_width:128,grid_height:64},{from_revision:3,grid_width:256,grid_height:128}]);
 const fractionalFrame={x:2000000.1,y:1000000.1,width:128000,height:64000},fractionalGrid=initializeRefinement(s.parent,shape,rootFrame(shape),fractionalFrame,128,64,shape),fractionalId=(await detail.createRefinement("world-god",s.world,{action:"create",requestId:randomUUID(),mapId:s.mapId,parentId:null,parentRevision:s.document.revision,name:"Synthetic accepted fractional origin",frame:fractionalFrame,gridWidth:128,gridHeight:64,previewHash:digest(fractionalGrid)})).refinementId,fractionalMeta=(await detail.getRefinements("world-god",s.world,s.mapId)).refinements.find(r=>r.id===fractionalId)!;
 const eastOnly={gridWidth:256,gridHeight:64,columnsToWest:0,rowsToNorth:0},fractionalExpected=await initializeExpandedRefinement(fractionalGrid,fractionalMeta,s.parent,shape,rootFrame(shape),shape,eastOnly);await detail.expandRefinement("world-god",s.world,fractionalId,{action:"expand",requestId:randomUUID(),mapId:s.mapId,refinementId:fractionalId,revision:1,parentRevision:s.document.revision,...eastOnly,previewHash:digest(fractionalExpected.grid)});const fractionalAccepted=(await load(fractionalMeta,2));assert.equal(fractionalAccepted.meta.frame.x,fractionalFrame.x);assert.equal(fractionalAccepted.meta.frame.y,fractionalFrame.y);assert.deepEqual(fractionalAccepted.grid,fractionalExpected.grid);
 await (await import("./worlds-refinement-expansion-history-checks")).checkExpandedHistory(f,s.world,s.mapId,meta,expected,s.parent);
 await (await import("./worlds-refinement-expansion-restore-checks")).checkExpandedRestore(f);
 const result={passed:true,world:s.world,mapId:s.mapId,source:meta.id,revision,geometryTransitions:records,oldSamplesExact:true,allAddedSamplesMatchNativeParent:true,allOverviewsExact:true,originalSourceIdentityRetained:true,oldHistoryUsesOldDimensions:true,childPinAndBoundaryProtected:true,oldCollarNowEditableInside:true,undoRedoExact:true,oldRevisionRestoreKeepsAddedTerrain:true,unauthorizedAndCrossWorldRejected:true,failedPreviewAcceptLeavesNoRows:true,idempotentRetryExact:true,parentUnchanged:true,migrationCount:164,sharedDatabaseAccess:false};
 await writeFile(path.join(f.out,"expansion-results.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
},undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,beforeUpgrade).catch(error=>{console.error(error);process.exitCode=1;});
