import assert from "node:assert/strict";
import test from "node:test";
import {terrainGeometry,terrainSettingsSchema} from "./terrain";
import {elevationColor} from "./raster";
import {paintTerrainTile,terrainRenderKeys} from "./terrain-renderer";
import {CLASSIC_RELIEF,physicalGradient,physicalReliefShade,parseTerrainRelief} from "./terrain-relief";
const shape=terrainGeometry(terrainSettingsSchema.parse({gridWidth:64,gridHeight:64,widthKm:64,heightKm:128}));
globalThis.ImageData=class{constructor(public data:Uint8ClampedArray,public width:number,public height:number){}} as unknown as typeof ImageData;
test("physical gradients use independent metre spacings and one-sided fixed edges",()=>{
 const g=physicalGradient(1000,3000,1000,5000,20,20,shape);assert.deepEqual(g,{x:1,y:1});assert.deepEqual(physicalGradient(1000,2000,1000,3000,0,0,shape),g);assert.deepEqual(physicalGradient(1000,3000,1000,5000,63,63,{...shape,wrap:true}),{x:1,y:2});
 const wide={...shape,displayWidth:shape.displayWidth*1000,displayHeight:shape.displayHeight*1000},flat=physicalGradient(1000,3000,1000,5000,20,20,wide);assert.deepEqual(flat,{x:.001,y:.001});assert.ok(physicalReliefShade(g.x,g.y,1)<physicalReliefShade(flat.x,flat.y,1)-.2);
});
test("Classic exactly retains original palette and every pixel including fixed and wrapped edges",()=>{
 const grid=Int16Array.from({length:4096},(_,i)=>Math.round(1000+1700*Math.sin(i%64*.15)+900*Math.cos(Math.floor(i/64)*.12)));
 for(const wrap of [false,true])for(let key=0;key<4;key++){
  const s={...shape,wrap},pixels=paintTerrainTile(grid,0,key,s,CLASSIC_RELIEF).data;for(let y=0;y<32;y++)for(let x=0;x<32;x++){
   const gx=key%2*32+x,gy=Math.floor(key/2)*32+y,z=grid[gy*64+gx],west=grid[gy*64+(wrap?(gx+63)%64:Math.max(0,gx-1))],east=grid[gy*64+(wrap?(gx+1)%64:Math.min(63,gx+1))],north=grid[Math.max(0,gy-1)*64+gx],south=grid[Math.min(63,gy+1)*64+gx],shade=z<=0?1:Math.max(.6,Math.min(1.25,1+(west-east+north-south)/1600)),rgb=elevationColor(z<=0?z:Math.max(1,z)),expected=new Uint8ClampedArray([...rgb.map(c=>c*shade),255]);assert.deepEqual(pixels.slice((y*32+x)*4,(y*32+x)*4+4),expected);
  }
 }
});
test("exaggeration changes only land illumination, preserves water, and never mutates elevations",()=>{
 const grid=Int16Array.from({length:4096},(_,i)=>(i%64-20)*20),original=grid.slice(),natural=paintTerrainTile(grid,0,0,shape,{mode:"physical",exaggeration:1}).data,enhanced=paintTerrainTile(grid,0,0,shape,{mode:"physical",exaggeration:80}).data;assert.notDeepEqual(natural,enhanced);assert.deepEqual(grid,original);for(let y=0;y<32;y++)for(let x=0;x<=20;x++)assert.deepEqual(natural.slice((y*32+x)*4,(y*32+x)*4+4),enhanced.slice((y*32+x)*4,(y*32+x)*4+4));
});
test("incremental relief refresh keeps the existing bounded tile halo including wrap",()=>{
 const s={...shape,width:1024,height:1024};assert.equal(terrainRenderKeys([33],s).size,9);assert.equal(terrainRenderKeys([0],s).size,4);assert.equal(terrainRenderKeys([0],{...s,wrap:true}).size,6);assert.equal(terrainRenderKeys(undefined,s).size,1024);
 assert.equal(parseTerrainRelief({mode:"physical",exaggeration:Infinity}),null);assert.equal(parseTerrainRelief({mode:"physical",exaggeration:1001}),null);assert.deepEqual(parseTerrainRelief(CLASSIC_RELIEF),CLASSIC_RELIEF);
});
