import assert from "node:assert/strict";
import test from "node:test";
import { boundedSourceDisplay,DISPLAY_PATH_BUDGET } from "./geographic-display";
import { projectedSourcePath } from "./geographic-projection";
import type { SourceGeometry,SpatialReference } from "./geographic";

const sphere:SpatialReference={version:1,kind:"sphere",crs:"EPSG:4326",units:"degrees"},world:[number,number,number,number]=[-180,-90,180,90];
test("an oversized detailed component receives bounded display geometry without editing coordinates",()=>{
  const source:SourceGeometry={type:"LineString",coordinates:Array.from({length:100_000},(_,i)=>[-150+i*.003,20+Math.sin(i)*.0001])},original=JSON.stringify(source);
  assert.ok(projectedSourcePath(source,sphere).length>500_000);
  const display=boundedSourceDisplay(source,sphere,world,"equirectangular");
  assert.ok(display.path.length>0&&display.path.length<=DISPLAY_PATH_BUDGET);assert.equal(display.tolerance,.35);assert.equal(JSON.stringify(source),original);
});
test("zooming increases local detail within a screen-space tolerance",()=>{
  const source:SourceGeometry={type:"LineString",coordinates:Array.from({length:1000},(_,i)=>[i*.001,20+Math.sin(i/10)*.01])};
  const whole=boundedSourceDisplay(source,sphere,world,"equirectangular"),local=boundedSourceDisplay(source,sphere,[0,19.98,1,20.02],"equirectangular");
  assert.ok(local.path.length>whole.path.length);assert.equal(local.tolerance,whole.tolerance);
});
test("independent tiny polygon holes and antimeridian clips remain closed display components",()=>{
  const source:SourceGeometry={type:"Polygon",coordinates:[[[179,-20],[-179,-20],[-179,-10],[179,-10],[179,-20]],[[179.2,-15],[179.2001,-15],[179.2001,-14.9999],[179.2,-14.9999],[179.2,-15]]]};
  const original=JSON.stringify(source),display=boundedSourceDisplay(source,sphere,world,"equirectangular");
  assert.ok((display.path.match(/Z/g)?.length??0)>=3);assert.ok(!/NaN|Infinity/.test(display.path));assert.equal(JSON.stringify(source),original);
});
test("polar caps, exact markers and original fictional coordinate frames remain readable",()=>{
  const cap:SourceGeometry={type:"Polygon",coordinates:[[[-180,80],[-90,80],[0,80],[90,80],[180,80],[-180,80]]]};
  assert.ok(boundedSourceDisplay(cap,sphere,world,"equirectangular").path.length>0);
  const point:SourceGeometry={type:"Point",coordinates:[45.123,20.987]};assert.equal(boundedSourceDisplay(point,sphere,world,"equirectangular",2.4).path,projectedSourcePath(point,sphere,world,"equirectangular",2.4));
  const plane:SpatialReference={version:1,kind:"plane",crs:"AUTHORED:original",units:"paces",bounds:[-200,-100,2000,1200]},line:SourceGeometry={type:"LineString",coordinates:[[-200,0],[20,10],[2000,1200]]};
  const original=JSON.stringify(line);assert.ok(boundedSourceDisplay(line,plane,plane.bounds,"planar").path.length>0);assert.equal(JSON.stringify(line),original);
});
