import {test} from "node:test";
import assert from "node:assert/strict";
import {geographicProjection} from "./geographic-projection";
import {terrainReferenceExtent,terrainReferenceTransform,terrainReferenceSourceFrame,terrainReferenceCoordinate,terrainReferencePosition} from "./terrain-reference-boundaries";
import type {GeographicViewport,GeographicBounds} from "./geographic";
const world={displayWidth:40075000,displayHeight:20004000,wrap:true},reference={version:1 as const,kind:"sphere" as const,crs:"EPSG:4326" as const,units:"degrees" as const};
const packet=(bounds:GeographicBounds):GeographicViewport=>({layer:{mapId:"map",mapName:"Map",surface:{id:"surface",name:"Angular surface",reference,realmId:null,protected:false}},canEdit:false,context:"test",bounds,projection:"equirectangular",lod:"overview",shapes:[],attributions:[],nextCursor:null});

test("declared native coordinates invert the same full-angular alignment across latitudes and scales",()=>{
 for(const coordinate of[{longitude:0,latitude:0},{longitude:-114.3,latitude:39},{longitude:179.99,latitude:-80},{longitude:-180,latitude:90},{longitude:180,latitude:-90}]){
  const position=terrainReferencePosition(world,coordinate)!;assert(position);const back=terrainReferenceCoordinate(world,position)!;assert(Math.abs(back.latitude-coordinate.latitude)<1e-10);assert(Math.abs(back.longitude-coordinate.longitude)<1e-10||Math.abs(back.longitude-coordinate.longitude)===360);
  const frame=terrainReferenceSourceFrame([[coordinate.longitude,coordinate.latitude,coordinate.longitude,coordinate.latitude]],world)!;assert(frame.width>0&&frame.height>0);assert(frame.y>=0&&frame.y+frame.height<=world.displayHeight);
 }
 assert.deepEqual(terrainReferenceCoordinate(world,{x:world.displayWidth/2,y:world.displayHeight/2}),{longitude:0,latitude:0});
});
test("coordinate inspection refuses invalid dimensions, non-finite positions and unwrapped outside points",()=>{
 for(const bad of[{...world,displayWidth:0},{...world,displayHeight:NaN}]){assert.equal(terrainReferenceCoordinate(bad,{x:0,y:0}),null);assert.equal(terrainReferencePosition(bad,{longitude:0,latitude:0}),null);}
 for(const point of[{x:NaN,y:0},{x:0,y:-1},{x:0,y:world.displayHeight+1}])assert.equal(terrainReferenceCoordinate(world,point),null);
 assert.equal(terrainReferenceCoordinate({...world,wrap:false},{x:-1,y:0}),null);assert.equal(terrainReferenceCoordinate({...world,wrap:false},{x:world.displayWidth+1,y:0}),null);
 assert.deepEqual(terrainReferenceCoordinate({...world,wrap:false},{x:world.displayWidth,y:world.displayHeight}),{longitude:180,latitude:-90});
 for(const coordinate of[{longitude:181,latitude:0},{longitude:0,latitude:-91},{longitude:Infinity,latitude:0}])assert.equal(terrainReferencePosition(world,coordinate),null);
});
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
