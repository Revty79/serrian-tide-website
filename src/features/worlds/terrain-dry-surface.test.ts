import test from "node:test";
import assert from "node:assert/strict";
import {explicitDrySurfaceIndex} from "./terrain-dry-surface";
import {EMPTY_HYDROLOGY} from "./terrain-hydrology";
import {appendManualLake} from "./terrain-water-manual";
import {EMPTY_ENVIRONMENT} from "./terrain-environment";
import {createEnvironmentArtist} from "./terrain-environment-art";
import {EMPTY_TERRAIN_MATERIALS} from "./terrain-materials";
import {surfaceFieldWork} from "./terrain-surface-field";
import {DEFAULT_MAP_APPEARANCE,type MapAppearance} from "./terrain-appearance";
const world={width:10000,height:8000,wrap:true},outer=[{x:100,y:100},{x:900,y:100},{x:900,y:900},{x:100,y:900}],hole=[{x:300,y:300},{x:700,y:300},{x:700,y:700},{x:300,y:700}];
test("explicit dry surfaces preserve water, island holes, local levels and numerical inputs",()=>{
 const lake=appendManualLake(EMPTY_HYDROLOGY,world,{id:"synthetic",name:"Island waterbody",rings:[outer,hole],levelM:-29,condition:"standing"}),before=structuredClone(lake),index=explicitDrySurfaceIndex(lake,world);
 assert.equal(index.at(500,500,-24),true);assert.equal(index.at(500,500,-35),false);assert.equal(index.at(200,200,-35),false);assert.equal(index.at(1500,1500,-24),false);assert.deepEqual(lake,before);
 const dry=appendManualLake(EMPTY_HYDROLOGY,world,{id:"dry",name:"Dry basin",rings:[outer,hole],levelM:0,condition:"dry"}),dryIndex=explicitDrySurfaceIndex(dry,world);assert.equal(dryIndex.at(200,200,-100),true);assert.equal(dryIndex.at(500,500,-100),false);assert.equal(explicitDrySurfaceIndex({...dry,visible:false},world).has,false);assert.equal(explicitDrySurfaceIndex({...dry,opacity:0},world).has,false);
 const wrap=appendManualLake(EMPTY_HYDROLOGY,world,{id:"wrap",name:"Seam basin",rings:[[{x:9800,y:100},{x:300,y:100},{x:300,y:900},{x:9800,y:900}]],levelM:0,condition:"dry"}),seam=explicitDrySurfaceIndex(wrap,world);assert.equal(seam.at(9900,500,-100),true);assert.equal(seam.at(100,500,-100),true);assert.equal(seam.at(10100,500,-100),true);assert.equal(seam.at(9000,500,-100),false);
});
test("all appearances draw deliberate below-sea dry ground without moving heights or painting surrounding sea",()=>{
 const layer=appendManualLake(EMPTY_HYDROLOGY,world,{id:"dry",name:"Dry basin",rings:[outer],levelM:-50,condition:"dry"}),field={...surfaceFieldWork(),height:-100,waterHeight:-100,spacing:100},before=structuredClone(field);
 for(const style of ["classic-elevation","physical-relief","topographic","illustrated-fantasy","realistic-terrain","engraved-fantasy"] as const){
  const appearance:MapAppearance={...DEFAULT_MAP_APPEARANCE,version:style==="realistic-terrain"?2:style==="engraved-fantasy"?3:1,style,intervalM:50};
  const artist=createEnvironmentArtist(EMPTY_ENVIRONMENT,world,layer,EMPTY_TERRAIN_MATERIALS,style,0,undefined,20,appearance),pixel=artist(500,500,10,field);
  assert.equal(pixel[3],255,style);assert.ok(pixel.slice(0,3).every(v=>Number.isFinite(v)&&v>=0&&v<=255),style+" has a bounded ground palette");assert.deepEqual(artist(1500,1500,10,field),[0,0,0,0]);assert.deepEqual(field,before);
  const hidden=createEnvironmentArtist(EMPTY_ENVIRONMENT,world,layer,EMPTY_TERRAIN_MATERIALS,style,0,undefined,20,appearance,false);assert.deepEqual(hidden(500,500,10,field),[0,0,0,0]);
 }
});
