import assert from "node:assert/strict";
import test from "node:test";
import {terrainPolygonSelection} from "./terrain-polygon-selection";
import {prepareTerrainOperation,type TerrainOperation} from "./terrain-operations";
import {terrainGeometry,terrainSettingsSchema,applyPatch} from "./terrain";
const shape=terrainGeometry(terrainSettingsSchema.parse({gridWidth:96,gridHeight:64,minElevation:-2000,maxElevation:5000}));
const operation={kind:"polygon-area",points:[{x:10,y:10},{x:35,y:10},{x:35,y:20},{x:20,y:20},{x:20,y:40},{x:10,y:40}],tool:"level",target:900,amount:200,strength:100,passes:1,feather:0} satisfies TerrainOperation;

test("concave polygon selection changes only contained cell centres and makes one exact reversible patch",()=>{
 const base=Int16Array.from({length:96*64},(_,i)=>i%711-300),before=base.slice(),r=prepareTerrainOperation(base,shape,operation);
 let count=0;for(let y=0;y<64;y++)for(let x=0;x<96;x++){const selected=x>=10&&x<35&&y>=10&&y<20||x>=10&&x<20&&y>=20&&y<40;assert.equal(r.grid[y*96+x],selected?900:base[y*96+x]);if(selected)count++;}assert.equal(r.changed,count);assert.deepEqual(base,before);
 const accepted=r.grid.slice();applyPatch(r.grid,r.patch,"before",shape);assert.deepEqual(r.grid,base);applyPatch(r.grid,r.patch,"after",shape);assert.deepEqual(r.grid,accepted);
});
test("polygon operations retain all protected samples and feather only inside their actual boundary",()=>{
 const base=new Int16Array(96*64).fill(100),blocked=new Uint8Array(base.length);blocked[15*96+15]=1;
 for(const tool of ["level","raise","lower","smooth"] as const){const input=base.slice();input[17*96+17]=2000;const r=prepareTerrainOperation(input,shape,{...operation,tool,passes:3,feather:3},undefined,blocked);assert.equal(r.grid[15*96+15],100);assert.equal(r.grid[30*96+30],input[30*96+30]);assert.ok([...r.patch.indices].every(i=>!blocked[i]));if(tool==="level"){assert.equal(r.grid[15*96+17],900);assert.ok(r.grid[10*96+10]>100&&r.grid[10*96+10]<900);}}
});
test("minimum and maximum preserve completed high relief and deeper water while correcting coast samples",()=>{
 const base=new Int16Array(96*64).fill(100);base[15*96+15]=3000;base[15*96+16]=-1800;
 const minimum=prepareTerrainOperation(base,shape,{...operation,tool:"minimum",target:20});assert.equal(minimum.grid[15*96+15],3000);assert.equal(minimum.grid[15*96+16],20);assert.equal(minimum.grid[15*96+17],100);assert.equal(minimum.grid[0],100);
 const maximum=prepareTerrainOperation(base,shape,{...operation,tool:"maximum",target:-100});assert.equal(maximum.grid[15*96+15],-100);assert.equal(maximum.grid[15*96+16],-1800);assert.equal(maximum.grid[15*96+17],-100);assert.equal(maximum.grid[0],100);
 const rectangle=prepareTerrainOperation(base,shape,{kind:"area",area:{x:10,y:10,width:20,height:20},tool:"minimum",target:20,amount:1,strength:100,passes:1,feather:0});assert.equal(rectangle.grid[15*96+15],3000);assert.equal(rectangle.grid[15*96+16],20);
 assert.throws(()=>prepareTerrainOperation(base,shape,{...operation,tool:"minimum",target:6000}),/saved map/);
});
test("explicit elevation filtering preserves islands during bathymetry and leaves other source heights exact",()=>{
 const base=new Int16Array(96*64).fill(-500);base[15*96+15]=250;base[15*96+16]=0;base[15*96+17]=-1800;
 const r=prepareTerrainOperation(base,shape,{...operation,tool:"maximum",target:-1500,heightFilter:{mode:"at-or-below",level:0}});assert.equal(r.grid[15*96+15],250);assert.equal(r.grid[15*96+16],-1500);assert.equal(r.grid[15*96+17],-1800);assert.equal(r.grid[0],-500);
 const raised=prepareTerrainOperation(base,shape,{...operation,target:900,heightFilter:{mode:"above",level:0}});assert.equal(raised.grid[15*96+15],900);assert.equal(raised.grid[15*96+16],0);assert.equal(raised.grid[15*96+17],-1800);
 const ridge=prepareTerrainOperation(base,shape,{kind:"ridge",points:[{x:10,y:15},{x:30,y:15}],radius:5,height:1000,hardness:0,heightFilter:{mode:"above",level:0}});assert.equal(ridge.grid[15*96+15],1250);assert.equal(ridge.grid[15*96+14],-500);
});
test("multi-pass smoothing keeps eligibility pinned to original heights even when the result crosses sea level",()=>{
 const base=new Int16Array(96*64).fill(-1000);base[15*96+15]=1;
 const job={kind:"area",area:{x:15,y:15,width:1,height:1},tool:"smooth",target:0,amount:1,strength:100,passes:1,feather:0,heightFilter:{mode:"above",level:0}} as const;
 const one=prepareTerrainOperation(base,shape,job),three=prepareTerrainOperation(base,shape,{...job,passes:3});assert.ok(three.grid[15*96+15]<one.grid[15*96+15]);assert.ok(three.patch.indices.length===1);assert.equal(three.grid[15*96+14],-1000);
});
test("polygon membership is independent of winding, retains fractional outlines and includes outer grid boundaries",()=>{
 const a=terrainPolygonSelection(operation.points,shape),b=terrainPolygonSelection([...operation.points].reverse(),shape);assert.deepEqual(a.mask,b.mask);
 const edge=prepareTerrainOperation(new Int16Array(96*64),shape,{...operation,points:[{x:90.2,y:60.2},{x:96,y:60.2},{x:96,y:64},{x:90.2,y:64}]});assert.equal(edge.changed,24);assert.equal(edge.grid[63*96+95],900);assert.equal(edge.grid[60*96+89],0);
});
test("wrapping polygon selects the short seam-crossing area without touching the middle of the World",()=>{
 const s={...shape,wrap:true},r=prepareTerrainOperation(new Int16Array(96*64),s,{...operation,points:[{x:92,y:10},{x:4,y:10},{x:4,y:20},{x:92,y:20}]});assert.equal(r.changed,80);for(const x of [0,1,3,92,95])assert.equal(r.grid[15*96+x],900);assert.equal(r.grid[15*96+48],0);
});
test("interior blend follows the polygon's diagonal boundary rather than its bounding rectangle",()=>{
 const points=[{x:5,y:5},{x:25,y:5},{x:5,y:25}],selection=terrainPolygonSelection(points,shape),distances=selection.interiorDistances(4),at=(x:number,y:number)=>distances[(y-selection.area.y)*selection.area.width+x-selection.area.x];
 assert.equal(at(7,5),.5);assert.equal(at(10,10),4);assert.ok(Math.abs(at(14,14)-1/Math.sqrt(2))<1e-6);
 const r=prepareTerrainOperation(new Int16Array(96*64).fill(100),shape,{...operation,points,feather:4}),t=1/Math.sqrt(2)/4;
 assert.equal(r.grid[14*96+14],Math.round(100+800*t*t*(3-2*t)));assert.equal(r.grid[15*96+15],100);
});
test("invalid, empty, self-crossing or ambiguous polygons fail before touching the caller's terrain",()=>{
 const base=new Int16Array(96*64).fill(123),bad=[[{x:0,y:0},{x:10,y:10},{x:0,y:10},{x:10,y:0}],[{x:0,y:0},{x:5,y:0},{x:10,y:0}],[{x:-1,y:0},{x:5,y:0},{x:5,y:5}],[{x:10.1,y:10.1},{x:10.2,y:10.1},{x:10.2,y:10.2}],[{x:0,y:0},{x:10,y:0},{x:5,y:0},{x:5,y:10},{x:0,y:10}]];
 for(const points of bad)assert.throws(()=>prepareTerrainOperation(base,shape,{...operation,points}));assert.ok(base.every(v=>v===123));
 assert.throws(()=>terrainPolygonSelection([{x:0,y:0},{x:40,y:0},{x:80,y:10},{x:0,y:20}],{...shape,wrap:true}),/half the wrapping/);
});

