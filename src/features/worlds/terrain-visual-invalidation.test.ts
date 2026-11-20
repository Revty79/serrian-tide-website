import test from "node:test";
import assert from "node:assert/strict";
import {TerrainVisualInvalidation,terrainDirtyFrames,retireTerrainFrame,terrainPictureSource,terrainChangeReviewFrame} from "./terrain-visual-invalidation";
const world={wrap:true,displayWidth:1000};
test("retained raster crops preserve exact anisotropic and wrapped geographic footprints",()=>{const source={x:1e8,y:2e8,width:200,height:100};assert.deepEqual(terrainPictureSource(source,source,128,1),{x:1,y:1,width:128,height:128});assert.deepEqual(terrainPictureSource({x:1e8+50,y:2e8+50,width:100,height:25},source,128,1),{x:33,y:65,width:64,height:32});assert.deepEqual(terrainPictureSource({x:-100,y:12.5,width:50,height:25},{x:-150,y:0,width:100,height:50},192),{x:96,y:48,width:96,height:96});});
test("finished raster replacements retire duplicate versions without evicting other visible footprints",()=>{const frame={x:0,y:0,width:10,height:10},coarse={frame:{...frame,width:20,height:20}},neighbor={frame:{...frame,x:10}},pictures=new Map([['coarse',coarse],['neighbor',neighbor]]);for(let n=0;n<300;n++){const retired=retireTerrainFrame(pictures,frame);assert.equal(retired.length,n?1:0);pictures.set(String(n),{frame});assert.equal(pictures.size,3);}assert.equal(pictures.get('coarse'),coarse);assert.equal(pictures.get('neighbor'),neighbor);});
test("local geographic invalidation preserves unrelated caches and includes wrapped ink halos",()=>{const v=new TerrainVisualInvalidation();assert.equal(v.invalidate([{x:990,y:10,width:20,height:20}]),false);assert.equal(v.token({x:0,y:0,width:20,height:40},world),1);assert.equal(v.token({x:400,y:0,width:20,height:40},world),0);assert.equal(v.token({x:30,y:0,width:20,height:40},world,24),1);});
test("descriptor memory is bounded and global changes always reset its epoch",()=>{const v=new TerrainVisualInvalidation();for(let n=0;n<64;n++)assert.equal(v.invalidate([{x:n,y:0,width:1,height:1}]),false);assert.equal(v.invalidate([{x:65,y:0,width:1,height:1}]),true);assert.equal(v.token({x:0,y:0,width:100,height:100},world),0);assert.equal(v.invalidate(),true);assert.equal(v.invalidate([]),false);});
test("long local strokes retain presentation across dependency resets; global source changes retire it",()=>{const v=new TerrainVisualInvalidation();v.invalidate();const picture=v.presentation;for(let n=0;n<200;n++)v.invalidate([{x:n,y:0,width:10,height:10}]);assert.equal(v.presentation,picture);assert.equal(v.generation,201);v.invalidate([]);assert.equal(v.presentation,picture);v.invalidate();assert.equal(v.presentation,picture+1);});
test("same-map numerical reconciliation refreshes all jobs without blanking the last picture",()=>{const v=new TerrainVisualInvalidation();v.invalidate();const picture=v.presentation;assert.equal(v.invalidate(undefined,false),true);assert.equal(v.presentation,picture);assert.equal(v.generation,2);v.invalidate(undefined,true);assert.equal(v.presentation,picture+1);});
test("fine invalidation uses its own anisotropic spacing and exact World origin",()=>{const shape={width:1024,height:512,tileSize:32,displayWidth:20000,displayHeight:20000,min:-100,max:100,wrap:false},frames=terrainDirtyFrames([0,0],shape,{x:5e8,y:4e8})!;assert.equal(frames.length,1);assert.deepEqual(frames[0],{x:5e8-4*20000/1024,y:4e8-4*20000/512,width:40*20000/1024,height:40*20000/512});});

test("native proposal review frames retain unequal axes, source origin and neighboring context",()=>{
 const shape={width:64,height:32,tileSize:32,displayWidth:6400,displayHeight:1600,min:-100,max:100,wrap:false},indices=new Uint32Array([5*64+20,9*64+24]),before=indices.slice();
 assert.deepEqual(terrainChangeReviewFrame(indices,shape,{x:10000,y:20000}),{x:11800,y:20150,width:900,height:450});assert.deepEqual(indices,before);
});

test("native review framing clamps to the retained source and refuses foreign sample indices",()=>{
 const shape={width:64,height:32,tileSize:32,displayWidth:6400,displayHeight:1600,min:-100,max:100,wrap:true};
 assert.equal(terrainChangeReviewFrame(new Uint32Array(),shape),undefined);assert.deepEqual(terrainChangeReviewFrame(new Uint32Array([0]),shape),{x:0,y:0,width:300,height:150});
 assert.deepEqual(terrainChangeReviewFrame(new Uint32Array([0,2047]),shape),{x:0,y:0,width:6400,height:1600});assert.throws(()=>terrainChangeReviewFrame(new Uint32Array([2048]),shape),/does not match/);
});
