import test from "node:test";
import assert from "node:assert/strict";
import {TerrainStroke} from "./terrain-stroke";
import {prepareTerrainOperation} from "./terrain-operations";
import {terrainEditMask,rootFrame} from "./terrain-refinement";
import {terrainGeometry,terrainSettingsSchema,type BrushTool} from "./terrain";
const shape=terrainGeometry(terrainSettingsSchema.parse({widthKm:20,heightKm:20,gridWidth:128,gridHeight:128}));
test("all existing brushes retain inherited boundary samples while editing the fine interior",()=>{
 const mask=terrainEditMask(shape,rootFrame(shape),[],shape,true);
 for(const tool of ["raise","lower","level","smooth","coast-land","coast-water","coast-smooth"] as BrushTool[]){
  const grid=new Int16Array(shape.width*shape.height).fill(tool==="coast-water"?300:-200);grid[64*128+5]=500;const before=grid.slice(),stroke=new TerrainStroke(grid,shape,{tool,radius:20,strength:250,target:0,seaLevel:0,coastHeight:300,coastBand:1000},{x:4,y:64},mask);while(stroke.pending)stroke.advance(100);const patch=stroke.finish();assert.ok(patch.indices.length>0,tool);for(let i=0;i<grid.length;i++)if(mask[i])assert.equal(grid[i],before[i],`${tool} changed protected ${i}`);
 }
});
test("ridge, valley and selected-area previews respect the same protected samples",()=>{
 const mask=terrainEditMask(shape,rootFrame(shape),[],shape,true),base=new Int16Array(shape.width*shape.height).fill(-500);
 const operations=[{kind:"ridge",points:[{x:1,y:64},{x:100,y:64}],radius:10,height:1000,hardness:0},{kind:"valley",points:[{x:1,y:64},{x:100,y:64}],radius:10,height:1000,hardness:0},{kind:"area",area:{x:0,y:0,width:128,height:128},tool:"raise",target:0,amount:1000,strength:100,passes:1,feather:0}] as const;
 for(const raw of operations){const operation=structuredClone(raw) as Parameters<typeof prepareTerrainOperation>[2],result=prepareTerrainOperation(base,shape,operation,undefined,mask);assert.ok(result.changed>0);for(let i=0;i<base.length;i++)if(mask[i])assert.equal(result.grid[i],base[i]);assert.ok([...result.patch.indices].every(i=>!mask[i]));}
});
