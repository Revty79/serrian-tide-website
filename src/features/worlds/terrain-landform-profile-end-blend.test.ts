import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {prepareAdvancedTerrain,prepareAdvancedTerrainAsync,type AdvancedTerrainContext} from "./terrain-advanced";
import {advancedOperationSchema,type AdvancedOperation} from "./terrain-advanced-spec";
import {parseAdvancedDraft} from "./terrain-advanced-recovery";
import {EMPTY_HYDROLOGY} from "./terrain-hydrology";
import type {TerrainGeometry} from "./terrain";

type Profile=Extract<AdvancedOperation,{kind:"landform-profile"}>;
function fixture(variant:"square"|"unequal"|"wrapped"="square"){
  const shape:TerrainGeometry={width:128,height:variant==="unequal"?64:128,tileSize:32,displayWidth:variant==="unequal"?8000:4000,displayHeight:4000,wrap:variant==="wrapped",min:-12000,max:12000},
    context:AdvancedTerrainContext={frame:{x:0,y:0,width:shape.displayWidth,height:shape.displayHeight},world:{width:shape.displayWidth,height:shape.displayHeight,wrap:shape.wrap},seaLevel:0,water:structuredClone(EMPTY_HYDROLOGY),sites:[],volcanoes:[]},scale=shape.displayWidth/4000,
    operation:Profile={kind:"landform-profile",selection:{frame:{...context.frame}},points:(variant==="wrapped"?[3500,500,1500]:[500,1500,2500]).map((x,i)=>({x:x*scale,y:2000,elevationM:i===1?500:1000,widthM:4000*scale})),preserveManual:false,strength:100,mode:"shape",hardness:0,endBlendM:500*scale,featherM:variant==="unequal"?125:0},base=new Int16Array(shape.width*shape.height);
  for(let y=0;y<shape.height;y++)for(let x=0;x<shape.width;x++)base[y*shape.width+x]=variant==="square"?1000:1000+3*x-2*y;
  return {shape,context,operation,base};
}
const digest=(grid:Int16Array)=>createHash("sha256").update(new Uint8Array(grid.buffer,grid.byteOffset,grid.byteLength)).digest("hex");

// Captured from hosted-qualified88f24480 BEFORE this implementation. These protect
// original operation semantics, independently of the new opt-in calculation.
for(const [variant,expected]of [["square","19afa8c7aa6dfb96213f4cdc6b20dbbc9ae32128bb05f5696d9be03ad08f6801"],["unequal","2cccdfd6008eabeea68050625a470a8b470971d449c35802dcc347a743d44217"],["wrapped","386536303eeaa05083cacbee5358e54683a92a7bb1e1fd96ab71038b8aec2c65"]]as const)test(`original ${variant} profile is exact with absent and false gradual-end flag`,()=>{
  const {shape,context,operation,base}=fixture(variant),old=prepareAdvancedTerrain(base,shape,operation,context),disabled=prepareAdvancedTerrain(base,shape,{...operation,continuousEndBlend:false},context);
  assert.equal(digest(old.grid),expected);assert.deepEqual(disabled.grid,old.grid);assert.equal(advancedOperationSchema.parse(operation).kind,"landform-profile");
});

test("overlapping wide segment caps cannot move either gradual path end",()=>{
  const {shape,context,operation,base}=fixture(),old=prepareAdvancedTerrain(base,shape,operation,context),next=prepareAdvancedTerrain(base,shape,{...operation,continuousEndBlend:true},context),at=(x:number)=>64*128+x;
  assert.notEqual(old.grid[at(16)],1000);assert.notEqual(old.grid[at(80)],1000);
  assert.equal(next.grid[at(16)],1000);assert.equal(next.grid[at(80)],1000);assert.equal(next.grid[at(48)],500);
  let oldStep=0,nextStep=0;for(let x=11;x<22;x++){oldStep=Math.max(oldStep,Math.abs(old.grid[at(x+1)]-old.grid[at(x)]));nextStep=Math.max(nextStep,Math.abs(next.grid[at(x+1)]-next.grid[at(x)]));}
  assert(oldStep>100);assert(nextStep<30);assert.deepEqual(base,new Int16Array(16384).fill(1000));
});

test("gradual-end operation reverses without moving its terrain",()=>{
  const {shape,context,operation,base}=fixture(),op={...operation,continuousEndBlend:true},forward=prepareAdvancedTerrain(base,shape,op,context),reverse=prepareAdvancedTerrain(base,shape,{...op,points:[...op.points].reverse()},context);assert.deepEqual(reverse.grid,forward.grid);
});

