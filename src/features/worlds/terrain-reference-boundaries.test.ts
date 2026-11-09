import {test} from "node:test";
import assert from "node:assert/strict";
import {geographicProjection} from "./geographic-projection";
import {terrainReferenceExtent,terrainReferenceTransform,terrainReferenceSourceFrame} from "./terrain-reference-boundaries";
import type {GeographicViewport,GeographicBounds} from "./geographic";
const world={displayWidth:40075000,displayHeight:20004000,wrap:true},reference={version:1 as const,kind:"sphere" as const,crs:"EPSG:4326" as const,units:"degrees" as const};
const packet=(bounds:GeographicBounds):GeographicViewport=>({layer:{mapId:"map",mapName:"Map",surface:{id:"surface",name:"Angular surface",reference,realmId:null,protected:false}},canEdit:false,context:"test",bounds,projection:"equirectangular",lod:"overview",shapes:[],attributions:[],nextCursor:null});
test("full and wrapped native viewports map into the exact angular domain",()=>{
 assert.deepEqual(terrainReferenceExtent(world,{left:-1000,right:40076000,top:-1000,bottom:20005000}),[-180,-90,180,90]);const wrap=terrainReferenceExtent(world,{left:world.displayWidth*.95,right:world.displayWidth*1.05,top:0,bottom:world.displayHeight})!;assert(Math.abs(wrap[0]-162)<1e-8&&Math.abs(wrap[2]+162)<1e-8);assert.equal(terrainReferenceExtent(world,{left:0,right:100,top:world.displayHeight+10,bottom:world.displayHeight+100}),null);
});
test("native boundary paths align at global, regional and antimeridian scales without resampling",()=>{
 for(const bounds of [[-180,-90,180,90],[-15,30,45,70],[150,-30,-150,30]] as GeographicBounds[]){const p=packet(bounds),frame=terrainReferenceTransform(p,world),project=geographicProjection(reference,bounds,"equirectangular");for(const point of bounds[0]>bounds[2]?[[170,0],[-170,10]]:[[bounds[0]+1,bounds[1]+1],[(bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2]]){const projected=project(point as [number,number])!;let x=frame.x+projected[0]*frame.scaleX,expected=(point[0]+180)/360*world.displayWidth;x=((x%world.displayWidth)+world.displayWidth)%world.displayWidth;expected=((expected%world.displayWidth)+world.displayWidth)%world.displayWidth;assert(Math.abs(x-expected)<1e-7);assert(Math.abs(frame.y+projected[1]*frame.scaleY-(90-point[1])/180*world.displayHeight)<1e-7);}}
});
test("source navigation focuses wrapping archipelagos and retains polar bounds",()=>{
 const island=terrainReferenceSourceFrame([[170,-10,180,5],[-180,-8,-165,10]],world)!;assert(island.width<world.displayWidth*.15);assert(island.x+island.width>world.displayWidth);
 const fixed=terrainReferenceSourceFrame([[170,-10,180,5],[-180,-8,-165,10]],{...world,wrap:false})!;assert.equal(fixed.x,0);assert.equal(fixed.width,world.displayWidth);
 const polar=terrainReferenceSourceFrame([[-180,-90,180,-60]],world)!;assert.equal(polar.height+polar.y,world.displayHeight);assert.equal(polar.width,world.displayWidth);
 assert.equal(terrainReferenceSourceFrame([],world),undefined);assert.throws(()=>terrainReferenceSourceFrame([[181,0,182,1]],world),/invalid angular/);
});
