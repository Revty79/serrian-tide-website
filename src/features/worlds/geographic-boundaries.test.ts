import assert from "node:assert/strict";
import test from "node:test";
import {sourceBoundaryParts} from "./geographic-boundaries";
import {projectedSourcePath} from "./geographic-projection";
import type {Coordinate,SourceGeometry,SpatialReference} from "./geographic";
const sphere:SpatialReference={version:1,kind:"sphere",crs:"EPSG:4326",units:"degrees"};
function lines(g:SourceGeometry):Coordinate[][]{return g.type==="LineString"?[g.coordinates]:g.type==="MultiLineString"?g.coordinates:[];}
test("paired source cuts at the antimeridian do not become an island border",()=>{
 const source:SourceGeometry={type:"MultiPolygon",coordinates:[[[[179,-18],[180,-18],[180,-16],[179,-16],[179,-18]]],[[[-180,-18],[-179,-18],[-179,-16],[-180,-16],[-180,-18]]]]},before=structuredClone(source),parts=sourceBoundaryParts(source,sphere);
 assert.equal(parts.length,2);for(const part of parts)for(const line of lines(part))for(let i=1;i<line.length;i++)assert.ok(!(Math.abs(line[i][0])===180&&line[i][0]===line[i-1][0]));
 assert.ok(parts.every(p=>projectedSourcePath(p,sphere,[178,-20,-178,-14]).length));assert.deepEqual(source,before);
});
test("an unpaired genuine meridian edge is retained",()=>{const source:SourceGeometry={type:"Polygon",coordinates:[[[179,10],[180,10],[180,12],[179,12],[179,10]]]};const result=sourceBoundaryParts(source,sphere)[0];assert.deepEqual(lines(result)[0],source.coordinates[0]);});
test("unequal and subdivided opposite cuts remove only their shared interval",()=>{const source:SourceGeometry={type:"MultiPolygon",coordinates:[[[[179,-18],[180,-18],[180,-17],[180,-16],[179,-16],[179,-18]]],[[[-180,-17.99],[-179,-17.99],[-179,-15.99],[-180,-15.99],[-180,-17.99]]]]};const result=sourceBoundaryParts(source,sphere);for(const part of result)for(const line of lines(part))for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i];if(Math.abs(a[0])===180&&a[0]===b[0])assert.ok(Math.max(a[1],b[1])<=-17.99||Math.min(a[1],b[1])>=-16);}assert.equal(source.coordinates[0][0][1][1],-18);});
test("polar display cuts and the single pole point do not become territorial borders",()=>{const source:SourceGeometry={type:"Polygon",coordinates:[[[180,-80],[180,-90],[-180,-90],[-180,-80],[-90,-75],[0,-80],[90,-75],[180,-80]]]};const result=sourceBoundaryParts(source,sphere)[0];assert.ok(lines(result).every(line=>line.every(p=>p[1]!==-90)));assert.ok(projectedSourcePath(result,sphere).length);});
test("holes and original planar boundary coordinates remain independent lines",()=>{const plane:SpatialReference={version:1,kind:"plane",crs:"AUTHORED:original",units:"paces",bounds:[0,0,10,10]},source:SourceGeometry={type:"Polygon",coordinates:[[[1,1],[9,1],[9,9],[1,9],[1,1]],[[3,3],[4,3],[4,4],[3,4],[3,3]]]};assert.deepEqual(lines(sourceBoundaryParts(source,plane)[0]),source.coordinates);});
