import test from "node:test";
import assert from "node:assert/strict";
import {appendManualLake,appendManualWaterway} from "./terrain-water-manual";
import {EMPTY_HYDROLOGY,hydroLayerSchema} from "./terrain-hydrology";
import {insideWaterRings,nearestWaterShore} from "./terrain-water-geometry";
const world={width:10000,height:8000,wrap:true},input={id:"manual:test",name:" Test course ",points:[{x:100,y:200},{x:300,y:400},{x:500,y:700}],widthM:40,seaOutlet:true};
test("drawn courses retain existing water, create shared endpoints and make no calculated-flow claims",()=>{
 const original=appendManualWaterway(EMPTY_HYDROLOGY,world,input),before=structuredClone(original),next=appendManualWaterway(original,world,{...input,id:"manual:second",seaOutlet:false,widthM:null});
 assert.deepEqual(original,before);assert.deepEqual(next.edges[0],original.edges[0]);assert.deepEqual(next.nodes.slice(0,2),original.nodes);assert.equal(next.edges[1].flowKind,"manual");assert.equal(next.edges[1].analysisId,null);assert.equal(next.edges[1].drainageM2,0);assert.equal(next.analyses.length,0);assert.equal(next.edges[1].protected,true);assert.equal(next.nodes[3].kind,"open-end");assert.deepEqual(next.nodes[2].point,next.edges[1].points[0]);assert.deepEqual(next.nodes[3].point,next.edges[1].points.at(-1));assert.equal(next.edges[0].name,"Test course");assert.equal(hydroLayerSchema.safeParse(next).success,true);
});
test("invalid drawn courses fail without modifying accepted water or silently clipping coordinates",()=>{
 const original=appendManualWaterway(EMPTY_HYDROLOGY,world,input),before=structuredClone(original);
 assert.throws(()=>appendManualWaterway(original,world,input),/identity already exists/);
 for(const points of [input.points.slice(0,1),[input.points[0],input.points[0]],[...input.points,input.points[0]],[{x:10000,y:1},{x:1,y:3}],Array(513).fill({x:2,y:3})])assert.throws(()=>appendManualWaterway(original,world,{...input,id:"manual:new",points}));
 assert.throws(()=>appendManualWaterway(original,world,{...input,id:"manual:new",widthM:0}));assert.deepEqual(original,before);
});
test("a bounded seam-crossing drawn course keeps canonical positions and explicit downstream direction",()=>{
 const points=[{x:9900,y:100},{x:50,y:300},{x:200,y:500}],r=appendManualWaterway(EMPTY_HYDROLOGY,world,{...input,points});assert.deepEqual(r.edges[0].points,points);assert.equal(r.nodes[1].kind,"sea-outlet");
});
const lakeInput={id:"manual:lake",name:" Checked lake ",rings:[[{x:100,y:100},{x:900,y:100},{x:900,y:900},{x:100,y:900}],[{x:300,y:300},{x:400,y:300},{x:400,y:400},{x:300,y:400}]],levelM:183,condition:"standing" as const};
test("manual lake previews preserve existing water, island holes and independent editable geography",()=>{
 const original=appendManualWaterway(EMPTY_HYDROLOGY,world,input),before=structuredClone(original),next=appendManualLake(original,world,lakeInput);
 assert.deepEqual(original,before);assert.deepEqual(next.edges,original.edges);assert.deepEqual(next.nodes,original.nodes);assert.deepEqual(next.lakes![0].rings,lakeInput.rings);assert.equal(next.lakes![0].name,"Checked lake");assert.equal(next.lakes![0].flowKind,"manual");assert.equal(next.lakes![0].analysisId,null);assert.equal(next.lakes![0].mode,"closed");assert.equal(next.lakes![0].protected,true);
});
test("invalid, overlapping, duplicate and out-of-frame lake proposals leave saved geography exact",()=>{
 const original=appendManualLake(EMPTY_HYDROLOGY,world,lakeInput),before=structuredClone(original);
 assert.throws(()=>appendManualLake(original,world,lakeInput));assert.throws(()=>appendManualLake(original,world,{...lakeInput,id:"overlap"}));
 for(const rings of [[],[[{x:1,y:1},{x:2,y:2}]],[[{x:10000,y:1},{x:9999,y:3},{x:9000,y:2}]],[[{x:1,y:1},{x:10,y:10},{x:1,y:10},{x:10,y:1}]], [lakeInput.rings[0],[{x:1100,y:1100},{x:1200,y:1100},{x:1200,y:1200}]]])assert.throws(()=>appendManualLake(EMPTY_HYDROLOGY,world,{...lakeInput,id:"invalid",rings}));
 assert.throws(()=>appendManualLake(original,world,{...lakeInput,id:"invalid",levelM:NaN}));assert.deepEqual(original,before);
});
test("concave and island-centred lakes keep a strict interior seed across the wrapping seam",()=>{
 const cases=[[[{x:100,y:100},{x:900,y:100},{x:900,y:300},{x:300,y:300},{x:300,y:900},{x:100,y:900}]],
  [lakeInput.rings[0],[{x:200,y:200},{x:800,y:200},{x:800,y:800},{x:200,y:800}]],
  [[{x:9800,y:100},{x:300,y:100},{x:300,y:900},{x:9800,y:900}]]];
 for(const rings of cases){const lake=appendManualLake(EMPTY_HYDROLOGY,world,{...lakeInput,rings}).lakes![0];assert.equal(insideWaterRings(lake.seed,lake.rings,world),true);assert.ok(nearestWaterShore(lake.seed,lake.rings,world).distance>0);}
});
test("complex reviewed lake shores remain editable within the bounded preview budget",()=>{
 const ring=Array.from({length:600},(_,i)=>({x:5000+2000*Math.cos(i/600*Math.PI*2),y:4000+2000*Math.sin(i/600*Math.PI*2)})),before=structuredClone(EMPTY_HYDROLOGY),lake=appendManualLake(EMPTY_HYDROLOGY,world,{...lakeInput,rings:[ring]}).lakes![0];
 assert.deepEqual(lake.rings,[ring]);assert.equal(insideWaterRings(lake.seed,lake.rings,world),true);assert.deepEqual(EMPTY_HYDROLOGY,before);
 const excessive=Array.from({length:1025},(_,i)=>({x:5000+2000*Math.cos(i/1025*Math.PI*2),y:4000+2000*Math.sin(i/1025*Math.PI*2)}));assert.throws(()=>appendManualLake(EMPTY_HYDROLOGY,world,{...lakeInput,rings:[excessive]}),/1,024/);
});
