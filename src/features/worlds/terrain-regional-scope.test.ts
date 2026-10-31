import test from "node:test";
import assert from "node:assert/strict";
import {mergeRegionalRecords,requireRegionalArtwork,requireRegionalFrame,requireRegionalPath,requireRegionalPathChange,type RegionalScope} from "./terrain-regional-scope";
import {regionalMaterials,regionalEnvironment,regionalArtwork,regionalLabels,regionalHydrology} from "./terrain-regional-layers";
import {EMPTY_HYDROLOGY,hydroLayerSchema,moveHydroPoint} from "./terrain-hydrology";
import {EMPTY_TERRAIN_MATERIALS} from "./terrain-materials";
import {EMPTY_ENVIRONMENT} from "./terrain-environment";
import {EMPTY_ARTWORK} from "./terrain-artwork";
import {EMPTY_LABELS,newMapLabel} from "./terrain-labels";
const scope:RegionalScope={frame:{x:100,y:100,width:200,height:200},world:{width:1000,height:1000,wrap:false}};
const id="00000000-0000-4000-8000-000000000001";
test("regional brush security includes complete segments, end caps and prior geometry",()=>{
 requireRegionalPath([{x:150,y:150},{x:250,y:250}],50,scope);
 assert.throws(()=>requireRegionalPath([{x:105,y:150}],10,scope),/beyond/);
 assert.throws(()=>requireRegionalPath([{x:150,y:295}],10,scope),/beyond/);
 const stroke={id,material:"rock" as const,radiusM:10,strength:1,points:[{x:150,y:150}]};
 const next=regionalMaterials(EMPTY_TERRAIN_MATERIALS,{...EMPTY_TERRAIN_MATERIALS,strokes:[stroke]},scope);assert.deepEqual(next.strokes,[stroke]);
 assert.throws(()=>regionalMaterials({...next,strokes:[{...stroke,points:[{x:50,y:50}]}]},next,scope),/beyond/);
 assert.throws(()=>regionalMaterials({...next,locked:true},{...next,locked:true,strokes:[]},scope),/locked/);
 assert.throws(()=>regionalMaterials(next,{...next,automatic:false},scope),/World-wide/);
});
test("wrapped paths retain canonical coordinates and reject a shortest segment outside a wide region",()=>{
 const wrapped={frame:{x:900,y:100,width:200,height:200},world:{width:1000,height:1000,wrap:true}};
 requireRegionalPath([{x:980,y:150},{x:20,y:150}],20,wrapped);
 requireRegionalFrame({x:950,y:130,width:80,height:40},wrapped);
 assert.throws(()=>requireRegionalPath([{x:920,y:150},{x:80,y:150}],30,wrapped),/beyond/);
 assert.throws(()=>requireRegionalPath([{x:100,y:150},{x:800,y:150}],0,{...wrapped,frame:{x:100,y:100,width:700,height:200}}),/beyond/);
});
test("crossing river adjustment preserves exact outside prefixes and suffixes",()=>{
 const before=[{x:50,y:150},{x:140,y:150},{x:180,y:150},{x:240,y:150},{x:350,y:150}];
 requireRegionalPathChange(before,before.map((p,i)=>i===2?{...p,y:180}:p),scope,"River");
 assert.throws(()=>requireRegionalPathChange(before,before.map((p,i)=>i===1?{...p,y:180}:p),scope,"River"),/beyond/);
 assert.throws(()=>requireRegionalPathChange(before,before.slice(1),scope,"River"),/beyond/);
});
test("the native crossing-river editor retains network identities while marking a bounded derived adjustment manual",()=>{
 const points=[{x:50,y:150},{x:140,y:150},{x:180,y:150},{x:240,y:150},{x:350,y:150}],before=hydroLayerSchema.parse({...EMPTY_HYDROLOGY,nodes:[{id:"source",point:points[0],kind:"source",elevationM:null,drainageM2:0,spillM:null},{id:"outlet",point:points.at(-1),kind:"open-end",elevationM:null,drainageM2:0,spillM:null}],edges:[{id:"river",from:"source",to:"outlet",name:"Crossing river",points,drainageM2:0,flowKind:"manual",exceptionReason:"",protected:false,analysisId:null}]});
 assert.throws(()=>regionalHydrology(before,{...before,edges:[{...before.edges[0],protected:true}]},scope),/beyond/,"Bookkeeping alone cannot modify a crossing or outside course");
 const moved=moveHydroPoint(before,"river",2,{x:180,y:180}),accepted=regionalHydrology(before,moved,scope);assert.deepEqual(accepted.nodes,before.nodes);assert.deepEqual(accepted.edges,moved.edges);assert.equal(accepted.edges[0].protected,true);
 assert.throws(()=>regionalHydrology(before,{...moved,edges:[{...moved.edges[0],name:"Wider rename"}]},scope),/beyond/);
});
test("rotated artwork uses its complete physical rectangle",()=>{
 requireRegionalArtwork({x:200,y:200,widthM:100,rotation:45},scope);
 assert.throws(()=>requireRegionalArtwork({x:150,y:200,widthM:120,rotation:45},scope),/beyond/);
 assert.throws(()=>regionalArtwork(EMPTY_ARTWORK,{...EMPTY_ARTWORK,theme:"antique"},scope),/World-wide/);
});
test("outside records cannot be omitted, mutated or moved into the region",()=>{
 const outside={id:"outside",x:50,y:50},inside={id:"inside",x:200,y:200};
 const validate=(point:typeof inside,old:typeof inside|undefined)=>{requireRegionalPath([point],0,scope);if(old)requireRegionalPath([old],0,scope);};
 const result=mergeRegionalRecords([outside,inside],[outside,{...inside,x:220}],validate);assert.equal(result[0],outside);
 assert.throws(()=>mergeRegionalRecords([outside,inside],[inside],validate),/beyond/);
 assert.throws(()=>mergeRegionalRecords([outside],[{...outside,x:200,y:200}],validate),/beyond/);
});
test("environment edits cannot alter global climate or erase outside protected authoring",()=>{
 assert.throws(()=>regionalEnvironment(EMPTY_ENVIRONMENT,{...EMPTY_ENVIRONMENT,settings:{...EMPTY_ENVIRONMENT.settings,moisture:.1}},scope),/World-wide/);
 const region={id,name:"Protected forest",kind:"vegetation" as const,shape:"brush" as const,points:[{x:50,y:50}],radiusM:10,strength:1,biome:"conifer" as const,vegetation:"conifer" as const,density:.8,scaleM:20,clustering:.5,protected:true};
 assert.throws(()=>regionalEnvironment({...EMPTY_ENVIRONMENT,regions:[region]},EMPTY_ENVIRONMENT,scope),/beyond/);
});
test("geographic labels merge without copying regional composition into the parent",()=>{
 const label=newMapLabel(id,"Forest",{x:200,y:200});
 const next=regionalLabels(EMPTY_LABELS,{...EMPTY_LABELS,labels:[label],composition:{...EMPTY_LABELS.composition,title:{...EMPTY_LABELS.composition.title,text:"Regional title"}}},scope);
 assert.deepEqual(next.labels,[label]);assert.deepEqual(next.composition,EMPTY_LABELS.composition);
 assert.throws(()=>regionalLabels({...EMPTY_LABELS,labels:[{...label,anchor:{x:50,y:50}}]},EMPTY_LABELS,scope),/beyond/);
});
