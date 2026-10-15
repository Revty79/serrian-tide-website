import assert from "node:assert/strict";
import {test} from "node:test";
import {rasterThumbnailPlan} from "./raster-preview";
import {boundedSourceDisplay} from "./geographic-display";
test("thumbnail selection uses only coarsest existing raster assets even when a region could use finer data",()=>{
 const levels=[{factor:1,width:4096,height:2048},{factor:16,width:256,height:128},{factor:4,width:1024,height:512}],grid={bounds:[-180,-90,180,90] as [number,number,number,number],width:4096,height:2048};
 for(const bounds of [grid.bounds,[10,20,10.1,20.1] as typeof grid.bounds]){const p=rasterThumbnailPlan(grid,levels,bounds,"classification");assert.equal(p.level.factor,16);assert.ok(p.tiles.length<=4);assert.ok(p.tiles.every(t=>t.key.startsWith("classification/16/")));}
 assert.equal(levels[0].factor,1);
});
test("thumbnail raster selection refuses an oversized coarsest level instead of downloading fine imagery",()=>{
 assert.throws(()=>rasterThumbnailPlan({bounds:[0,0,2000,1200],width:2048,height:1024},[{factor:1,width:2048,height:1024}],[0,0,2000,1200],"shaded"),/small preview/);
});
test("thumbnail display simplification has a tighter derived path budget and leaves exact coordinates untouched",()=>{
 const geometry={type:"LineString" as const,coordinates:Array.from({length:1000},(_,i)=>[i/10,Math.sin(i/10)*10] as [number,number])},original=structuredClone(geometry),frame={version:1 as const,kind:"plane" as const,crs:"AUTHORED:test",units:"units",bounds:[0,-20,100,20] as [number,number,number,number]};
 const coarse=boundedSourceDisplay(geometry,frame,frame.bounds,"planar",4,1000,2.8);assert.ok(coarse.path.length<=1000);assert.deepEqual(geometry,original);
});
