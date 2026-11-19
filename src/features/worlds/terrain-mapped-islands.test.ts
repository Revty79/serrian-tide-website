import assert from "node:assert/strict";
import test from "node:test";
import {appendManualLake} from "./terrain-water-manual";
import {EMPTY_HYDROLOGY} from "./terrain-hydrology";
import {explicitDrySurfaceIndex} from "./terrain-dry-surface";
import {createEnvironmentArtist} from "./terrain-environment-art";
import {EMPTY_ENVIRONMENT} from "./terrain-environment";
import {EMPTY_TERRAIN_MATERIALS} from "./terrain-materials";
import {surfaceFieldWork} from "./terrain-surface-field";
import {DEFAULT_MAP_APPEARANCE,type MapAppearance} from "./terrain-appearance";
import {formatTerrainInspection,DEFAULT_MEASUREMENT_PREFERENCES} from "./terrain-units";
const world={width:10000,height:8000,wrap:true},outer=[{x:100,y:100},{x:900,y:100},{x:900,y:900},{x:100,y:900}],hole=[{x:300,y:300},{x:700,y:300},{x:700,y:700},{x:300,y:700}];
const lake=(level=3810)=>appendManualLake(EMPTY_HYDROLOGY,world,{id:"native",name:"Highland island",rings:[outer,hole],levelM:level,condition:"standing"});
test("mapped island geometry does not establish a submerged coarse sample as island elevation",()=>{
 const water=lake(),before=structuredClone(water),index=explicitDrySurfaceIndex(water,world);
 assert.equal(index.unresolvedIslandLevel(500,500,200),3810);assert.equal(index.unresolvedIslandLevel(500,500,3750),3810);assert.equal(index.unresolvedIslandLevel(500,500,3810),3810);assert.equal(index.unresolvedIslandLevel(500,500,3900),null);
 assert.equal(index.unresolvedIslandLevel(200,200,200),null);assert.equal(index.unresolvedIslandLevel(1500,1500,200),null);assert.deepEqual(water,before);
 assert.equal(explicitDrySurfaceIndex(water,world),index,"Immutable snapshots share their compiled index");
});
test("unknown-island underlay admits only a narrow antialias margin inside the saved lake",()=>{
 const index=explicitDrySurfaceIndex(lake(),world);assert.equal(index.unresolvedIslandLevel(295,500,200),null);assert.equal(index.unresolvedIslandLevel(295,500,200,6),3810);assert.equal(index.unresolvedIslandLevel(285,500,200,6),null);assert.equal(index.unresolvedIslandLevel(90,500,200,250),null);
});
test("negative lake datums, hidden water and dry basins retain distinct semantics",()=>{
 const water=lake(-430);assert.equal(explicitDrySurfaceIndex(water,world).unresolvedIslandLevel(500,500,-500),-430);assert.equal(explicitDrySurfaceIndex(water,world).unresolvedIslandLevel(500,500,-400),null);
 for(const altered of [{...water,visible:false},{...water,opacity:0},{...water,lakes:water.lakes!.map(l=>({...l,condition:"dry" as const}))},{...water,lakes:water.lakes!.map(l=>({...l,condition:"potential" as const}))}])assert.equal(explicitDrySurfaceIndex(altered,world).unresolvedIslandLevel(500,500,-500),null);
});
test("wrapped island constraints and antialias margins cross bins and the World seam",()=>{
 const water=appendManualLake(EMPTY_HYDROLOGY,world,{id:"seam",name:"Seam island",rings:[[{x:9500,y:100},{x:500,y:100},{x:500,y:900},{x:9500,y:900}],[{x:9850,y:300},{x:150,y:300},{x:150,y:700},{x:9850,y:700}]],levelM:4000,condition:"standing"}),index=explicitDrySurfaceIndex(water,world);
 for(const x of [9900,-100,100,10100])assert.equal(index.unresolvedIslandLevel(x,500,200),4000);
 assert.equal(index.unresolvedIslandLevel(9847,500,200,5),4000);assert.equal(index.unresolvedIslandLevel(5000,500,200,5),null);
});
test("six appearances mark the known water-level bound without inventing bed-derived island relief",()=>{
 const water=lake(),low={...surfaceFieldWork(),height:200,waterHeight:200,gx:.2,gy:-.1,rough:.3,spacing:100},high={...low,height:3750,waterHeight:3750,gx:-.3,gy:.4,rough:.6},before=structuredClone(low);
 for(const style of ["classic-elevation","physical-relief","topographic","illustrated-fantasy","realistic-terrain","engraved-fantasy"] as const){
  const appearance:MapAppearance={...DEFAULT_MAP_APPEARANCE,style,version:style==="realistic-terrain"?2:style==="engraved-fantasy"?3:1};
  const artist=createEnvironmentArtist(EMPTY_ENVIRONMENT,world,water,EMPTY_TERRAIN_MATERIALS,style,0,undefined,20,appearance);
  assert.deepEqual(artist(500,500,10,low),artist(500,500,10,high),style);assert.equal(artist(500,500,10,low)[3],255);assert.deepEqual(artist(1500,1500,10,low),[0,0,0,0]);
  assert.deepEqual(artist(500,500,10,{...low,height:4000,waterHeight:4000}),[0,0,0,0],"Resolved terrain retains its original painter");assert.deepEqual(low,before);
 }
});
test("hatching is deterministic, wraps continuously and does not recolour a resolved island",()=>{
 const water=lake(),field={...surfaceFieldWork(),height:200,waterHeight:200,spacing:100},artist=createEnvironmentArtist(EMPTY_ENVIRONMENT,world,water,EMPTY_TERRAIN_MATERIALS,"classic-elevation");
 assert.deepEqual(artist(500,500,10,field),artist(10500,500,10,field));assert.notDeepEqual(artist(500,500,10,field),artist(510,500,10,field));
});
test("inspection distinguishes mapped geometry, water level and the actual unchanged sample",()=>{
 const value={elevation:200,seaLevel:0,column:10,row:20,x:500,y:500,mappedIslandWaterLevel:3810},text=formatTerrainInspection(value,DEFAULT_MEASUREMENT_PREFERENCES);
 assert.match(text,/Mapped island: elevation unresolved/);assert.match(text,/lake level 3,810 m/);assert.match(text,/coarse numerical sample 200 m/);assert.doesNotMatch(text,/Elevation 200 m.*land/);
 assert.equal(formatTerrainInspection("Inspect terrain",DEFAULT_MEASUREMENT_PREFERENCES),"Inspect terrain");
});
