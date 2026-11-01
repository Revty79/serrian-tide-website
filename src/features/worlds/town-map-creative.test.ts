import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {defaultTownGeneration,emptyTownDesign,generateTown,validateTownDesign,transformTownFeature,type TownBackdrop} from "./town-map";
import {defaultTownBrush,makeTownStamp,placeTownStamp,townBuildingPresets,validTownBrush} from "./town-map-presets";
const frame={x:0,y:0,width:1500,height:1000,rotation:0},backdrop:TownBackdrop={width:200000,height:120000,wrap:false,size:17,seaLevel:0,fingerprint:"creative-test",spacing:10,heights:Array(289).fill(100),wet:Array(289).fill(false),warnings:[]};
test("Every building choice places centimetre-rounded, editable, unlinked geometry through rotations",()=>{
 for(const preset of townBuildingPresets)for(const rotation of [0,45,90,225])for(const size of [.7,1,2]){
  const piece=makeTownStamp("building",{x:750,y:500},{...defaultTownBrush(),category:preset.id,rotation,size},randomUUID(),frame);
  validateTownDesign({...emptyTownDesign(),features:[piece]},frame);assert.equal(piece.placeId,null);assert.equal(piece.shopLocationId,null);assert.equal(piece.category,"timber:"+preset.id);
 }
 const outlines=new Set(townBuildingPresets.map(p=>JSON.stringify(makeTownStamp("building",{x:50,y:50},{...defaultTownBrush(),category:p.id},randomUUID()).points)));
 assert.ok(outlines.size>=10,"The collection must provide different sizes and silhouettes, not renamed copies.");
});
test("Organic villages have a gathering place, street-facing architectural variety and natural details",()=>{
 const result=generateTown({...defaultTownGeneration(),mode:"generate",category:"village",population:500,culture:"timber",seed:"village-review"},frame,backdrop).design;
 assert.ok(result.features.some(s=>s.kind==="square"&&s.category==="market"));assert.ok(result.features.some(s=>s.category==="tree"));
 const buildings=result.features.filter(s=>s.kind==="building");assert.ok(buildings.length>20);assert.ok(new Set(buildings.map(s=>s.category)).size>=5);assert.ok(new Set(buildings.map(s=>s.points.length)).size>=3);
 assert.ok(buildings.some(s=>s.points[0].y!==s.points[1].y),"Buildings should follow the direction of winding streets.");
 assert.ok(result.features.every(s=>!s.placeId&&!s.shopLocationId));validateTownDesign(result,frame);
});
test("Organic, planned, radial and fortified previews produce different editable settlements",()=>{
 const settings={...defaultTownGeneration(),mode:"generate" as const,category:"town" as const,population:3000,seed:"same-location"};
 const designs=(["organic","grid","radial"] as const).map(roads=>generateTown({...settings,roads},frame,backdrop).design);
 assert.equal(new Set(designs.map(d=>JSON.stringify(d.features))).size,3);
 const fortified=generateTown({...settings,fortified:true},frame,backdrop).design;assert.ok(fortified.features.some(s=>s.kind==="wall"));assert.ok(fortified.features.some(s=>s.category==="gate"));
 for(const design of [...designs,fortified])validateTownDesign(design,frame);
});
test("Invalid local palette settings cannot become recovered canvas state",()=>{
 assert.ok(validTownBrush(defaultTownBrush()));for(const value of [null,{}, {...defaultTownBrush(),size:Infinity},{...defaultTownBrush(),rotation:NaN},{...defaultTownBrush(),placement:"unknown"},{...defaultTownBrush(),width:-1}])assert.equal(validTownBrush(value),false);
});
test("Street-facing placement keeps houses beside roads and can be turned off",()=>{
 const d=emptyTownDesign(),road={id:randomUUID(),kind:"road" as const,shape:"line" as const,points:[{x:100,y:100},{x:500,y:500}],width:10,name:"",category:"street",origin:"manual" as const,placeId:null,shopLocationId:null,archived:false};d.features=[road];const before=JSON.stringify(d);
 const aligned=placeTownStamp("building",{x:300,y:300},defaultTownBrush(),randomUUID(),frame,d);validateTownDesign({...d,features:[...d.features,aligned]},frame);
 assert.ok(aligned.points.every(p=>Math.abs(p.y-p.x)/Math.SQRT2>road.width/2),"The cottage must not be centered on the road.");
 const free=placeTownStamp("building",{x:300,y:300},{...defaultTownBrush(),followRoad:false},randomUUID(),frame,d);assert.equal(free.points[0].y,free.points[1].y);assert.equal(JSON.stringify(d),before);
});
test("Trees really resize, and gates retain an editable direction through save geometry",()=>{
 const tree=makeTownStamp("landmark",{x:500,y:500},{...defaultTownBrush(),category:"tree"},randomUUID()),larger=transformTownFeature(tree,0,0,0,1.1);assert.equal(larger.width,5.5);assert.deepEqual(larger.points,tree.points);
 const gate=makeTownStamp("landmark",{x:500,y:500},{...defaultTownBrush(),category:"gate"},randomUUID()),turned=transformTownFeature(gate,0,0,90);assert.equal(gate.shape,"line");assert.notDeepEqual(turned.points,gate.points);assert.equal(turned.points[0].x,turned.points[1].x);validateTownDesign({...emptyTownDesign(),features:[larger,turned]},frame);
});
