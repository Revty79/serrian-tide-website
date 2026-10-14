import assert from "node:assert/strict";
import test from "node:test";
import {validateSourceGeometry} from "./geographic-geometry";
import {projectedSourceLabel} from "./geographic-projection";
import {GEOGRAPHIC_THEMES,layoutGeographicLabels,shapeTheme} from "./geographic-themes";
import {sourceImportSchema,type GeographicShape,type SourceGeometry,type SpatialReference} from "./geographic";
const reference:SpatialReference={version:1,kind:"sphere",crs:"EPSG:4326",units:"degrees"};
test("explicit coincident-vertex retention validates a copy and retains original coordinates",()=>{
  const geometry:SourceGeometry={type:"Polygon",coordinates:[[[10,20],[11,20],[11,20],[11,21],[10,20]]]},before=JSON.stringify(geometry);assert.throws(()=>validateSourceGeometry(geometry,reference),/consecutive/);validateSourceGeometry(geometry,reference,{retainCoincidentVertices:true});assert.equal(JSON.stringify(geometry),before);
});
test("source retention does not permit crossing, retraced or degenerate polygon rings",()=>{
  for(const ring of [[[0,0],[2,2],[0,2],[2,0],[0,0]],[[0,0],[2,0],[1,0],[2,2],[0,0]],[[0,0],[1,1],[2,2],[0,0]]])assert.throws(()=>validateSourceGeometry({type:"Polygon",coordinates:[ring as [number,number][]]},reference,{retainCoincidentVertices:true}));
});
test("a water component inside a hole may touch its hole boundary without overlapping land",()=>{
  const geometry:SourceGeometry={type:"MultiPolygon",coordinates:[[[[0,0],[8,0],[8,8],[0,8],[0,0]],[[2,2],[6,2],[6,6],[2,6],[2,2]]],[[[2,2],[3,3],[2.5,3],[2,2]]]]};validateSourceGeometry(geometry,reference);assert.throws(()=>validateSourceGeometry({type:"MultiPolygon",coordinates:[geometry.coordinates[0],[[[1,1],[4,1],[4,4],[1,1]]]]},reference),/overlap|cross/);
});
test("tiny source triangles at distant coordinates retain real nonzero area",()=>{validateSourceGeometry({type:"Polygon",coordinates:[[[130,-68],[130.000001,-68],[130,-67.999999],[130,-68]]]},reference);});
test("nine independent themes retain original semantic fallbacks",()=>{assert.equal(new Set(GEOGRAPHIC_THEMES.map(t=>t.id)).size,9);assert.equal(shapeTheme({semantic:"physical-geography"}),"land");assert.equal(shapeTheme({semantic:"administrative-boundary"}),"administrative");assert.equal(shapeTheme({semantic:"authored-geography",theme:"rivers"}),"rivers");});
test("source label locations project original angular and planar points without mirroring",()=>{
  const point:SourceGeometry={type:"Point",coordinates:[90,30]},before=JSON.stringify(point),label=projectedSourceLabel(point,reference,[-180,-90,180,90],"equirectangular")!;assert.ok(label.x>500&&label.y<300);assert.equal(JSON.stringify(point),before);const plane:SpatialReference={version:1,kind:"plane",crs:"AUTHORED:test",units:"leagues",bounds:[0,0,100,100]},p=projectedSourceLabel({type:"Point",coordinates:[70,80]},plane,plane.bounds,"planar")!;assert.ok(p.x>500&&p.y<300);assert.equal(projectedSourceLabel(point,reference,[-10,-10,10,10],"equirectangular"),undefined);
});
const shape=(i:number,x:number,y:number):GeographicShape=>({id:String(i),geographyId:String(i),name:`City ${i}`,versionId:String(i),revision:1,part:0,semantic:"physical-geography",geometryType:"Point",path:"",sourceBounds:[0,0,1,1],theme:"cities",label:{x,y,rank:i}});
test("labels are collision bounded, ranked, deduplicated and readable on a phone",()=>{
  const shapes=Array.from({length:80},(_,i)=>shape(i,20+(i%10)*90,50+Math.floor(i/10)*65)),desktop=layoutGeographicLabels(shapes),phone=layoutGeographicLabels(shapes,390);assert.ok(desktop.length>8&&desktop.length<=25);assert.ok(phone.length>0&&phone.length<=8);assert.ok(phone.every(l=>l.fontSize*390/1000>=12));const adjacent=layoutGeographicLabels([shape(1,200,200),shape(2,200,200)]);assert.equal(adjacent.length,2);assert.ok(adjacent[0].x>200&&adjacent[1].x<200);assert.equal(layoutGeographicLabels([shape(1,200,200),{...shape(1,700,500),part:1}]).length,1);assert.deepEqual(layoutGeographicLabels(shapes),desktop);
});
test("physical source manifest pins every archive, edition and complete worldwide row inventory",async()=>{
  const {readFile}=await import("node:fs/promises"),manifest=JSON.parse(await readFile("data/geography/natural-earth-physical-sources.json","utf8"));assert.equal(manifest.sources.length,7);assert.equal(manifest.sources.reduce((n:number,s:{expectedFeatures:number})=>n+s.expectedFeatures,0),12469);assert.equal(manifest.sources.reduce((n:number,s:{expectedCoordinates:number})=>n+s.expectedCoordinates,0),679721);assert.equal(manifest.license,"Public domain");for(const s of manifest.sources){assert.match(s.zipSha256,/^[a-f0-9]{64}$/);assert.match(s.edition,/^5\./);assert.ok(s.zipBytes>0);}
});
test("source classifications use existing place contexts rather than game mechanics",()=>{assert.ok(sourceImportSchema.shape.records.element.shape.context.safeParse("settlement").success);assert.equal(sourceImportSchema.shape.records.element.shape.context.safeParse("town").success,false);});
test("multipart region labels choose their largest projected component rather than a remote islet",()=>{const small={...shape(1,20,200),name:"ASIA",theme:"landscapes" as const,label:{x:20,y:200,rank:0,weight:1}},main={...small,part:1,label:{x:700,y:200,rank:0,weight:1000}},labels=layoutGeographicLabels([small,main]);assert.equal(labels.length,1);assert.ok(labels[0].x>600);});
