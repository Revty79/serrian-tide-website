import test from "node:test";
import assert from "node:assert/strict";
import {sculpt,applyPatch,type Brush,type SculptWorkspace,type TerrainGeometry} from "./terrain";
import {TerrainStroke} from "./terrain-stroke";
const shape:TerrainGeometry={width:32,height:32,tileSize:32,displayWidth:320,displayHeight:640,min:-100,max:100,wrap:false};
const drain=(s:TerrainStroke)=>{while(s.pending)s.advance(1000);};
test("single sample snaps fractional coordinates independently of anisotropic physical spacing",()=>{
 for(const tool of ["raise","lower","smooth","level","coast-land","coast-water","coast-smooth"] as const){const g=new Int16Array(1024).fill(4);g[10*32+10]=0;const s=new TerrainStroke(g,shape,{tool,precision:"single",radius:24,strength:250,target:7,coastHeight:8},{x:10.49,y:9.51});drain(s);const p=s.finish();assert.deepEqual([...p.indices],[330],tool);applyPatch(g,p,"before",shape);assert.equal(g[330],0);}
});
test("fine residuals accumulate additive and interpolative effects without storing fractions",()=>{
 for(const tool of ["raise","lower","level","smooth","coast-land","coast-water","coast-smooth"] as const){const g=new Int16Array(1024).fill(tool==="coast-water"?-4:4),i=330;g[i]=0;const before=new Map<number,number>(),w:SculptWorkspace={halo:new Int16Array(0),residuals:new Map()},brush:Brush={tool,precision:"fine",radius:1,strength:tool==="raise"||tool==="lower"?.2:5,target:4,coastHeight:4};for(let n=0;n<20;n++)sculpt(g,10,10,brush,before,shape,w);assert.notEqual(g[i],0,tool);assert.ok([...g].every(Number.isInteger));assert.ok(w.residuals!.size<=1024);}
});
test("single-sample drag visits each accepted sample once and stationary events do not repaint",()=>{
 const g=new Int16Array(1024),s=new TerrainStroke(g,shape,{tool:"raise",precision:"single",radius:1,strength:1},{x:10.2,y:10.2});drain(s);for(let n=0;n<100;n++){s.enqueue({x:10.2,y:10.2});drain(s);}assert.equal(g[330],1);s.enqueue({x:13.2,y:10.2});drain(s);s.enqueue({x:10.2,y:10.2});drain(s);assert.equal(g[330],1);assert.equal(s.finish().indices.length,4);assert.equal(s.residualCount,0);
});
test("precision obeys wrapped seams, protected boundaries, limits, cancel and gesture lifetime",()=>{
 const g=new Int16Array(1024),blocked=new Uint8Array(1024);blocked[320]=1;const brush:Brush={tool:"raise",precision:"single",radius:1,strength:1000};const s=new TerrainStroke(g,{...shape,wrap:true},brush,{x:31.8,y:10},blocked);drain(s);assert.equal(g[320],0);assert.match(s.noChangeReason,/Protected/);s.enqueue({x:1,y:10});drain(s);assert.equal(g[321],100);s.cancel();assert.ok(g.every(v=>v===0));assert.equal(s.residualCount,0);
 for(let n=0;n<10;n++){const gentle=new TerrainStroke(g,shape,{...brush,strength:.1},{x:10,y:10});drain(gentle);assert.equal(gentle.finish().indices.length,0);}assert.equal(g[330],0);
});
test("unsupported physical requests are bounded no-ops instead of throwing",()=>{
 const g=new Int16Array(1024),s=new TerrainStroke(g,shape,{tool:"raise",precision:"fine",radius:1,radiusMetres:.001,strength:100},{x:10,y:10});drain(s);assert.equal(s.finish().indices.length,0);assert.match(s.noChangeReason,/footprint/);
});
