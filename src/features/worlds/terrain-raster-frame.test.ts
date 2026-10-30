import test from "node:test";
import assert from "node:assert/strict";
import {terrainRasterFrame} from "./terrain-raster-frame";
test("neighboring raster tiles own adjoining device pixels at regular and high DPR",()=>{
 for(const dpr of [1,2])for(const scale of [.000001,.127,1,7.844,100]){const view={x:.317,y:-.143,scale};for(let i=-10;i<10;i++){const a=terrainRasterFrame(view,{x:i*53.927,y:0,width:53.927,height:57.519},dpr),b=terrainRasterFrame(view,{x:(i+1)*53.927,y:0,width:53.927,height:57.519},dpr);assert.ok(Math.abs(a.x+a.width-b.x)<1e-8);assert.ok(Number.isInteger(a.x*dpr)&&Number.isInteger(a.width*dpr));}}
});
test("raster coverage rounding is bounded and never changes geographic frames",()=>{
 const frame={x:500000000.125,y:500000123.75,width:19.53125,height:39.0625},original={...frame};for(const dpr of [1,2])for(const scale of [.000001,.5,100]){const view={x:-frame.x*scale+.317,y:-frame.y*scale+.143,scale},q=terrainRasterFrame(view,frame,dpr);assert.ok(Math.abs(q.x-(view.x+frame.x*scale))<=.5/dpr+1e-4);assert.ok(Math.abs(q.y-(view.y+frame.y*scale))<=.5/dpr+1e-4);assert.ok(q.width>=0&&q.height>=0);}assert.deepEqual(frame,original);
});
test("wrapped and coarse fallback coverage shares the same snapped clip boundaries",()=>{
 for(const offset of [-1e9,0,1e9])for(const dpr of [1,2]){const view={x:-offset*.003+.37,y:.13,scale:.003},coarse=terrainRasterFrame(view,{x:offset,y:0,width:100000,height:100000},dpr),left=terrainRasterFrame(view,{x:offset,y:0,width:50000,height:100000},dpr),right=terrainRasterFrame(view,{x:offset+50000,y:0,width:50000,height:100000},dpr);assert.equal(left.x,coarse.x);assert.equal(left.x+left.width,right.x);assert.equal(right.x+right.width,coarse.x+coarse.width);}
});
