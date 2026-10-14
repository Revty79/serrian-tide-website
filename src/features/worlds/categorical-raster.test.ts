import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {gzipSync} from "node:zlib";
import {mkdtemp,mkdir,writeFile,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import sharp from "sharp";
import {categoricalMode,categoricalRowWeight,categoricalManifestSchema,type CategoricalGrid,type CategoricalTileSource} from "./categorical-raster";
import {categoricalOriginal} from "./categorical-original";
import {rasterPixel,rasterTilePlan,validateRasterReference} from "./raster";
import {prepareCategorical} from "../../../scripts/prepare-land-cover";
const sha=(v:Uint8Array|string)=>createHash("sha256").update(v).digest("hex");
const grid:CategoricalGrid={width:3,height:3,bounds:[0,0,3,3],registration:"area",horizontalReference:"AUTHORED:non-earth",noData:0,encoding:"categorical-u8-tiles",sourceTileSize:3};
test("class codes use mode, never arithmetic interpolation; NoData and ties remain explicit",()=>{
  assert.equal(categoricalMode(new Map([[10,1],[40,1]]),0),10);
  assert.equal(categoricalMode(new Map([[10,2],[40,3]]),0),40);
  assert.equal(categoricalMode(new Map([[10,2],[0,2]]),0),0);
  assert.equal(categoricalMode(new Map(),0),0);
});
test("majority area respects original planar and authored angular reference, without a terrestrial datum",()=>{
  assert.equal(categoricalRowWeight(grid,0,{kind:"plane"}),1);
  const angular={...grid,bounds:[-180,-90,180,90] as [number,number,number,number]};
  assert.ok(categoricalRowWeight(angular,1,{kind:"sphere"})>categoricalRowWeight(angular,0,{kind:"sphere"}));
  validateRasterReference(grid,{version:1,kind:"plane",crs:grid.horizontalReference,units:"story steps",bounds:grid.bounds});
  assert.throws(()=>validateRasterReference(grid,{version:1,kind:"sphere",crs:"EPSG:4326",units:"degrees"}));
  assert.deepEqual(rasterPixel(grid,3,0),{column:2,row:2});
});
test("original categorical reads retain exact codes, missing tiles and integrity failures",async()=>{
  const values=Uint8Array.from([10,40,0,40,10,40,0,40,10]),tile:CategoricalTileSource={x:0,y:0,width:3,height:3,key:"source/tiles/one.u8.gz",valuesSha256:sha(values)};
  const r=categoricalOriginal(grid,[tile],async()=>gzipSync(values),1);
  assert.deepEqual(await r.read(0,0,3,3),values);
  assert.deepEqual(await r.read(1,1,2,2),Uint8Array.from([10,40,40,10]));
  assert.deepEqual(await categoricalOriginal(grid,[],async()=>{throw Error("No source should be requested");}).read(0,0,3,3),new Uint8Array(9));
  await assert.rejects(categoricalOriginal(grid,[tile],async()=>gzipSync(new Uint8Array(9))).read(0,0,1,1),/integrity/);
  await assert.rejects(r.read(-1,0,1,1));
});
test("preparation is deterministic and lossless; partial edges, unknown and uncertain codes preserve source meaning",async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),"serrian-categorical-unit-"));await mkdir(path.join(dir,"source/tiles"),{recursive:true});
  const g={...grid,width:1025,height:1025,sourceTileSize:1025},values=new Uint8Array(1025*1025).fill(10);values[0]=0;values[1]=40;
  const tiles=[{x:0,y:0,width:1025,height:1025,key:"source/tiles/one.u8.gz",valuesSha256:sha(values)}];
  await writeFile(path.join(dir,tiles[0].key),gzipSync(values));const index=JSON.stringify({grid:g,tiles});await writeFile(path.join(dir,"source/index.json"),index);
  const classes=[{code:10,name:"Crystal canopy",definition:"Original authored surface covering.",color:[8,12,44] as [number,number,number],status:"classified" as const},{code:40,name:"Uncertain glass",definition:"An explicitly uncertain authored class.",color:[60,10,88] as [number,number,number],status:"uncertain" as const}];
  const metadata={name:"Original fictional cover",externalId:"AUTHORED:fixture",source:{provider:"Original creator",dataset:"Original categorical grid",edition:"1",url:"https://example.invalid/source",license:"Original fixture",licenseUrl:"https://example.invalid/license",attribution:"Original creator",sha256:sha(index),observationPeriod:"Original authored epoch",resolution:"One original creator cell",interpretation:"No terrestrial datum, climate or vegetation inferred."}};
  const first=await prepareCategorical(dir,g,tiles,classes,metadata,{kind:"plane"}),original=await readFile(path.join(dir,"manifest.json"));await prepareCategorical(dir,g,tiles,classes,metadata,{kind:"plane"});assert.deepEqual(await readFile(path.join(dir,"manifest.json")),original);
  const pixel=await sharp(path.join(dir,"classification/1/0-0.png")).raw().toBuffer();assert.equal(pixel[3],0);assert.deepEqual([...pixel.subarray(4,8)],[60,10,88,255]);
  const edge=await sharp(path.join(dir,"classification/1/4-4.png")).metadata();assert.equal(edge.width,1);assert.equal(edge.height,1);assert.equal(first.statistics.originalValuesSha256,sha(values));assert.equal(first.statistics.noDataCells,1);
  const derived=await sharp(path.join(dir,"classification/2/0-0.png")).raw().toBuffer();assert.deepEqual([...derived.subarray(0,4)],[8,12,44,255]);assert.equal(first.levels[1].method,"area-mode-with-nodata");
  assert.equal(categoricalManifestSchema.safeParse({...first,classes:[...classes,classes[0]]}).success,false);
  assert.equal(categoricalManifestSchema.safeParse({...first,source:{...first.source,sha256:"a".repeat(64)}}).success,false);
});
test("categorical delivery stays bounded and wraps dateline without duplicate tiles",()=>{
  const g={...grid,width:67440,height:33720,bounds:[-180,-90,180,90] as [number,number,number,number]},levels=[1,2,4,8,16,32,64].map(factor=>({factor,width:Math.ceil(g.width/factor),height:Math.ceil(g.height/factor)}));
  for(const extent of [[-180,-90,180,90],[170,-20,-170,20],[-10,40,10,55]] as [number,number,number,number][]){const plan=rasterTilePlan(g,levels,extent,"classification");assert.ok(plan.tiles.length<=16);assert.equal(new Set(plan.tiles.map(t=>t.key)).size,plan.tiles.length);assert.ok(plan.tiles.every(t=>t.key.endsWith(".png")));}
});
