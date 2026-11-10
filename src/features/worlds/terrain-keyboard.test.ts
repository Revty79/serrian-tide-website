import assert from "node:assert/strict";
import test from "node:test";
import {TerrainStroke} from "./terrain-stroke";
import {applyPatch,type TerrainGeometry,type TerrainPatch} from "./terrain";
import {TerrainKeyboardBinding,type KeyboardTerrainContext} from "./terrain-keyboard-binding";
import {DEFAULT_TERRAIN_KEYBOARD,keyboardPosition,keyboardWorldPoint,stepKeyboardPoint,terrainKeyboardAction,type TerrainKeyboardSettings} from "./terrain-keyboard";

const shape:TerrainGeometry={width:64,height:32,tileSize:32,displayWidth:12800,displayHeight:3200,wrap:false,min:-12000,max:12000};
const event=(key:string,extra:Partial<Parameters<typeof terrainKeyboardAction>[0]>={})=>({key,ctrlKey:false,altKey:false,metaKey:false,shiftKey:false,repeat:false,...extra});
function fixture(){
 const context:KeyboardTerrainContext={shape,world:shape,grid:new Int16Array(64*32),brush:{tool:"raise",radius:2,strength:10,precision:"single"},tool:"raise",canEdit:true};
 let settings:TerrainKeyboardSettings={...DEFAULT_TERRAIN_KEYBOARD,enabled:true},focused=true,stroke:TerrainStroke|null=null;
 const history:TerrainPatch[]=[],binding=new TerrainKeyboardBinding({context:()=>context,settings:()=>settings,focused:()=>focused,center:()=>({x:20,y:10}),reveal:()=>{},redraw:()=>{},report:()=>{},exit:()=>{settings={...settings,enabled:false};},stroke:{active:()=>!!stroke,busy:()=>!!stroke,start:p=>{stroke=new TerrainStroke(context.grid,context.shape,context.brush,p,context.blocked);return true;},enqueue:p=>stroke!.enqueue(p),finish:()=>{while(stroke!.pending)stroke!.advance(100);history.push(stroke!.finish());stroke=null;},cancel:()=>{stroke!.cancel();stroke=null;}}});
 return {context,binding,history,key:(key:string,extra:Partial<Parameters<typeof terrainKeyboardAction>[0]>={})=>binding.key(event(key,extra)),advance:()=>{while(stroke?.pending)stroke.advance(100);},settings:(next:Partial<TerrainKeyboardSettings>)=>{settings={...settings,...next};binding.sync();},focus:(value:boolean)=>{focused=value;if(!value)binding.blur();}};
}
test("precision coordinates preserve the native node convention and actual refinement spacing across a seam",()=>{
 const world={...shape,wrap:true},source={...shape,width:128,height:128,displayWidth:1600,displayHeight:800},frame={x:12400,y:1000,width:1600,height:800};
 const sample={x:64,y:64},position=keyboardWorldPoint(sample,source,frame,world);
 assert.deepEqual(position,{x:400,y:1400});assert.deepEqual(keyboardPosition(position,"world",source,frame,world),sample);
 assert.deepEqual(keyboardWorldPoint(stepKeyboardPoint(sample,"right",1,source),source,frame,world),{x:412.5,y:1400});
 assert.throws(()=>keyboardPosition({x:5000,y:1400},"world",source,frame,world),/outside/);
 assert.throws(()=>keyboardPosition({x:NaN,y:1},"samples",source,frame,world),/finite/);
});
test("single/fine/coarse movement is in source samples with fixed poles and wrapped seams",()=>{
 assert.deepEqual(stepKeyboardPoint({x:63,y:0},"right",1,{...shape,wrap:true}),{x:0,y:0});
 assert.deepEqual(stepKeyboardPoint({x:0,y:0},"left",3,{...shape,wrap:true}),{x:61,y:0});
 assert.deepEqual(stepKeyboardPoint({x:63,y:31},"right",10,shape),{x:63,y:31});
 assert.deepEqual(stepKeyboardPoint({x:0,y:0},"up",10,shape),{x:0,y:0});
 assert.throws(()=>stepKeyboardPoint({x:0,y:0},"up",.5,shape),/whole/);
 const f=fixture();f.binding.sync();f.settings({movement:"fine",fine:3,coarse:7});f.key("ArrowRight");assert.equal(f.binding.cursor()!.x,23);f.key("ArrowRight",{shiftKey:true});assert.equal(f.binding.cursor()!.x,30);f.settings({movement:"single"});f.key("ArrowRight");assert.equal(f.binding.cursor()!.x,31);
});
test("keyboard input leaves forms, IME, browser modifiers and repeated activation untouched",()=>{
 for(const extra of [{ctrlKey:true},{metaKey:true},{altKey:true},{isComposing:true}])assert.equal(terrainKeyboardAction(event("Enter",extra),true),null);
 assert.equal(terrainKeyboardAction(event("ArrowRight"),false),null);assert.equal(terrainKeyboardAction(event("Enter",{repeat:true}),true),null);
 const f=fixture();f.binding.sync();f.focus(false);assert.equal(f.key("Enter"),false);assert.equal(f.key("ArrowRight"),false);assert(f.context.grid.every(v=>v===0));
});
test("cursor movement does not paint and one keyboard stamp exactly matches the pointer's TerrainStroke",()=>{
 const f=fixture();f.binding.sync();f.key("ArrowRight");assert(f.context.grid.every(v=>v===0));
 const expected=new Int16Array(f.context.grid),pointer=new TerrainStroke(expected,shape,f.context.brush,{x:21,y:10});while(pointer.pending)pointer.advance(100);const patch=pointer.finish();
 f.key("Enter");assert.deepEqual(f.context.grid,expected);assert.deepEqual(f.history[0],patch);assert.equal(f.history.length,1);
 f.key("Enter",{repeat:true});assert.equal(f.history.length,1);
 const accepted=f.context.grid.slice();applyPatch(f.context.grid,f.history[0],"before",shape);assert(f.context.grid.every(v=>v===0));applyPatch(f.context.grid,f.history[0],"after",shape);assert.deepEqual(f.context.grid,accepted);
});
test("every supported native brush and precision policy has identical pointer and keyboard numerical results",()=>{
 for(const tool of ["raise","lower","smooth","level","coast-land","coast-water","coast-smooth"] as const)for(const precision of ["original","fine","single"] as const){
  const f=fixture();f.context.tool=tool;f.context.brush={tool,precision,radius:3,strength:50,target:150,seaLevel:0,coastHeight:100,coastBand:500};for(let i=0;i<f.context.grid.length;i++)f.context.grid[i]=(i%64-20)*3+(Math.floor(i/64)-10)*2;
  const expected=f.context.grid.slice(),pointer=new TerrainStroke(expected,shape,f.context.brush,{x:20,y:10});while(pointer.pending)pointer.advance(100);pointer.finish();f.key("Enter");assert.deepEqual(f.context.grid,expected,tool+"/"+precision);
 }
});
test("a controlled keyboard stroke uses native interpolation, has one patch and cancels exactly on focus loss",()=>{
 const f=fixture();f.binding.sync();const before=f.context.grid.slice();f.key("Enter",{shiftKey:true});f.key("ArrowRight");f.key("ArrowRight");f.advance();assert(f.context.grid.some(v=>v!==0));f.focus(false);assert.deepEqual(f.context.grid,before);assert.equal(f.history.length,0);
 f.focus(true);f.key("Enter",{shiftKey:true});f.key("ArrowRight");f.key("ArrowRight");f.key("Enter",{shiftKey:true});assert.equal(f.history.length,1);assert(f.history[0].indices.length>=3);
});
test("permission, brush, source and protection changes cancel unfinished native strokes without changing accepted terrain",()=>{
 for(const change of [(c:KeyboardTerrainContext)=>{c.canEdit=false;},(c:KeyboardTerrainContext)=>{c.tool="lower";},(c:KeyboardTerrainContext)=>{c.brush={...c.brush,strength:30};},(c:KeyboardTerrainContext)=>{c.blocked=new Uint8Array(c.grid.length).fill(1);},(c:KeyboardTerrainContext)=>{c.grid=new Int16Array(c.grid.length);}]){
  const f=fixture(),original=f.context.grid;f.binding.sync();f.key("Enter",{shiftKey:true});f.advance();assert(original.some(v=>v!==0));change(f.context);f.binding.sync();assert(original.every(v=>v===0));assert(f.context.grid.every(v=>v===0));assert.equal(f.history.length,0);
 }
 const read=fixture();read.context.canEdit=false;read.key("Enter");assert.equal(read.history.length,0);assert(read.context.grid.every(v=>v===0));
});
test("protected samples stay exact, and a held arrow at a pole does not enqueue extra dabs",()=>{
 const f=fixture();f.context.blocked=new Uint8Array(f.context.grid.length);f.context.blocked[10*64+20]=1;f.key("Enter");assert.equal(f.context.grid[10*64+20],0);
 const edge=fixture();edge.context.brush={...edge.context.brush,precision:"original"};edge.binding.position({x:20,y:0},"samples");edge.key("Enter",{shiftKey:true});edge.advance();const initial=edge.context.grid.slice();for(let n=0;n<30;n++)edge.key("ArrowUp",{repeat:true});edge.advance();assert.deepEqual(edge.context.grid,initial);edge.key("Escape");assert(edge.context.grid.every(v=>v===0));
});
test("polygon and regional control-point adjustment calls the existing preview authority with correct coordinates",()=>{
 const f=fixture();let points=[{x:4,y:4},{x:8,y:4},{x:8,y:8}];f.context.tool="path";f.context.pathClosed=true;f.context.canEdit=false;f.context.path=points;f.context.onPath=p=>{points=p;f.context.path=p;};f.key("v");f.key("ArrowRight");assert.deepEqual(points[0],{x:5,y:4});assert(f.context.grid.every(v=>v===0));f.binding.position({x:6400,y:1600},"world");assert.deepEqual(points[0],{x:32,y:16});
 const r=fixture(),phases:string[]=[];r.context.tool="region";r.context.regionDrawing={editable:true,method:"points",activePart:0,vertex:0,operation:"move",parts:[{closed:true,points:[{x:1000,y:500},{x:2000,y:500},{x:2000,y:1500}]}],onPick:()=>{},onTrace:()=>{},onVertexDrag:(_part,_vertex,p,phase)=>{phases.push(phase);if(phase==="finish")assert.deepEqual(p,{x:1200,y:500});}};r.key("v");r.key("ArrowRight");assert.deepEqual(phases,["start","finish"]);assert(r.context.grid.every(v=>v===0));
});