const outer=[{x:10,y:10},{x:40,y:10},{x:40,y:40},{x:10,y:40}],hole=[{x:20,y:20},{x:25,y:20},{x:25,y:25},{x:20,y:25}];
test("interior exclusions preserve enclosed terrain and protection through a reversible numerical operation",()=>{
 const base=Int16Array.from({length:96*64},(_,i)=>i%113),before=base.slice(),blocked=new Uint8Array(base.length);blocked[15*96+15]=1;
 const r=prepareTerrainOperation(base,shape,{...operation,points:outer,holes:[hole]},undefined,blocked);
 for(let y=0;y<64;y++)for(let x=0;x<96;x++){const selected=x>=10&&x<40&&y>=10&&y<40&&!(x>=20&&x<25&&y>=20&&y<25)&&!(x===15&&y===15);assert.equal(r.grid[y*96+x],selected?900:base[y*96+x]);}
 assert.equal(r.changed,874);assert.deepEqual(base,before);applyPatch(r.grid,r.patch,"before",shape);assert.deepEqual(r.grid,base);
 const smooth=prepareTerrainOperation(base,shape,{...operation,points:outer,holes:[hole],tool:"smooth",passes:3});for(let y=20;y<25;y++)for(let x=20;x<25;x++)assert.equal(smooth.grid[y*96+x],base[y*96+x]);
});
test("interior feathering follows exclusion boundaries without changing excluded samples",()=>{
 const base=new Int16Array(96*64).fill(100),r=prepareTerrainOperation(base,shape,{...operation,points:outer,holes:[hole],feather:2});
 assert.equal(r.grid[22*96+19],225);assert.equal(r.grid[22*96+20],100);assert.equal(r.grid[15*96+15],900);assert.equal(r.grid[15*96+10],225);
 const reversed=prepareTerrainOperation(base,shape,{...operation,points:[...outer].reverse(),holes:[[...hole].reverse()],feather:2});assert.deepEqual(reversed.grid,r.grid);
});
test("wrapping exclusions align with the outer outline across the canonical seam",()=>{
 const s={...shape,wrap:true},base=new Int16Array(96*64).fill(100),points=[{x:92,y:10},{x:4,y:10},{x:4,y:30},{x:92,y:30}],holes=[[{x:0,y:15},{x:2,y:15},{x:2,y:25},{x:0,y:25}]],r=prepareTerrainOperation(base,s,{...operation,points,holes});
 assert.equal(r.changed,140);assert.equal(r.grid[20*96],100);assert.equal(r.grid[20*96+95],900);assert.equal(r.grid[20*96+48],100);assert.equal(r.grid[12*96],900);
});
test("outside, touching, intersecting, nested and over-budget exclusions fail before input mutation",()=>{
 const base=new Int16Array(96*64).fill(123),square=(a:number,b:number,c:number,d:number)=>[{x:a,y:b},{x:c,y:b},{x:c,y:d},{x:a,y:d}];
 for(const holes of [[square(5,5,8,8)],[square(10,15,15,20)],[square(5,15,15,20)],[hole,square(24,21,30,28)],[hole,square(21,21,24,24)],[[{x:20,y:20},{x:25,y:25},{x:20,y:25},{x:25,y:20}]]])assert.throws(()=>prepareTerrainOperation(base,shape,{...operation,points:outer,holes}));
 const many=Array.from({length:253},(_,i)=>({x:25+Math.cos(i/253*Math.PI*2)*2,y:25+Math.sin(i/253*Math.PI*2)*2}));assert.throws(()=>terrainPolygonSelection(outer,shape,[many]),/256 total/);assert.throws(()=>terrainPolygonSelection(outer,shape,Array(33).fill(hole)),/32 exclusions/);assert.ok(base.every(v=>v===123));
 const tiny=prepareTerrainOperation(base,shape,{...operation,points:outer,holes:[square(20.1,20.1,20.2,20.2)]});assert.equal(tiny.changed,900);
});
