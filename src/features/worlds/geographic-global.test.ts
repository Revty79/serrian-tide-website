import assert from "node:assert/strict";
import test from "node:test";
import {geoContains} from "d3-geo";
import {automaticGeographicDetail,focusedGeographicExtent,geographicDisplaySchema,sourceGeometrySchema,type SourceGeometry,type SpatialReference} from "./geographic";
import {partBounds,validateSourceGeometry} from "./geographic-geometry";
import {projectedSourcePath,sphericalCopy} from "./geographic-projection";
const sphere:SpatialReference={version:1,kind:"sphere",crs:"EPSG:4326",units:"degrees"};
const cap:SourceGeometry={type:"Polygon",coordinates:[[[180,-80],[180,-90],[-180,-90],[-180,-80],[-90,-75],[0,-80],[90,-75],[180,-80]]]};

test("southern polar seam keeps Antarctica-like source coordinates and orientation",()=>{
  const before=structuredClone(cap);validateSourceGeometry(cap,sphere);
  const display=sphericalCopy(cap);assert.equal(geoContains(display,[0,-89]),true);assert.equal(geoContains(display,[0,0]),false);
  assert.equal(partBounds(cap,sphere)[0][1],-90);assert.ok(projectedSourcePath(cap,sphere).length>20);
  assert.deepEqual(cap,before);
});
test("polar cap holes and other components use the same validation frame",()=>{
  const withHole=structuredClone(cap);withHole.coordinates.push([[0,-85],[10,-85],[10,-86],[0,-86],[0,-85]]);
  validateSourceGeometry(withHole,sphere);
  const overlap=sourceGeometrySchema.parse({type:"MultiPolygon",coordinates:[cap.coordinates,[[[0,-85],[10,-85],[10,-86],[0,-86],[0,-85]]]]});
  assert.throws(()=>validateSourceGeometry(overlap,sphere),/overlap/);
  const crossed=structuredClone(cap);crossed.coordinates[0][4]=[-90,20];assert.throws(()=>validateSourceGeometry(crossed,sphere),/hemisphere/);
});
test("floating point seam noise is retained and real out-of-domain coordinates fail",()=>{
  const geometry:SourceGeometry={type:"Polygon",coordinates:[[[180+1e-13,10],[179,10],[179,12],[180+1e-13,12],[180+1e-13,10]]]};
  const before=JSON.stringify(geometry);validateSourceGeometry(geometry,sphere);assert.ok(projectedSourcePath(geometry,sphere).length);
  assert.equal(JSON.stringify(geometry),before);
  assert.throws(()=>validateSourceGeometry({type:"Point",coordinates:[180.00001,0]},sphere),/domain/);
});
test("source-backed touching lobes remain readable but crossings and retracing fail",()=>{
  const touching:SourceGeometry={type:"Polygon",coordinates:[[[0,0],[4,0],[4,4],[0,4],[0,0],[-1,0],[-1,-1],[0,0]]]};
  validateSourceGeometry(touching,sphere);assert.ok(projectedSourcePath(touching,sphere).length);
  assert.throws(()=>validateSourceGeometry({type:"Polygon",coordinates:[[[0,0],[4,4],[0,4],[4,0],[0,0]]]},sphere),/cross/);
  assert.throws(()=>validateSourceGeometry({type:"Polygon",coordinates:[[[0,0],[4,0],[4,4],[0,4],[0,0],[4,0],[0,-4],[0,0]]]},sphere),/retrace/);
});
test("automatic detail follows wrapping and original planar viewport proportions",()=>{
  assert.equal(automaticGeographicDetail([-180,-90,180,90],sphere),"overview");
  assert.equal(automaticGeographicDetail([160,-25,-170,0],sphere),"regional");
  assert.equal(automaticGeographicDetail([177,-20,-178,-15],sphere),"detail");
  const plane:SpatialReference={version:1,kind:"plane",crs:"AUTHORED:original",units:"paces",bounds:[0,0,2000,1200]};
  assert.equal(automaticGeographicDetail([0,0,100,100],plane),"regional");
  assert.equal(automaticGeographicDetail([0,0,20,20],plane),"detail");
});
test("display metadata bounds detail bands and preserves independent interpretations",()=>{
  assert.ok(geographicDisplaySchema.safeParse({lods:["overview","regional"],priority:10,style:"disputed",exact:true}).success);
  assert.ok(!geographicDisplaySchema.safeParse({lods:["overview","overview"],priority:10,style:"land",exact:true}).success);
  assert.ok(!geographicDisplaySchema.safeParse({lods:["detail"],priority:101,style:"land",exact:true}).success);
});
test("focusing a polar or almost global source retains the full longitude domain",()=>{const polar=focusedGeographicExtent([-180,-90,180,-63],sphere);assert.equal(polar[0],-180);assert.equal(polar[2],180);assert.equal(polar[1],-90);assert.ok(polar[3]>-63);const wide=focusedGeographicExtent([-170,-60,170,60],sphere);assert.equal(wide[0],-180);assert.equal(wide[2],180);const fiji=focusedGeographicExtent([178,-19,-179,-16],sphere);assert.ok(fiji[0]>fiji[2]);});
test("larger complete rings stay bounded without rounding source precision",()=>{
  const coordinates=Array.from({length:9000},(_,i)=>[20+Math.cos(i*2*Math.PI/9000),20+Math.sin(i*2*Math.PI/9000)] as [number,number]);coordinates.push(coordinates[0]);
  const geometry=sourceGeometrySchema.parse({type:"Polygon",coordinates:[coordinates]});validateSourceGeometry(geometry,sphere);
  assert.equal(geometry.type,"Polygon");if(geometry.type!=="Polygon")throw new Error("Expected polygon");
  assert.equal(geometry.coordinates[0][1][0],coordinates[1][0]);
  assert.throws(()=>validateSourceGeometry({type:"MultiLineString",coordinates:Array.from({length:17},()=>Array.from({length:8192},(_,i)=>[i/100,0] as [number,number]))},sphere),/131,072/);
});
