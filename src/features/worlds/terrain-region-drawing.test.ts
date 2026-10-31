import test from "node:test";
import assert from "node:assert/strict";
import {regionVertexAt} from "./terrain-region-drawing";
test("boundary handles select the nearest vertex in any disconnected part",()=>{
 const parts=[{closed:true,points:[{x:10,y:10},{x:30,y:10},{x:30,y:30}]},{closed:true,points:[{x:70,y:70},{x:90,y:70},{x:90,y:90}]}];
 assert.deepEqual(regionVertexAt(parts,{x:150,y:147},{x:10,y:5,scale:2},{width:100,wrap:false}),{part:1,vertex:0});
 assert.equal(regionVertexAt(parts,{x:110,y:100},{x:10,y:5,scale:2},{width:100,wrap:false}),undefined);
});
test("wrapped handles use the same shortest-edge unwrapping as the visible outline",()=>{
 const parts=[{closed:true,points:[{x:990,y:20},{x:10,y:20},{x:10,y:40}]}];
 assert.deepEqual(regionVertexAt(parts,{x:110,y:30},{x:-900,y:10,scale:1},{width:1000,wrap:true}),{part:0,vertex:1});
 assert.deepEqual(regionVertexAt(parts,{x:10,y:30},{x:0,y:10,scale:1},{width:1000,wrap:true}),{part:0,vertex:1});
});
test("handle hit radius stays in CSS pixels on extreme fractional World coordinates",()=>{
 const point={x:499999999.125,y:600000000.25},view={x:-point.x*.01+80,y:-point.y*.01+90,scale:.01},parts=[{closed:false,points:[point]}];
 assert.deepEqual(regionVertexAt(parts,{x:91,y:90},view,{width:1e9,wrap:false}),{part:0,vertex:0});
 assert.equal(regionVertexAt(parts,{x:93,y:90},view,{width:1e9,wrap:false}),undefined);
 assert.equal(regionVertexAt(parts,{x:80,y:90},{...view,scale:0},{width:1e9,wrap:false}),undefined);
 assert.deepEqual(parts[0].points[0],point);
});
