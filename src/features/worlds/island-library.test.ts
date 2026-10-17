import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID,createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {assetReference,defaultPaintReferences,islandAsset,latestIslandAssets,type IslandAsset} from "./island-assets";
import {drawingLayer,validateDrawings,type MapDrawing} from "./cartography";
import {draftWithDrawing} from "./island-placement";
import {assetTerrainMarks} from "./island-asset-scene";
import {inspectorFields} from "./cartography-controls";
import {commitAction,undoAction,redoAction,type EditingHistory,type MapDraft} from "./atlas";

const draft=():MapDraft=>({name:"Bounded library",description:"",scope:"regional",features:[],geographies:[],drawings:[]});
const symbol=(asset:IslandAsset):Extract<MapDrawing,{type:"symbol";version:2}>=>({version:2,type:"symbol",id:randomUUID(),name:asset.name,archived:false,geographyId:null,kind:asset.legacySymbolKind,role:asset.role,point:{x:1000,y:700},scale:asset.defaultScale,rotation:0,style:"colored",assetRef:assetReference(asset)});
const options={historical:false,placeName:"Test settlement",autoLabel:true};

test("bounded palette has the agreed family coverage and preserves every initial source pin",async()=>{
 assert.equal(latestIslandAssets.length,14);
 assert.deepEqual(Object.fromEntries(["Mountains","Hills","Woodland","Settlements","Wetland"].map(f=>[f,latestIslandAssets.filter(a=>a.family===f).length])),{Mountains:3,Hills:2,Woodland:4,Settlements:4,Wetland:1});
 const old={"mountain-rounded":"b35dc7f986aeae7370aa73bcdfd5c3103cb24332602ca537acc07a5002825d2f","woodland-broadleaf-grove":"b77079ded0f016187637172d5091237f0c30d5339c00e52a77d057a927d6ea4f","settlement-city":"ff9d52bbf121c9ba3c124979347637b81b9fe3e78f8c41169a62c64b25ce7701"};
 for(const [id,sha] of Object.entries(old)){const asset=islandAsset({libraryId:"serrian-atlas-island",libraryRevision:1,assetId:id,assetRevision:1}),source=(await readFile(`public/cartography/${asset.libraryId}/1/${asset.file}`,"utf8")).replaceAll("\r\n","\n");assert.equal(asset.sourceSha256,sha);assert.equal(createHash("sha256").update(source).digest("hex"),sha);}
});

test("hills and wetlands validate their declared compatibility slot without creating a place",()=>{
 for(const asset of latestIslandAssets.filter(a=>a.kind==="hill"||a.kind==="wetland")){
  const source=symbol(asset),current=draft(),before=structuredClone(current),next=draftWithDrawing(current,source,[],options);
  assert.deepEqual(current,before);assert.equal(next.geographies.length,0);assert.equal(next.drawings!.length,1);assert.equal(drawingLayer(source),"terrain");assert.equal(source.geographyId,null);
  for(const bad of [{...source,kind:asset.legacySymbolKind==="pine"?"mountain":"pine"},{...source,role:"place"},{...source,geographyId:randomUUID()}])assert.throws(()=>validateDrawings([bad as MapDrawing]));
  assert.throws(()=>validateDrawings([{...source,assetRef:{...source.assetRef,assetRevision:999}}]),/unavailable/);
 }
});

test("every place marker creates exactly one location and linked label while decorations remain unassociated",()=>{
 for(const asset of latestIslandAssets){const next=draftWithDrawing(draft(),symbol(asset),[],options);assert.equal(next.geographies.length,asset.role==="place"?1:0);assert.equal(next.drawings!.length,asset.role==="place"?2:1);if(asset.role==="place")assert.equal(next.drawings![0].geographyId,next.drawings![1].geographyId);}
});

test("approved mixed grove strokes retain explicit ordered revisions and deterministic full source through undo",()=>{
 const grove=latestIslandAssets.find(a=>a.id==="woodland-broadleaf-grove")!,refs=defaultPaintReferences(grove);assert.deepEqual(refs.map(r=>r.assetRevision),[4,3]);
 const drawing:Extract<MapDrawing,{type:"terrain";version:2}>={version:2,type:"terrain",id:randomUUID(),name:"Open broadleaf woods",archived:false,geographyId:null,kind:"forest",points:[{id:randomUUID(),x:400,y:500},{id:randomUUID(),x:1200,y:600}],radius:40,spacing:75,density:1,seed:923,assetRefs:refs};
 validateDrawings([drawing]);const marks=assetTerrainMarks(drawing);assert.deepEqual(marks,assetTerrainMarks(structuredClone(drawing)));assert.deepEqual(new Set(marks.map(m=>m.reference.assetRevision)),new Set([3,4]));
 const fields=new FormData();for(const key of ["name","radius","spacing","density","seed"] as const)fields.set(key,String(drawing[key]));
 // Checkboxes submit in catalog order; renaming/restyling must retain the saved scatter order.
 for(const ref of [...refs].reverse())fields.append("assetRefs",JSON.stringify(ref));fields.set("name","Renamed without redistributing the woodland");
 const renamed=inspectorFields(drawing,fields) as typeof drawing;assert.deepEqual(renamed.assetRefs,refs);assert.deepEqual(assetTerrainMarks(renamed),marks);
 const start:EditingHistory={present:draft(),past:[],future:[]},added=commitAction(start,{...draft(),drawings:[drawing]}),changed=commitAction(added,{...added.present,drawings:[{...drawing,archived:true}]});assert.deepEqual(undoAction(changed).present,added.present);assert.deepEqual(redoAction(undoAction(changed)).present,changed.present);assert.deepEqual(drawing.assetRefs,refs);
});