test("coincident path ends retain their fade instead of averaging to the path middle",()=>{
  const {shape,context,operation}=fixture(),base=new Int16Array(16384).fill(1200),op={...operation,continuousEndBlend:true,points:[{x:500,y:2000,elevationM:1000,widthM:4000},{x:1500,y:1000,elevationM:500,widthM:4000},{x:2500,y:2000,elevationM:1000,widthM:4000},{x:500,y:2000,elevationM:1000,widthM:4000}]},result=prepareAdvancedTerrain(base,shape,op,context);assert.equal(result.grid[64*128+16],1200);
});

test("gradual fades retain minimum, maximum and explicit envelope semantics",()=>{
  const {shape,context,operation}=fixture(),base=new Int16Array(16384).fill(750),op={...operation,continuousEndBlend:true},at=(x:number)=>64*128+x,minimum=prepareAdvancedTerrain(base,shape,{...op,mode:"minimum"},context),maximum=prepareAdvancedTerrain(base,shape,{...op,mode:"maximum"},context);
  assert.equal(minimum.grid[at(48)],750);assert.equal(maximum.grid[at(48)],500);assert.equal(minimum.grid[at(16)],750);assert.equal(maximum.grid[at(16)],750);
  const high=new Int16Array(16384).fill(1500);high[at(80)]=250;const envelope=prepareAdvancedTerrain(high,shape,{...op,mode:"upper-envelope",envelopeBaseM:300},context);assert.equal(envelope.grid[at(16)],300);assert.equal(envelope.grid[at(48)],500);assert.equal(envelope.grid[at(80)],250);
});

test("gradual-end operation keeps canonical wrapping",()=>{
  const {shape,context,operation}=fixture("wrapped"),base=new Int16Array(shape.width*shape.height).fill(1000),op={...operation,continuousEndBlend:true},a=prepareAdvancedTerrain(base,shape,op,context),b=prepareAdvancedTerrain(base,shape,{...op,points:op.points.map(p=>({...p,x:(p.x+2000)%4000}))},context);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++)assert.equal(a.grid[y*128+x],b.grid[y*128+(x+64)%128]);
});

test("zero end distance retains the original complete numerical result",()=>{
  const {shape,context,operation,base}=fixture(),op={...operation,endBlendM:0},old=prepareAdvancedTerrain(base,shape,op,context),next=prepareAdvancedTerrain(base,shape,{...op,continuousEndBlend:true},context);assert.deepEqual(next.grid,old.grid);
});

test("gradual-end previews retain water, manual, finer and settlement guards",()=>{
  const {shape,context,operation,base}=fixture(),blocked=new Uint8Array(base.length),manual=new Uint8Array(base.length),at=(x:number,y=64)=>y*128+x;base[at(48)]=-500;blocked[at(64)]=1;manual[at(60)]=1;context.sites.push({id:"protected-site",x:1750,y:2000});const before=base.slice(),op={...operation,continuousEndBlend:true,preserveManual:true},result=prepareAdvancedTerrain(base,shape,op,context,blocked,manual);
  for(let y=63;y<=65;y++)for(let x=47;x<=49;x++)assert.equal(result.grid[at(x,y)],before[at(x,y)]);
  for(const x of [56,60,64])assert.equal(result.grid[at(x)],before[at(x)]);assert(result.metrics.changed>0);assert.deepEqual(base,before);
});

test("gradual-end preview and recovery remain deterministic and strictly typed",async()=>{
  const {shape,context,operation,base}=fixture(),op={...operation,continuousEndBlend:true},before=structuredClone(context),sync=prepareAdvancedTerrain(base,shape,op,context);assert.deepEqual(await prepareAdvancedTerrainAsync(base,shape,op,context),sync);assert.deepEqual(context,before);
  const mapId="00000000-0000-4000-8000-000000000001",raw=JSON.stringify({version:1,mapId,sourceId:null,revision:1,operation:op,visualOnly:false});assert.deepEqual(parseAdvancedDraft(raw,mapId,null).operation,op);for(const invalid of [0,"true",null])assert.throws(()=>advancedOperationSchema.parse({...op,continuousEndBlend:invalid}));assert.throws(()=>advancedOperationSchema.parse({...op,hidden:1}));
});

test("gradual-end profiles keep the existing sample-work refusal",()=>{
  const {shape,context,operation}=fixture(),large={...shape,width:512,height:512},op={...operation,continuousEndBlend:true,endBlendM:0,points:Array.from({length:128},(_,i)=>({...operation.points[0],x:100+i}))};assert.throws(()=>prepareAdvancedTerrain(new Int16Array(512*512).fill(1000),large,op,context),/sample-steps/);
});
