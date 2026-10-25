import assert from "node:assert/strict";
import test from "node:test";
import {emptyMeasurement,measurementStats,gridInterval,boundedGridPlan,scaleBar,sampleToPhysical,physicalToSample,snapPhysicalPoint} from "./terrain-measurement";
import {DEFAULT_MEASUREMENT_PREFERENCES as prefs,fromMetres,toMetres,toStoredHeight,formatDistance,formatArea,formatCoordinate,convenientUnit,parseMeasurementPreferences} from "./terrain-units";
import type {TerrainGeometry} from "./terrain";
const shape:TerrainGeometry={width:1024,height:512,tileSize:32,displayWidth:20000000,displayHeight:10000000,min:-20000,max:20000,wrap:false};
test("distance and area units use international metre factors without mutating canonical values",()=>{
 for(const unit of ["m","km","mi","yd","ft"] as const)for(const value of [.01,1000,1e9])assert.ok(Math.abs(toMetres(fromMetres(value,unit),unit)-value)<Math.max(1e-12,value*1e-15));assert.equal(toMetres(1,"ft"),.3048);assert.equal(toMetres(1,"yd"),.9144);assert.equal(toMetres(1,"mi"),1609.344);assert.equal(formatDistance(100000,"km"),"100 km");assert.equal(formatArea(1e6,"km"),"1 km\u00b2");assert.equal(convenientUnit(999,"auto-metric"),"m");assert.equal(convenientUnit(1000,"auto-metric"),"km");assert.equal(convenientUnit(1609.344,"auto-imperial"),"mi");
});
test("known straight, route and rectangle measurements use physical coordinates",()=>{
 const line={...emptyMeasurement(),points:[{x:0,y:0},{x:100000,y:0}]};assert.equal(measurementStats(line,shape).length,100000);const path={...line,kind:"path" as const,points:[...line.points,{x:100000,y:50000}]};assert.equal(measurementStats(path,shape).length,150000);assert.equal(measurementStats(path,shape).lastSegment,50000);const area={...path,kind:"area" as const,points:[...path.points,{x:0,y:50000}]},r=measurementStats(area,shape);assert.equal(r.area,5e9);assert.equal(r.perimeter,300000);assert.equal(r.width,100000);assert.equal(r.height,50000);assert.equal(r.issue,"");
});
test("small area calculations remain stable near billion-metre World edges",()=>{
 const s={...shape,displayWidth:1e9,displayHeight:1e9},x=1e9-1000,y=1e9-1000,m={...emptyMeasurement(),kind:"area" as const,points:[{x,y},{x:x+100,y},{x:x+100,y:y+200},{x,y:y+200}]};assert.equal(measurementStats(m,s).area,20000);assert.equal(measurementStats(m,s).perimeter,600);
});
test("seam routes and polygons take short X segments, with an explicit direct alternative",()=>{
 const s={...shape,wrap:true,displayWidth:1e6},m={...emptyMeasurement(),points:[{x:990000,y:100000},{x:10000,y:100000}]};assert.equal(measurementStats(m,s).length,20000);assert.equal(measurementStats({...m,route:"direct"},s).length,980000);const area={...m,kind:"area" as const,points:[...m.points,{x:10000,y:200000},{x:990000,y:200000}]},r=measurementStats(area,s);assert.equal(r.area,2e9);assert.equal(r.perimeter,240000);assert.equal(r.issue,"");
});
test("ambiguous winding, self-intersection and invalid measurement points do not fabricate an area",()=>{
 const winding={...emptyMeasurement(),kind:"area" as const,points:[{x:0,y:0},{x:300,y:0},{x:600,y:100},{x:900,y:100}]};assert.match(measurementStats(winding,{...shape,wrap:true,displayWidth:1000}).issue,/winds around/);const crossed={...winding,points:[{x:0,y:0},{x:100,y:100},{x:0,y:100},{x:100,y:0}]};assert.equal(measurementStats(crossed,shape).area,null);assert.match(measurementStats(crossed,shape).issue,/crosses/);assert.match(measurementStats({...winding,points:[{x:NaN,y:0}]},shape).issue,/finite/);
});
test("automatic intervals use 1-2-5 distances with hysteresis and a viewport-derived bar",()=>{
 const a=gridInterval(1e-4,prefs);assert.equal(a.metres,1000000);assert.equal(gridInterval(1.01e-4,prefs,a.metres).metres,a.metres);assert.equal(gridInterval(.99e-4,prefs,a.metres).metres,a.metres);assert.ok(gridInterval(1e-2,prefs,a.metres).metres<a.metres);for(const scale of [1e-9,1e-6,1e-3,1,100]){const b=scaleBar(scale,"mi");assert.ok(b.pixels>=50&&b.pixels<=160);assert.equal(b.pixels,b.metres*scale);}
});
test("a tiny manual interval is bounded honestly instead of drawing billions of lines",()=>{
 const s={...shape,displayWidth:1e9,displayHeight:1e9},view={x:0,y:0,scale:1e-6},plan=boundedGridPlan(view,1000,1000,s,.001);assert.equal(plan.requested,.001);assert.ok(plan.stride>1);assert.ok(1e9/plan.step<=120);assert.ok(plan.step*view.scale>=50);assert.equal(plan.minor,0);assert.deepEqual(snapPhysicalPoint({x:995,y:123},20,{...s,displayWidth:1000,displayHeight:1000}),{x:1000,y:120});
});
test("sample/physical transforms preserve unequal-axis coordinates and preferences validate independently",()=>{
 const s={...shape,height:1024},point={x:125,y:300},physical=sampleToPhysical(point,s);assert.equal(physical.x,125*19531.25);assert.equal(physical.y,300*9765.625);assert.deepEqual(physicalToSample(physical,s),point);assert.deepEqual(parseMeasurementPreferences(prefs),prefs);assert.equal(parseMeasurementPreferences({...prefs,manualSpacingM:0}),null);assert.equal(parseMeasurementPreferences({...prefs,height:"yd"}),null);assert.equal(parseMeasurementPreferences({...prefs,distance:"furlongs"}),null);
});

test("cursor coordinates keep local precision on enormous Worlds and boundary snapping stays on grid",()=>{assert.equal(formatCoordinate(500000001.25,"m"),"500,000,001.25 m");assert.deepEqual(snapPhysicalPoint({x:999,y:999},600,{...shape,displayWidth:1000,displayHeight:1000}),{x:600,y:600});});

test("height units preserve original metre validation and round only explicit feet entry",()=>{assert.equal(toStoredHeight(1.5,"m"),1.5);assert.equal(toStoredHeight(10,"ft"),3);});
