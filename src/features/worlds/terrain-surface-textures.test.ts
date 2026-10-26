import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {SURFACE_TEXTURES,sampleSurfaceTexture,MEAN_SURFACE_TEXTURES,type SurfaceTextureSet} from "./terrain-surface-textures";

import {shadeSurfaceTextures} from "./terrain-surface-texture-shading";

function fixture():SurfaceTextureSet{return {version:1,bytes:0,materials:SURFACE_TEXTURES.map((m,index)=>{const make=(normal:boolean)=>[8,4,2,1].map(size=>({size,pixels:Uint8ClampedArray.from({length:size*size*4},(_,i)=>{const c=i%4;if(c===3)return 255;if(normal)return c===2?250:128;return m.mean[c]+Math.sin(Math.floor(i/4)*.7+index)*12;})}));return {diffuse:make(false),normal:make(true)};})};}
test("bundled surface artwork has six credited CC0 sources and exact original file hashes",()=>{const manifest=JSON.parse(readFileSync("public/worlds/terrain-materials/v1/sources.json","utf8"));assert.equal(manifest.version,1);assert.equal(manifest.assets.length,6);assert.equal(manifest.runtimeExternalRequests,false);let total=0;for(const a of manifest.assets){assert.equal(a.license,"CC0-1.0");assert.match(a.source,/^https:\/\/polyhaven.com\/a\//);assert.ok(Object.keys(a.authors).length);for(const file of Object.values(a.files) as {file:string;bytes:number;sha256:string}[]){const bytes=readFileSync("public/worlds/terrain-materials/v1/"+file.file);assert.equal(bytes.length,file.bytes);assert.equal(createHash("sha256").update(bytes).digest("hex"),file.sha256);total+=bytes.length;}}assert.ok(total<16*1024*1024);});
test("World-scale filtered artwork reduces to coordinate-independent material means",()=>{const set=fixture();for(let i=0;i<6;i++)assert.deepEqual(sampleSurfaceTexture(set,i,20,80,1e6,null),sampleSurfaceTexture(MEAN_SURFACE_TEXTURES,i,939393,9393,1e6,null));});
test("stochastic material sampling is deterministic and periodic across wrapped longitude",()=>{const set=fixture();for(const x of [0,3,999.99,1003]){const a=sampleSurfaceTexture(set,0,x,77,.5,1000),b=sampleSurfaceTexture(set,0,x+1000,77,.5,1000);assert.ok([...a].every((n,i)=>Math.abs(n-b[i])<1e-6));assert.deepEqual(a,sampleSurfaceTexture(set,0,x,77,.5,1000));}});
test("randomized physical patch edges share the same color and normal limits",()=>{const set=fixture(),scale=64,u=3,v=.37,x=.8*u*scale-.6*v*scale,y=.6*u*scale+.8*v*scale,a=sampleSurfaceTexture(set,0,x-.8e-7,y-.6e-7,.2,null),b=sampleSurfaceTexture(set,0,x+.8e-7,y+.6e-7,.2,null);assert.ok([...a].every((n,i)=>Math.abs(n-b[i])<1e-4));assert.ok(Math.abs(Math.hypot(a[3],a[4],a[5])-1)<1e-8);});

test("dominant material detail remains continuous when mixture ranks cross",()=>{const set=fixture(),field={height:80,waterHeight:80,gx:.4,gy:.1,rough:.2,spacing:20},render=(e:number)=>shadeSurfaceTextures(set,field,[.6,.2+e,.2-e,0,0,0],27,58,.1,20,null,.5,[0,0,0],1),a=render(-1e-7),b=render(1e-7);assert.ok(a.every((v,i)=>Math.abs(v-b[i])<1e-4));});
