import assert from "node:assert/strict";
import test from "node:test";
import {townWheelCamera} from "./town-map-viewport";

const frame={width:1500,height:1000},size={w:960,h:600},camera={x:750,y:500,z:2},cursor={x:713,y:187};
const geographic=(c:typeof camera)=>{const scale=Math.min((size.w-32)/frame.width,(size.h-32)/frame.height)*c.z;return {x:c.x+(cursor.x-size.w/2)/scale,y:c.y+(cursor.y-size.h/2)/scale};};
test("wheel zoom preserves the geographic position under an off-center cursor through mixed input",()=>{
 let c=camera;const anchor=geographic(c);
 for(const delta of [-120,-.5,-2,3,120,1000,-1000]){const next=townWheelCamera(c,size,frame,cursor,delta,0),q=geographic(next);assert.ok(Math.abs(q.x-anchor.x)<1e-9);assert.ok(Math.abs(q.y-anchor.y)<1e-9);assert.ok(Math.max(c.z/next.z,next.z/c.z)<1.285);c=next;}
});
test("high-resolution packets accumulate by distance and normalize line/page modes",()=>{
 let fine=camera;for(let i=0;i<32;i++)fine=townWheelCamera(fine,size,frame,cursor,-.5,0);
 const coarse=townWheelCamera(camera,size,frame,cursor,-16,0),line=townWheelCamera(camera,size,frame,cursor,-1,1),page=townWheelCamera(camera,size,frame,cursor,-16/size.h,2);
 for(const other of [fine,line,page]){assert.ok(Math.abs(other.z-coarse.z)<1e-12);assert.ok(Math.abs(other.x-coarse.x)<1e-9);assert.ok(Math.abs(other.y-coarse.y)<1e-9);}
 assert.ok(townWheelCamera(camera,size,frame,cursor,-.5,0).z/camera.z<1.001);
});
test("zoom limits and zero input retain the exact camera without accumulating drift",()=>{
 const min={...camera,z:.5},max={...camera,z:50};
 assert.equal(townWheelCamera(min,size,frame,cursor,120,0),min);assert.equal(townWheelCamera(max,size,frame,cursor,-120,0),max);
 assert.equal(townWheelCamera(camera,size,frame,cursor,0,0),camera);assert.equal(townWheelCamera(camera,size,frame,cursor,NaN,0),camera);
 assert.ok(townWheelCamera(min,size,frame,cursor,-1,0).z>.5);assert.ok(townWheelCamera(max,size,frame,cursor,1,0).z<50);
});
