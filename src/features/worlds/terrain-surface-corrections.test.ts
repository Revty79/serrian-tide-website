import {rasterSurfaceJob} from "./terrain-surface-raster";
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {SURFACE_TEXTURES,MEAN_SURFACE_TEXTURES,sampleSurfaceTexture,surfaceTextureWork,type SurfaceTextureSet} from "./terrain-surface-textures";
import {reconstructSurface,terrainSurfaceSampler,surfaceFieldWork} from "./terrain-surface-field";
import {TerrainDetailCache} from "./terrain-refinement-cache";
import type {RefinementMeta} from "./terrain-refinement";
import {shadeSurfaceTextures} from "./terrain-surface-texture-shading";
import {EMPTY_TERRAIN_MATERIALS} from "./terrain-materials";
import {surfacePixel,surfacePixelWork,automaticSurface} from "./terrain-surface-art";

const fixture=():SurfaceTextureSet=>({version:1,bytes:0,materials:SURFACE_TEXTURES.map((m,index)=>{const make=(normal:boolean)=>[8,4,2,1].map(size=>({size,pixels:Uint8ClampedArray.from({length:size*size*4},(_,i)=>{const c=i%4;if(c===3)return 255;if(normal)return c===2?250:128;return m.mean[c]+Math.sin(Math.floor(i/4)*.7+index)*12;})}));return {diffuse:make(false),normal:make(true)};})});

test("paired filtering and reusable texture work preserve published albedo and normals",()=>{
 const golden=JSON.parse(readFileSync("src/features/worlds/fixtures/surface-texture-v1-samples.json","utf8")),set=fixture(),work=surfaceTextureWork();
 for(const c of golden.cases){const actual=sampleSurfaceTexture(set,c.index,c.x,c.y,c.footprint,c.period,undefined,work);assert.ok(actual.every((v,i)=>Math.abs(v-c.expected[i])<1e-9));}
});
test("precomputed bicubic coefficients preserve the published surface and physical derivatives",()=>{
 const golden=JSON.parse(readFileSync("src/features/worlds/fixtures/surface-field-v1-samples.json","utf8")),read=(x:number,y:number)=>Math.sin(x*.3)*300+Math.cos(y*.4)*200+x*y*.7+500;
 for(const c of golden.cases){const actual=reconstructSurface(read,c.x,c.y,c.dx,c.dy);for(const [key,value] of Object.entries(actual))assert.ok(Math.abs(value-(c.expected[key] as number))<1e-9,key);}
});
test("fine interiors replace hidden parents while collars, nested coverage and wrap retain known fields",()=>{
 const world={width:32,height:32,tileSize:32,displayWidth:1000,displayHeight:1000,min:-30000,max:30000,wrap:true},root=new Int16Array(1024).fill(100),meta:RefinementMeta={id:"parent",worldId:"world",terrainId:"terrain",mapId:"map",name:"Accepted fine",parentId:null,parentRevision:1,level:1,revision:1,frame:{x:100,y:100,width:400,height:400},gridWidth:32,gridHeight:32,overviewLevels:0,updatedAt:"fixed"},child={...meta,id:"child",parentId:meta.id,level:2,frame:{x:200,y:200,width:100,height:100}},cache=new TerrainDetailCache(async()=>{throw Error("Active source must not fetch");}),shape={...world,wrap:false,width:32,height:32,displayWidth:400,displayHeight:400},scene={cache,tick:0,plans:[{meta,lod:0,keys:[0]}],active:{meta,shape,grid:new Int16Array(1024).fill(1000)}},sample=terrainSurfaceSampler(root,world,scene),out=surfaceFieldWork();
 assert.equal(sample(300,300,undefined,out),out);assert.equal(out.height,1000);assert.equal(sample(112.5,300).height,550);assert.equal(sample(99,300).height,100);
 const nested=terrainSurfaceSampler(root,world,{...scene,plans:[...scene.plans,{meta:child,lod:0,keys:[0]}],preview:{meta:child,shape:{...shape,displayWidth:100,displayHeight:100},grid:new Int16Array(1024).fill(2000)}});assert.equal(nested(250,250).height,2000);assert.equal(nested(201.5625,250).height,1156.25);
 const wrapped={...meta,frame:{x:950,y:100,width:100,height:100}},seam=terrainSurfaceSampler(root,world,{...scene,plans:[{meta:wrapped,lod:0,keys:[0]}],active:{...scene.active,meta:wrapped,shape:{...shape,displayWidth:100,displayHeight:100}}});assert.deepEqual(seam(20,150),seam(1020,150));assert.equal(seam(20,150).height,1000);
});
test("reused pixel buffers retain material composition across water, painted land and later pixels",()=>{
 const set=fixture(),work=surfacePixelWork(),layer={...EMPTY_TERRAIN_MATERIALS,strokes:[{id:"paint",material:"sand" as const,radiusM:40,strength:.6,points:[{x:20,y:30}]}]};
 for(const [x,y,z] of [[20,30,400],[25,35,-40],[90,130,1000],[20,30,400]]){const field={height:z,waterHeight:z,gx:.4,gy:.2,rough:.1,spacing:20},expected=surfacePixel(field,x,y,.2,0,20,layer,layer.strokes,null,set),actual=surfacePixel(field,x,y,.2,0,20,layer,layer.strokes,null,set,undefined,work);assert.ok(actual.every((v,i)=>Math.abs(v-expected[i])<1e-9));}
});

