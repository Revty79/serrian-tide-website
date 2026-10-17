import assert from "node:assert/strict";
import {test} from "node:test";
import {hitAtlasDrawing,inverseArtworkPoint,drawingSelectionBounds} from "./atlas-drawing-hit";
import {assetReference,latestIslandAssets} from "./island-assets";
import {assetTerrainMarks} from "./island-asset-scene";
import {atlasGeographicFrame} from "./atlas-geographic-frame";
import {defaultPresentation,type MapDrawing,type TerrainDrawing} from "./cartography";
import type {MapDraft} from "./atlas";
const asset=latestIslandAssets.find(a=>a.id==="mountain-rounded")!;
const symbol=(id:string):MapDrawing=>({version:2,type:"symbol",id,name:id,archived:false,geographyId:null,kind:"mountain",style:"colored",role:"decoration",assetRef:assetReference(asset),point:{x:1000,y:600},scale:.6,rotation:90});
const draft=(drawings:MapDrawing[]):MapDraft=>({name:"Hit regression",description:"",scope:"regional",features:[],geographies:[],drawings,presentation:defaultPresentation()});
test("inverse artwork transform resolves outer painted ink across scale, rotation and projection",()=>{
 const original=symbol("outer"),d=draft([original]),before=structuredClone(d),local={x:14,y:-209},frame=atlasGeographicFrame({version:1,kind:"plane",crs:"AUTHORED:test",units:"leagues",bounds:[0,0,2000,1200]},[400,200,1600,1000],"planar");assert.equal(original.type,"symbol");if(original.type!=="symbol"||original.version!==2)return;
 const anchor=frame.project(original.point),scale=original.scale*frame.scaleAt(original.point),point={x:anchor.x-local.y*scale,y:anchor.y+local.x*scale};
 const result=hitAtlasDrawing(d,point,{frame,units:1,tolerance:4,artworkHit:(pin,p)=>{assert.deepEqual(pin,original.assetRef);assert.ok(Math.abs(p.x-local.x)<1e-8&&Math.abs(p.y-local.y)<1e-8);return true;}});
 assert.equal(result?.id,"outer");assert.deepEqual(d,before);assert.equal(inverseArtworkPoint(point,anchor,0,90),null);
 const bounds=drawingSelectionBounds(original,frame,1)!;assert.ok(point.x>=bounds.x&&point.x<=bounds.x+bounds.width&&point.y>=bounds.y&&point.y<=bounds.y+bounds.height);
});
test("topmost visible unlocked drawing wins; transparent ink falls through and clipped terrain cannot select",()=>{
 const lower=symbol("lower"),upper=symbol("upper"),d=draft([lower,upper]);const options={units:1,tolerance:4,artworkHit:()=>true};assert.equal(hitAtlasDrawing(d,{x:1000,y:600},options)?.id,"upper");
 upper.archived=true;assert.equal(hitAtlasDrawing(d,{x:1000,y:600},options)?.id,"lower");upper.archived=false;
 assert.equal(hitAtlasDrawing(d,{x:1000,y:600},{...options,artworkHit:()=>false}),null);
 d.presentation!.layers.terrain.locked=true;assert.equal(hitAtlasDrawing(d,{x:1000,y:600},options),null);d.presentation!.layers.terrain.locked=false;d.presentation!.layers.terrain.visible=false;assert.equal(hitAtlasDrawing(d,{x:1000,y:600},options),null);
 d.presentation!.layers.terrain.visible=true;assert.equal(hitAtlasDrawing(d,{x:1000,y:600},{...options,visibleTerrain:()=>false}),null);assert.equal(hitAtlasDrawing(d,{x:-1,y:600},options),null);
});
test("a scattered mark returns its persistent stroke group and retains deterministic source/pins",()=>{
 const stroke:Extract<TerrainDrawing,{version:2}>={version:2,type:"terrain",id:"group",name:"Mountain group",kind:"mountains",archived:false,geographyId:null,points:[{id:"point",x:600,y:600}],radius:70,spacing:60,density:1,seed:425,assetRefs:[assetReference(asset)]},d=draft([stroke]),before=structuredClone(d),mark=assetTerrainMarks(stroke)[0];
 assert.equal(hitAtlasDrawing(d,mark,{units:1,tolerance:4,artworkHit:()=>true})?.id,"group");assert.deepEqual(d,before);
});
test("actual stamp ink wins over an adjacent label's minimum touch padding",()=>{const stamp=symbol("ink"),label:MapDrawing={version:1,type:"label",id:"nearby-label",name:"Nearby",text:"Nearby",archived:false,geographyId:null,point:{x:1000,y:620},size:12,rotation:0,style:"place"};assert.equal(hitAtlasDrawing(draft([stamp,label]),{x:1000,y:600},{units:1,tolerance:22,artworkHit:()=>true})?.id,"ink");});
