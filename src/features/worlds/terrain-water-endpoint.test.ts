import test from "node:test";
import assert from "node:assert/strict";
import {EMPTY_HYDROLOGY,validateHydroFrame} from "./terrain-hydrology";
import {appendManualLake,appendManualWaterway} from "./terrain-water-manual";
import {connectWaterLake,joinWaterwayAtDownstreamEnd} from "./terrain-water-network";
const world={width:10000,height:8000,wrap:true};
function course(layer:typeof EMPTY_HYDROLOGY,id:string,points:{x:number;y:number}[]){return appendManualWaterway(layer,world,{id,name:id,points,widthM:null,seaOutlet:false});}
test("explicit endpoint joins reuse a coincident source node without a tiny disconnected fragment",()=>{
 const original=course(course(EMPTY_HYDROLOGY,"parent",[{x:500,y:500},{x:900,y:1000}]),"tributary",[{x:100,y:200},{x:500,y:500}]),before=structuredClone(original),joined=joinWaterwayAtDownstreamEnd(original,"tributary","parent",world,"new-junction");
 assert.deepEqual(original,before);assert.equal(joined.edges.length,2);assert.equal(joined.edges.find(e=>e.id==="tributary")!.to,joined.edges.find(e=>e.id==="parent")!.from);assert.equal(joined.nodes.some(n=>n.id==="new-junction"),false);validateHydroFrame(joined,world);
});
test("endpoint joins preserve a lake outlet while splitting its downstream channel",()=>{
 let original=appendManualLake(EMPTY_HYDROLOGY,world,{id:"lake",name:"Synthetic lake",rings:[[{x:100,y:100},{x:900,y:100},{x:900,y:900},{x:100,y:900}]],levelM:100,condition:"standing"});
 original=course(original,"parent",[{x:900,y:1000},{x:900,y:4000}]);original=connectWaterLake(original,"parent","lake",true,world);original=course(original,"tributary",[{x:200,y:1500},{x:850,y:2000}]);const before=structuredClone(original),outlet=original.lakes![0].outletNodeId,joined=joinWaterwayAtDownstreamEnd(original,"tributary","parent",world,"new-junction");
 assert.deepEqual(original,before);assert.equal(joined.lakes![0].outletNodeId,outlet);assert.equal(joined.edges.find(e=>e.id==="parent")!.from,outlet);assert.equal(joined.edges.length,3);assert.deepEqual(joined.edges.find(e=>e.id==="tributary")!.points.at(-1),{x:900,y:2000});validateHydroFrame(joined,world);
 assert.throws(()=>joinWaterwayAtDownstreamEnd(original,"parent","parent",world,"bad"));assert.throws(()=>joinWaterwayAtDownstreamEnd(original,"missing","parent",world,"bad"));
});
