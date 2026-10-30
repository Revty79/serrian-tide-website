import test from "node:test";
import assert from "node:assert/strict";
import {cartographicWindows} from "./terrain-cartography-window";
import {drawCartographicTile,cartographicWorkBytes,type CartographicColorWork} from "./terrain-cartography";
import {DEFAULT_MAP_APPEARANCE} from "./terrain-appearance";
const shape={width:1024,height:1024,tileSize:32,displayWidth:20000,displayHeight:20000,min:-12000,max:12000,wrap:false},frame={x:500000000,y:500000000,width:20000,height:20000};
test("extreme close ink uses bounded native visual windows instead of magnifying a numerical-tile bitmap",()=>{
 const view={left:500010000,top:500010000,right:500010320,bottom:500010240,width:1280,height:960,scale:4},windows=cartographicWindows(frame,shape,16*32+16,view,shape,2);assert.ok(windows.length>1);assert.ok(windows.length<=512);assert.ok(windows.reduce((n,w)=>n+w.pixelsX*w.pixelsY*4,0)<=64*1048576);for(const w of windows){assert.ok(w.width<32&&w.height<32);assert.ok(w.pixelsX<=256&&w.pixelsY<=256);assert.ok(w.x>=0&&w.y>=0&&w.x+w.width<=32&&w.y+w.height<=32);}
});
test("World-scale rendering keeps the existing tile engine and anisotropic views stay bounded",()=>{
 assert.deepEqual(cartographicWindows(frame,shape,0,{left:frame.x,top:frame.y,right:frame.x+20000,bottom:frame.y+20000,width:1000,height:1000,scale:.05},shape),[]);
 const anisotropic={...shape,displayWidth:1,displayHeight:1e9},view={left:0,top:5e8,right:1,bottom:5e8+10,width:1000,height:1000,scale:100};const windows=cartographicWindows({x:0,y:0,width:1,height:1e9},anisotropic,16*32,view,anisotropic,2);assert.ok(windows.length<32);for(const w of windows)assert.ok(w.pixelsX*w.pixelsY<=256**2);
});
test("native windows retain the exact numerical sea mask while interpolating continuous color",()=>{
 const previous=globalThis.Path2D;class Path{moveTo(){}lineTo(){}}globalThis.Path2D=Path as unknown as typeof Path2D;
 try{let pixels=new Uint8ClampedArray();const no=()=>{},ctx={createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:(image:ImageData)=>{pixels=image.data;},scale:no,translate:no},canvas={width:0,height:0,getContext:()=>ctx} as unknown as HTMLCanvasElement;
 drawCartographicTile(canvas,x=>x<16?-100:100,0,0,shape,0,{...DEFAULT_MAP_APPEARANCE,style:"topographic",contours:false,bathymetry:false,coastline:0},500,{x:0,y:0},1,64,null,{x:15,y:15,width:2,height:1,pixelsX:64,pixelsY:1},{});
 for(let x=0;x<64;x++){assert.equal(pixels[x*4+3],255);assert.equal(pixels[x*4+2]>pixels[x*4],x<16,"The accepted node-based crossing at sample 15.5 stays at its World coordinate");}
 }finally{globalThis.Path2D=previous;}
});

test("shared contour and curvature preparation preserves identical visible ink and pixels",()=>{
 const previous=globalThis.Path2D;class Path{points:unknown[]=[];moveTo(...p:number[]){this.points.push(["move",...p]);}lineTo(...p:number[]){this.points.push(["line",...p]);}}globalThis.Path2D=Path as unknown as typeof Path2D;
 try{const work:CartographicColorWork={},sample=(x:number,y:number)=>Math.round(1000-20*(y-16)**2+40*Math.sin(x/3)),spec={...DEFAULT_MAP_APPEARANCE,style:"illustrated-fantasy" as const};
 const render=(work:CartographicColorWork)=>{let pixels=new Uint8ClampedArray();const paths:unknown[]=[],no=()=>{},ctx={createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:(image:ImageData)=>{pixels=image.data;},scale:no,translate:no,stroke:(path?:Path)=>paths.push(path?.points??[]),fill:no,beginPath:no,moveTo:no,lineTo:no,closePath:no,fillRect:no},canvas={width:0,height:0,getContext:()=>ctx} as unknown as HTMLCanvasElement;drawCartographicTile(canvas,sample,0,0,shape,0,spec,100,{x:0,y:0},1,64,null,{x:14,y:14,width:4,height:4,pixelsX:64,pixelsY:64},work);return {pixels,paths};};
 const first=render(work),fields=work.value!.fields,segments=work.value!.segments;assert.ok(fields!.size>0&&segments!.length>0);assert.deepEqual(render(work),first);assert.equal(work.value!.fields,fields);assert.equal(work.value!.segments,segments);assert.deepEqual(render({}),first,"Cache reuse changes no source-derived ink or output pixel");assert.ok(cartographicWorkBytes(work)>work.value!.halo.byteLength+work.value!.land.byteLength+work.value!.water.byteLength);
 }finally{globalThis.Path2D=previous;}
});

test("Topographic and Illustrated ink and sea masks agree with canonical node-based coast coordinates",()=>{
 const previous=globalThis.Path2D;class Path{points:number[][]=[];moveTo(...p:number[]){this.points.push(p);}lineTo(...p:number[]){this.points.push(p);}}globalThis.Path2D=Path as unknown as typeof Path2D;
 try{for(const style of ["topographic","illustrated-fantasy"] as const){let pixels=new Uint8ClampedArray(),sx=1,sy=1,tx=0,ty=0;const ink:number[][]=[],ctx={createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:(image:ImageData)=>{pixels=image.data;},scale:(x:number,y:number)=>{sx*=x;sy*=y;},translate:(x:number,y:number)=>{tx+=x*sx;ty+=y*sy;},stroke:(path:Path)=>{for(const p of path.points)ink.push([p[0]*sx+tx,p[1]*sy+ty]);}},canvas={width:0,height:0,getContext:()=>ctx} as unknown as HTMLCanvasElement;
 drawCartographicTile(canvas,x=>x<16?-100:100,0,0,shape,0,{...DEFAULT_MAP_APPEARANCE,style,contours:false,bathymetry:false,decoration:0,coastline:1},500,{x:0,y:0},1,64,null,{x:15,y:15,width:2,height:1,pixelsX:64,pixelsY:32},{});
 // -100 at node15 and +100 at node16 cross sea at15.5. In this
 // [15,17] visual window the independent physical answer is pixel16.
 assert.ok(ink.length>0);assert.ok(ink.every(p=>Math.abs(p[0]-16)<1e-8));for(let x=0;x<64;x++)assert.equal(pixels[x*4+2]>pixels[x*4],x<16);}
 }finally{globalThis.Path2D=previous;}
});
