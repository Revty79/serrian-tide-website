import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { draftWithDrawing, renameIllustratedPlace } from "./island-placement";
import { assetReference, islandAssets } from "./island-assets";
import { defaultPresentation, drawingLayer, type MapDrawing } from "./cartography";
import type { GeographyRecord, MapDraft } from "./atlas";

const city=islandAssets.find(a=>a.id==="settlement-city")!,mountain=islandAssets.find(a=>a.id==="mountain-rounded")!;
const draft=():MapDraft=>({name:"Test",description:"",scope:"regional",features:[],geographies:[],drawings:[],presentation:defaultPresentation()});
const symbol=():MapDrawing=>({version:2,type:"symbol",id:randomUUID(),name:"City",archived:false,geographyId:null,kind:"city",role:"place",point:{x:1000,y:1100},scale:.7,rotation:0,style:"colored",assetRef:assetReference(city)});
const options={historical:false,placeName:"Harbor city",autoLabel:true};

test("city and its default label are one validated draft action with one persistent settlement identity",()=>{
  const original=draft(),before=structuredClone(original),source=symbol(),next=draftWithDrawing(original,source,[],options);
  assert.deepEqual(original,before);assert.equal(next.geographies.length,1);assert.equal(next.drawings!.length,2);
  const place=next.geographies[0];assert.equal(place.name,"Harbor city");assert.equal(place.context,"settlement");
  assert.equal(next.drawings![0].id,source.id);assert.equal(next.drawings![0].geographyId,place.id);assert.equal(next.drawings![1].geographyId,place.id);
  assert.equal(next.drawings![1].type,"label");
});

test("automatic city labels receive an inset near the map edge without moving the city",()=>{const source=symbol();if(source.type!=="symbol")throw Error("Symbol expected");source.point={x:100,y:100};const next=draftWithDrawing(draft(),source,[],{...options,placeName:"Offshore city"});const city=next.drawings![0],label=next.drawings![1];assert.equal(city.type==="symbol"?city.point.x:null,100);assert.ok(label.type==="label"&&label.point.x>100);});

test("reusing a city keeps its place and existing active label rather than creating duplicates",()=>{
  const first=draftWithDrawing(draft(),symbol(),[],options),source=symbol();source.geographyId=first.geographies[0].id;
  const next=draftWithDrawing(first,source,[],{...options,placeName:"Ignored creation name"});
  assert.equal(next.geographies.length,1);assert.equal(next.drawings!.length,3);assert.equal(next.drawings!.filter(d=>d.type==="label").length,1);
  assert.equal(next.geographies[0].name,"Harbor city");
});

test("default city label follows rename with stable identities while custom wording remains authored",()=>{
  const first=draftWithDrawing(draft(),symbol(),[],options),id=first.geographies[0].id,renamed=renameIllustratedPlace(first,id,"Westhaven"),label=renamed.drawings!.find(d=>d.type==="label")!;
  assert.equal(renamed.geographies[0].id,id);assert.equal(label.id,first.drawings![1].id);assert.equal(label.type==="label"?label.text:null,"Westhaven");
  const custom={...first,drawings:first.drawings!.map(d=>d.type==="label"?{...d,text:"The western port"}:d)};
  assert.equal(renameIllustratedPlace(custom,id,"Westhaven").drawings!.find(d=>d.type==="label")!.type,"label");
  assert.ok(renameIllustratedPlace(custom,id,"Westhaven").drawings!.some(d=>d.type==="label"&&d.text==="The western port"));
});

test("failed or historical place creation cannot partially change the live draft",()=>{
  const current=draft(),before=structuredClone(current);assert.throws(()=>draftWithDrawing(current,symbol(),[],{...options,placeName:" "}),/name/);
  assert.throws(()=>draftWithDrawing(current,symbol(),[],{...options,historical:true}),/saved location/);
  const source=symbol();source.geographyId=randomUUID();assert.throws(()=>draftWithDrawing(current,source,[],options),/active place/);assert.deepEqual(current,before);
  const archived={id:source.geographyId,archived:true} as GeographyRecord;assert.throws(()=>draftWithDrawing(current,source,[archived],options),/active place/);
});

test("placed v2 natural illustrations use terrain clipping while v1 symbol semantics remain retained",()=>{
  const natural:MapDrawing={version:2,type:"symbol",id:randomUUID(),name:"Mountain",archived:false,geographyId:null,kind:"mountain",role:"decoration",point:{x:1000,y:600},scale:.7,rotation:0,style:"colored",assetRef:assetReference(mountain)};
  const next=draftWithDrawing(draft(),natural,[],options);assert.equal(next.geographies.length,0);assert.equal(next.drawings!.length,1);assert.equal(drawingLayer(natural),"terrain");
  assert.equal(drawingLayer({version:1,type:"symbol",id:randomUUID(),name:"Legacy mountain",archived:false,geographyId:null,kind:"mountain",point:{x:1000,y:600},scale:1,rotation:0,style:"colored"}),"symbols");
});
