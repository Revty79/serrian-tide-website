import assert from "node:assert/strict";
import test from "node:test";
import {emptyTownDesign,townFeature,townSnap,townBounds,validateTownDesign,type TownBackdrop} from "./town-map";
import {sampleTownRoad,nearestTownRoad,townRoadSections} from "./town-road";
import {defaultTownPopulation,populateTownRoad} from "./town-map-populate";

const frame={x:0,y:0,width:1500,height:1000,rotation:0},road=townFeature("road","line",[{x:120,y:450},{x:420,y:250},{x:800,y:690},{x:1350,y:480}],"81000000-0000-4000-8000-000000000001");road.category="curve:main";road.width=12;
const ground=():TownBackdrop=>({width:1500,height:1000,wrap:false,seaLevel:0,fingerprint:"test",spacing:100,size:17,heights:Array(289).fill(40),wet:Array(289).fill(false),warnings:[]});
test("curved streets retain end positions, stay inside their bend hull, and share accurate snapping",()=>{
 const original=JSON.stringify(road),samples=sampleTownRoad(road);assert.deepEqual(samples[0],road.points[0]);assert.deepEqual(samples.at(-1),road.points.at(-1));assert.ok(samples.length<=2049);
 for(const p of samples){assert.ok(p.x>=120&&p.x<=1350&&p.y>=250&&p.y<=690);assert.ok(nearestTownRoad(p,road,.03));}
 const target=samples[Math.floor(samples.length/2)],d={...emptyTownDesign(),features:[road]},snap=townSnap({x:target.x+.05,y:target.y+.05},d,2);assert.ok(nearestTownRoad(snap,road,.03));assert.equal(JSON.stringify(road),original);
 const legacy={...road,category:"main"};assert.deepEqual(sampleTownRoad(legacy),legacy.points);assert.ok(townRoadSections(legacy).every(s=>!s.control));
});
test("population follows winding streets on both sides, preserving every original object and link",()=>{
 const existing=townFeature("building","area",[{x:650,y:200},{x:700,y:200},{x:700,y:240},{x:650,y:240}],"81000000-0000-4000-8000-000000000002");existing.placeId="81000000-0000-4000-8000-000000000003";
 const design={...emptyTownDesign(),features:[road,existing]},before=JSON.stringify(design),result=populateTownRoad(road,design,frame,ground(),defaultTownPopulation());assert.ok(result.additions.length>10);assert.ok(new Set(result.additions.map(s=>s.category)).size>=2);assert.equal(JSON.stringify(design),before);assert.deepEqual(result.design.features.slice(0,2),design.features);validateTownDesign(result.design,frame);
 const sides=new Set<number>();for(const s of result.additions){assert.equal(s.placeId,null);assert.equal(s.shopLocationId,null);const b=townBounds(s),center={x:b.x+b.width/2,y:b.y+b.height/2},near=nearestTownRoad(center,road)!;sides.add(Math.sign(Math.cos(near.angle)*(center.y-near.point.y)-Math.sin(near.angle)*(center.x-near.point.x)));for(const p of s.points)assert.ok(nearestTownRoad(p,road)!.distance>=road.width/2+.5);}
 assert.equal(sides.size,2);assert.deepEqual(populateTownRoad(road,design,frame,ground(),defaultTownPopulation()),result);
 for(let i=0;i<result.additions.length;i++)for(let j=i+1;j<result.additions.length;j++){const a=townBounds(result.additions[i]),b=townBounds(result.additions[j]);assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y);}
});
test("population refuses wet or locked ground, respects capacity, and never rewrites existing work",()=>{
 const design={...emptyTownDesign(),features:[road]},wet=ground();wet.wet.fill(true);const result=populateTownRoad(road,design,frame,wet,defaultTownPopulation());assert.equal(result.additions.length,0);assert.ok(result.skipped.water>0);assert.deepEqual(result.design,design);
 const locked=structuredClone(design);locked.layers.buildings.locked=true;assert.equal(populateTownRoad(road,locked,frame,ground(),defaultTownPopulation()).additions.length,0);
 const full={...design,features:[road,...Array.from({length:3999},(_,i)=>({...townFeature("label","point",[{x:20,y:20}],`82000000-0000-4000-8000-${String(i).padStart(12,"0")}`),archived:true}))]};const capped=populateTownRoad(road,full,frame,ground(),defaultTownPopulation());assert.equal(capped.additions.length,0);assert.deepEqual(capped.design,full);
});
test("population density and side choices are effective and previews remain bounded",()=>{
 const straight={...road,category:"street",points:[{x:20,y:500},{x:1480,y:500}]},design={...emptyTownDesign(),features:[straight]},options=defaultTownPopulation(),dense=populateTownRoad(straight,design,frame,ground(),{...options,density:"dense",side:"right"}),sparse=populateTownRoad(straight,design,frame,ground(),{...options,density:"sparse",side:"right"});
 assert.ok(dense.additions.length>sparse.additions.length);assert.ok(dense.additions.every(s=>s.points.every(p=>p.y>500)));assert.ok(dense.additions.length<=200);assert.ok(populateTownRoad(straight,design,frame,ground(),{...options,categories:[]}).warnings.length);
});