test("World-scale relief reveals saved broad slopes without adding relief to a flat field",()=>{const base={height:1800,waterHeight:1800,gx:0,gy:0,rough:0,spacing:30000},weights=[1,0,0,0,0,0],render=(gx:number,step:number)=>shadeSurfaceTextures(MEAN_SURFACE_TEXTURES,{...base,gx},weights,4000,7000,step,20,null,.5,[0,0,0],1),west=render(-.0002,16000),east=render(.0002,16000);assert.ok(Math.abs(west[0]-east[0])>10);assert.ok(Math.abs(render(-.0002,1)[0]-render(.0002,1)[0])<1);assert.deepEqual(render(0,16000),render(0,1));});
test("accepted cliff support blends a loose apron without changing the low shelf or manual overrides",()=>{const shelf={height:30,waterHeight:30,gx:0,gy:0,rough:0,spacing:20,coastLow:30,coastHigh:30},plain=automaticSurface(shelf,0),near=automaticSurface({...shelf,coastHigh:430},0);assert.ok(near[1]>plain[1]);assert.ok(near[2]>plain[2]);assert.equal(shelf.height,30);assert.equal(near[5],0);});

test("full-strength accepted paint remains authoritative over new automatic highland suggestions",()=>{const set=fixture(),stroke={id:"explicit-sand",material:"sand" as const,radiusM:200,strength:1,points:[{x:20,y:30}]},layer={...EMPTY_TERRAIN_MATERIALS,strokes:[stroke]},f={height:300,waterHeight:300,gx:.2,gy:.1,rough:.1,spacing:20},a=surfacePixel(f,20,30,.2,0,20,layer,[stroke],null,set),b=surfacePixel({...f,height:3000,waterHeight:3000},20,30,.2,0,20,layer,[stroke],null,set);assert.deepEqual(a,b);});

test("offscreen cropping preserves every visible material pixel and halo on the World lattice",()=>{const set=fixture(),world={width:32,height:32,tileSize:32,displayWidth:1000,displayHeight:1000,min:-30000,max:30000,wrap:true},grid=Int16Array.from({length:1024},(_,i)=>100+Math.round(Math.sin(i*.13)*80)),sample=terrainSurfaceSampler(grid,world),job={type:"paint" as const,key:"whole",frame:{x:27,y:80,width:12.8,height:9.6},resolution:64,height:48,step:.2,originX:27,originY:80,pixelX:0,pixelY:0,sea:0,relief:20,layer:{visible:true,opacity:1,automatic:true},strokes:[],fine:true};for(const period of [null,1000]){const whole=rasterSurfaceJob(job,sample,period,set),cropped=rasterSurfaceJob({...job,key:"crop",resolution:23,height:18,pixelX:9,pixelY:7},sample,period,set);for(let row=0;row<cropped.height;row++)for(let col=0;col<cropped.width;col++)for(let c=0;c<4;c++)assert.equal(cropped.pixels[(row*cropped.width+col)*4+c],whole.pixels[((row+7)*whole.width+col+9)*4+c]);}});
