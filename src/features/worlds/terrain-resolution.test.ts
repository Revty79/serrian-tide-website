import test from "node:test";
import assert from "node:assert/strict";
import {terrainSettingsSchema,terrainGeometry,tileSchema} from "./terrain";
import {refinementCreateSchema,refinementSizes,initializeRefinement,initializeRefinementAsync,rootFrame,overviewLevels,refinementLogicalBytes} from "./terrain-refinement";
import {terrainTransferBeginSchema,terrainTransferCommandSchema} from "./terrain-transfer";
import {consumptionResourceSchema,expandedConsumptionResourceSchema,parseConsumptionResource} from "./atlas-map-consumption";
import {generateTerrain,generateTerrainAsync} from "./terrain-generation";
import {defaultGeneration,defaultGenerationV1} from "./terrain-source";
import {describedRecipe} from "./terrain-description-recipe";
import {TerrainStroke} from "./terrain-stroke";
import {prepareTerrainOperation,prepareTerrainOperationAsync,type TerrainOperation} from "./terrain-operations";
const id="a4000000-0000-4000-8000-000000000001",hash="0".repeat(64);
test("cooperative native area, polygon, ridge and valley previews preserve exact patches and protected samples",async()=>{
 const shape=terrainGeometry(terrainSettingsSchema.parse({gridWidth:2048,gridHeight:64})),base=Int16Array.from({length:2048*64},(_,i)=>i%91-40),snapshot=base.slice(),blocked=new Uint8Array(base.length);blocked[20*2048+1500]=1;
 const fields={tool:"level" as const,target:777,amount:10,strength:100,passes:2,feather:0};const operations:TerrainOperation[]=[{kind:"area",area:{x:1490,y:10,width:40,height:30},...fields},{kind:"polygon-area",points:[{x:1490,y:10},{x:1530,y:10},{x:1530,y:40},{x:1490,y:40}],...fields},...(["ridge","valley"] as const).map(kind=>({kind,points:[{x:1490,y:20},{x:1530,y:30}],radius:4,height:100,hardness:.3}))];
 for(const op of operations){const sync=prepareTerrainOperation(base,shape,op,undefined,blocked),asyncResult=await prepareTerrainOperationAsync(base,shape,op,undefined,blocked);assert.deepEqual(asyncResult,sync);assert.equal(sync.grid[20*2048+1500],base[20*2048+1500]);assert(sync.changed>0);assert.deepEqual(base,snapshot);}
 const abort=new AbortController();await assert.rejects(prepareTerrainOperationAsync(base,shape,operations[0],()=>abort.abort(),blocked,undefined,undefined,abort.signal),/cancelled/);assert.deepEqual(base,snapshot);
});
test("cooperative generation retains all three native generators exactly and cancels before acceptance",async()=>{
 const shape=terrainGeometry(terrainSettingsSchema.parse({gridWidth:128,gridHeight:128}));
 const plan=describedRecipe("A large island with mountains",{x:0,y:0,width:shape.displayWidth,height:shape.displayHeight,periodX:shape.displayWidth},{x:0,y:0,width:shape.displayWidth,height:shape.displayHeight},"A4 synthetic plan");
 for(const recipe of[defaultGenerationV1,defaultGeneration,plan])assert.deepEqual(await generateTerrainAsync(shape,recipe,0),generateTerrain(shape,recipe,0));
 const abort=new AbortController();await assert.rejects(generateTerrainAsync({...shape,width:2048,height:2048},defaultGenerationV1,0,()=>abort.abort(),abort.signal),/cancelled/);
});
test("an oversized native stroke rolls back its entire unaccepted gesture",()=>{
 const shape=terrainGeometry(terrainSettingsSchema.parse({gridWidth:2048,gridHeight:2048})),grid=new Int16Array(2048*2048),stroke=new TerrainStroke(grid,shape,{tool:"raise",radius:64,strength:1000},{x:64,y:64});
 // Adjacent full-width passes would otherwise retain millions of Map entries.
 for(let y=64;y<2048;y+=100){stroke.enqueue({x:y%200===64?1984:64,y});stroke.enqueue({x:y%200===64?64:1984,y});while(stroke.pending)stroke.advance(100);}
 assert.equal(stroke.finish().indices.length,0);assert.match(stroke.noChangeReason,/rolled back/);assert(grid.every(n=>n===0));
});
test("optional World resolution preserves defaults and bounds independent of detail",()=>{
 const s=terrainSettingsSchema.parse({});assert.equal(s.gridWidth,640);assert.equal(s.gridHeight,384);
 for(const [gridWidth,gridHeight]of[[2048,2048],[2048,1024],[1024,2048],[32,2048]])assert(terrainSettingsSchema.safeParse({gridWidth,gridHeight}).success);
 for(const gridWidth of[2049,4096,0,31])assert(!terrainSettingsSchema.safeParse({gridWidth}).success);
 assert(tileSchema.safeParse({x:127,y:127,samples:new Array(1024).fill(0)}).success);assert(!tileSchema.safeParse({x:128,y:0,samples:new Array(1024).fill(0)}).success);
});
test("rectangular detail includes real 2048/4096 dimensions and deliberate advanced acceptance",()=>{
 assert.deepEqual(refinementSizes,[32,64,128,256,512,1024,2048,4096]);assert.equal(overviewLevels(4096,2048),6);assert.equal(overviewLevels(4096,4096),7);assert.equal(refinementLogicalBytes(4096,4096),44738560);
 const c={action:"create",requestId:id,mapId:id,parentId:null,parentRevision:1,name:"Synthetic detail",frame:{x:0,y:0,width:64000,height:64000},gridWidth:4096,gridHeight:2048,previewHash:hash};assert(!refinementCreateSchema.safeParse(c).success);assert(refinementCreateSchema.safeParse({...c,advancedConfirmed:true}).success);assert(refinementCreateSchema.safeParse({...c,gridWidth:2048}).success);
});
test("cooperative inheritance shares exact native values and cancellation leaves its parent unchanged",async()=>{
 const world=terrainGeometry(terrainSettingsSchema.parse({gridWidth:32,gridHeight:32,widthKm:64,heightKm:64,wrap:true})),frame=rootFrame(world),parent=Int16Array.from({length:1024},(_,i)=>i%170-60),before=parent.slice(),target={x:0,y:0,width:32000,height:32000},progress:number[]=[];
 assert.deepEqual(await initializeRefinementAsync(parent,world,frame,target,64,128,world,v=>progress.push(v)),initializeRefinement(parent,world,frame,target,64,128,world));assert.equal(progress.at(-1),1);
 const abort=new AbortController();await assert.rejects(initializeRefinementAsync(parent,world,frame,target,4096,4096,world,()=>abort.abort(),abort.signal),/canceled/);assert.deepEqual(parent,before);
});
test("transfer manifests reject duplicate/outside tiles and each chunk stays independently bounded",()=>{
 const command={action:"save",requestId:id,mapId:id,revision:1,seaLevel:0},tile={x:0,y:0,sha256:hash};assert(terrainTransferBeginSchema.safeParse({op:"begin",command,tiles:[tile]}).success);assert(!terrainTransferBeginSchema.safeParse({op:"begin",command,tiles:[tile,tile]}).success);assert(!terrainTransferBeginSchema.safeParse({op:"begin",command,tiles:[{...tile,x:64}]}).success);assert(terrainTransferBeginSchema.safeParse({op:"begin",command,refinementId:id,tiles:[{...tile,x:127}]}).success);
 assert(!terrainTransferCommandSchema.safeParse({op:"chunk",requestId:id,tiles:Array.from({length:65},(_,x)=>({x,y:0,samples:new Array(1024).fill(0)}))}).success);
});
test("legacy consumption remains strict while explicit version 2 carries advanced numerical references",()=>{
 const value={kind:"numerical",terrainId:id,sourceId:id,parentId:null,parentRevision:1,revision:1,frame:{x:0,y:0,width:64000,height:64000,rotation:0},gridWidth:4096,gridHeight:4096,baseElevation:0,tiles:[{x:127,y:127,lod:0,sha256:hash,bytes:2048,encoding:"i16le-v1"}]};assert(!consumptionResourceSchema.safeParse(value).success);assert(expandedConsumptionResourceSchema.safeParse(value).success);assert.throws(()=>parseConsumptionResource(value,1),/contract version 2/);assert.equal(parseConsumptionResource(value,2).kind,"numerical");assert(!expandedConsumptionResourceSchema.safeParse({...value,tiles:[{...value.tiles[0],x:128}]}).success);
});
