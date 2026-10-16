import assert from "node:assert/strict";
import {test} from "node:test";
import {atlasGeographicFrame,createAtlasDraftProjector,moveGeographicExtent,projectedAtlasDraft,projectionExtent} from "./atlas-geographic-frame";
import {geographicProjection} from "./geographic-projection";
import {surfaceBounds,type GeographicBounds,type SpatialReference} from "./geographic";
import {type MapDraft} from "./atlas";
const sphere:SpatialReference={version:1,kind:"sphere",crs:"EPSG:4326",units:"degrees"};
const plane:SpatialReference={version:1,kind:"plane",crs:"AUTHORED:glass-sea",units:"leagues",bounds:[0,0,2000,1200]};
function near(a:number,b:number){assert.ok(Math.abs(a-b)<1e-7,`${a} differs from ${b}`);}
test("Atlas anchors share the exact vector/raster projector in global, regional, wrapped and planar views",()=>{
 for(const [reference,bounds,kind,coordinate] of [
  [sphere,[-180,-90,180,90],"equirectangular",[86.925,27.9881]],
  [sphere,[-20,-20,50,70],"mercator",[12.123456789,54.987654321]],
  [sphere,[160,-30,-150,40],"equirectangular",[-175.123456789,15.987654321]],
  [plane,[200,100,1500,1000],"planar",[537.123456789,715.987654321]],
 ] as const){
  const b=[...bounds] as GeographicBounds,f=atlasGeographicFrame(reference,b,kind),a=f.atlas([...coordinate]),p=f.project(a),expected=geographicProjection(reference,b,kind)([...coordinate]);assert.ok(expected);near(p.x,expected[0]*2);near(p.y,reference.kind==="plane"?1200-expected[1]*2:expected[1]*2);const back=f.invert(p);assert.ok(back);near(back.x,a.x);near(back.y,a.y);near(f.source(back)[0],coordinate[0]);near(f.source(back)[1],coordinate[1]);
 }
});
test("rectangular spherical display includes both poles and refuses unreferenced outer padding",()=>{
 const f=atlasGeographicFrame(sphere,surfaceBounds(sphere),"equirectangular");
 near(f.project({x:0,y:0}).x,0);near(f.project({x:2000,y:1200}).x,2000);near(f.project({x:1000,y:0}).y,100);near(f.project({x:1000,y:1200}).y,1100);
 assert.equal(f.invert({x:1000,y:0}),null);assert.equal(f.invert({x:1000,y:1200}),null);assert.equal(f.reference.kind,"sphere");
});
test("rendering, nonlinear projections and wrapped clipping retain all authored source positions and identities",()=>{
 const draft={name:"Retained drawing",description:"",scope:"world",geographies:[],features:[{id:"coast",geographyId:"place",archived:false,geometry:{version:1,type:"polygon",points:[{id:"a",x:800,y:300},{id:"b",x:1100,y:300},{id:"c",x:1000,y:800}]}}],drawings:[{version:1,type:"label",id:"label",name:"Original label",text:"Original label",geographyId:null,archived:false,point:{x:1000.12,y:600.34},rotation:15,size:20,style:"place"}]} as unknown as MapDraft,original=structuredClone(draft);
 for(const bounds of [[-180,-85,180,85],[160,-30,-150,40]] as GeographicBounds[]){const frame=atlasGeographicFrame(sphere,bounds,"mercator"),shown=projectedAtlasDraft(draft,frame);assert.equal(shown.features[0].id,"coast");assert.equal(shown.drawings![0].id,"label");assert.doesNotMatch(frame.path(draft.features[0].geometry.type==="polygon"?draft.features[0].geometry.points:[],true),/NaN|Infinity/);assert.deepEqual(draft,original);}
});
test("geographic zoom reaches existing detail, wraps longitude, and stays bounded on planar surfaces",()=>{
 let b=surfaceBounds(sphere);for(let i=0;i<25;i++)b=moveGeographicExtent(sphere,b,0,0,.5);assert.ok((b[2]-b[0])>0);assert.ok((b[2]-b[0])>=360/1_000_000-1e-9);
 const wrapped=moveGeographicExtent(sphere,[160,-20,-160,20],.5,0);assert.ok(wrapped[0]<0&&wrapped[2]<0);
 const bounded=moveGeographicExtent(plane,[0,0,1000,600],-10,10);assert.deepEqual(bounded,[0,600,1000,1200]);
});
test("planar Atlas imports retain direct x/y orientation and wide spherical artwork keeps its original interior",()=>{
 const f=atlasGeographicFrame(plane,surfaceBounds(plane),"planar"),point={x:315.12,y:941.34};assert.deepEqual(f.source(point),[point.x,point.y]);near(f.project(point).x,point.x);near(f.project(point).y,point.y);
 const sphereFrame=atlasGeographicFrame(sphere,surfaceBounds(sphere),"equirectangular"),path=sphereFrame.path([{x:0,y:0},{x:2000,y:0},{x:2000,y:1200},{x:0,y:1200}],true);assert.doesNotMatch(path,/NaN|Infinity/);assert.ok(path.includes("M0.000,100.000L2000.000,100.000"));assert.ok(path.length<1000);
});
test("Mercator changes and polar navigation keep a nonempty compatible viewing region",()=>{
 for(const b of [[-50,86,-40,89],[-50,-89,-40,-86]] as GeographicBounds[]){const extent=projectionExtent(b,"mercator");assert.ok(extent[1]<extent[3]);assert.ok(extent[1]>=-85.05112878&&extent[3]<=85.05112878);const f=atlasGeographicFrame(sphere,extent,"mercator");assert.ok(Number.isFinite(f.project(f.atlas([-45,(extent[1]+extent[3])/2])).y));}
});
test("editing one drawing retains other derivatives only within the same display frame, without changing originals",()=>{
 const frame=atlasGeographicFrame(plane,plane.bounds,"planar"),project=createAtlasDraftProjector(frame),draft:MapDraft={name:"Projected source",description:"",scope:"regional",features:[],geographies:[],drawings:[{version:1,type:"label",id:"label",name:"Label",text:"Original",point:{x:800,y:400},geographyId:null,archived:false,size:20,rotation:0,style:"place"}]},before=structuredClone(draft),first=project(draft),changed={...draft,drawings:[...draft.drawings!,{...draft.drawings![0],id:"second"}]},next=project(changed);
 assert.equal(first.drawings![0],next.drawings![0]);assert.notEqual(next.drawings![0],next.drawings![1]);
 const zoomed=createAtlasDraftProjector(atlasGeographicFrame(plane,[0,0,1000,600],"planar"))(draft);assert.notEqual(zoomed.drawings![0],first.drawings![0]);assert.notDeepEqual(zoomed.drawings,first.drawings);assert.deepEqual(draft,before);
});
