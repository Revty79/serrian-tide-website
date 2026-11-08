import test from "node:test";
import assert from "node:assert/strict";
import {appendManualWaterway} from "./terrain-water-manual";
import {EMPTY_HYDROLOGY,hydroLayerSchema} from "./terrain-hydrology";
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
