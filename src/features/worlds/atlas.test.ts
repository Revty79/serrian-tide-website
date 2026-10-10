import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { acceptSavedHistory, commitAction, fitViewport, geometrySchema, mapDraftSchema, moveGeometry, redoAction, undoAction, validateGeometry, validateMapDraft, validateParents, zoomViewport, type Geometry, type MapDraft } from "./atlas";
const polygon=(pairs:number[][]):Geometry=>({version:1,type:"polygon",points:pairs.map(([x,y])=>({id:randomUUID(),x,y}))});
const outline=()=>polygon([[100,100],[400,100],[400,400],[100,400]]);
test("Atlas geometry refuses empty, degenerate, crossing, overlapping and excessive outlines",()=>{
  assert.equal(geometrySchema.safeParse({version:1,type:"polygon",points:[]}).success,false);
  for(const points of [[[0,0],[1,1],[2,2]],[[0,0],[100,100],[0,100],[100,0]],[[0,0],[100,0],[50,0],[50,100]],[[0,0],[100,0],[100,100],[0,0]],[[0,0],[100,0],[100,100],[50,0],[0,100]]])assert.throws(()=>validateGeometry(polygon(points)));
  assert.throws(()=>validateGeometry(polygon([[0,0],[1,0],[0,.01]])),/visible area/);
  assert.throws(()=>validateGeometry(polygon([[0,0],[2001,0],[50,100]])),/inside/);
  assert.throws(()=>validateGeometry({version:1,type:"point",point:{x:NaN,y:0}}));
  assert.throws(()=>validateGeometry({version:1,type:"point",point:{x:1.001,y:0}}),/decimal/);
  assert.equal(geometrySchema.safeParse(polygon(Array.from({length:257},(_,i)=>[i,i]))).success,false);
  validateGeometry(outline());validateGeometry({version:1,type:"point",point:{x:2000,y:1200}});
});
test("moving geometry preserves feature point identities and clamps translation as a whole",()=>{
  const original=outline(),moved=moveGeometry(original,1800,-500);assert.equal(moved.type,"polygon");assert.equal(original.type,"polygon");if(moved.type!=="polygon"||original.type!=="polygon")return;
  assert.deepEqual(moved.points.map(p=>p.id),original.points.map(p=>p.id));assert.equal(moved.points[0].x,1700);assert.equal(moved.points[0].y,0);assert.equal(moved.points[1].x-moved.points[0].x,300);validateGeometry(moved);
});
test("undo redo retains stable map and geography identities through editing and archive",()=>{
  const id=randomUUID(),geographyId=randomUUID(),draft:MapDraft={name:"Chart",description:"",scope:"world",features:[],geographies:[]};let history={past:[] as MapDraft[],present:draft,future:[] as MapDraft[]};
  const added={...draft,features:[{id,geographyId,geometry:outline(),archived:false}],geographies:[{id:geographyId,revision:null,name:"Valdoria",description:"",kind:"continent" as const,parentId:null}]};history=commitAction(history,added);const moved={...added,features:added.features.map(f=>({...f,geometry:moveGeometry(f.geometry,10,20)}))};history=commitAction(history,moved);history=undoAction(history);assert.deepEqual(history.present,added);history=redoAction(history);assert.deepEqual(history.present,moved);history=commitAction(history,{...moved,features:moved.features.map(f=>({...f,archived:true}))});history=undoAction(history);assert.equal(history.present.features[0].id,id);assert.equal(history.present.features[0].geographyId,geographyId);assert.equal(history.present.features[0].archived,false);assert.equal(history.future.length,1);
  history=commitAction(history,{...history.present,name:"Changed chart"});assert.equal(history.future.length,0);
});
test("viewport zoom changes view without changing logical map coordinates",()=>{
  const fit=fitViewport(),zoom=zoomViewport(fit,2);assert.deepEqual(zoom,{x:500,y:300,width:1000,height:600});assert.deepEqual(zoomViewport(zoom,.5),fit);assert.equal(zoomViewport(fit,100).width,250);assert.equal(zoomViewport(fit,.001).width,8000);
});
test("undoing a saved creation retains an archived feature and geography, then redo restores them",()=>{
  const empty:MapDraft={name:"Chart",description:"",scope:"world",features:[],geographies:[]},id=randomUUID(),geographyId=randomUUID();
  const created:MapDraft={...empty,features:[{id,geographyId,geometry:outline(),archived:false}],geographies:[{id:geographyId,revision:null,name:"Valdoria",description:"",kind:"continent",parentId:null}]};
  let history=commitAction({past:[],present:empty,future:[]},created);const saved={...created,geographies:created.geographies.map(g=>({...g,revision:1}))};history=acceptSavedHistory(history,saved);history=undoAction(history);assert.equal(history.present.features[0].id,id);assert.equal(history.present.features[0].archived,true);assert.equal(history.present.geographies[0].id,geographyId);assert.equal(history.present.geographies[0].revision,1);validateMapDraft(history.present);
  history=acceptSavedHistory(history,history.present);history=redoAction(history);assert.equal(history.present.features[0].id,id);assert.equal(history.present.features[0].archived,false);assert.equal(history.present.features[0].geographyId,geographyId);validateMapDraft(history.present);
});
test("World geography parents reject cycles and unavailable identities",()=>{
  validateParents([{id:"a",parentId:null},{id:"b",parentId:"a"},{id:"c",parentId:"b"}]);assert.throws(()=>validateParents([{id:"a",parentId:"b"},{id:"b",parentId:"a"}]),/contain itself/);assert.throws(()=>validateParents([{id:"a",parentId:"foreign"}]),/this World/);
});
test("strict map drafts reject duplicate identities and unsupported generated representations",()=>{
  const f={id:randomUUID(),geographyId:randomUUID(),geometry:outline(),archived:false},draft:MapDraft={name:"Chart",description:"",scope:"world",features:[f,f],geographies:[]};assert.throws(()=>validateMapDraft(draft),/repeated/);assert.equal(mapDraftSchema.safeParse({...draft,image:"flattened.png"}).success,false);assert.equal(geometrySchema.safeParse({version:1,type:"raster",url:"http://invalid"}).success,false);
});
