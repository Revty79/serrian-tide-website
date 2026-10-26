import {test} from "node:test";
import assert from "node:assert/strict";
import {calculateHydroFlow,hydroSuggestions,type HydroRequest} from "./terrain-hydrology-flow";
import {HydroMesh} from "./terrain-hydrology-mesh";
import {EMPTY_HYDROLOGY,acceptHydrology,replaceUnprotectedHydrology,hydroLayerSchema,hydrologyPlan,moveHydroPoint,removeHydroEdge,validateHydroFrame,type HydroAnalysis,type HydroSource,type HydroSources} from "./terrain-hydrology";

const rootId="00000000-0000-4000-8000-000000000001",childId="00000000-0000-4000-8000-000000000002",nestedId="00000000-0000-4000-8000-000000000003";
function fixture(read:(x:number,y:number)=>number,wrap=false):HydroRequest{
  const source:HydroSource={id:rootId,parentId:null,level:0,revision:1,gridWidth:32,gridHeight:32,frame:{x:0,y:0,width:1000,height:1000},contentHash:"a".repeat(64)};
  const sources:HydroSources={fingerprint:"b".repeat(64),rootRevision:1,seaLevel:0,world:{width:1000,height:1000,wrap},sources:[source]};
  return {sources,patches:[{source,lod:0,width:32,height:32,grid:Int16Array.from({length:1024},(_,i)=>read(i%32,Math.floor(i/32)))}],focus:source.frame,minimumAreaM2:10000};
}
function analysis(input:HydroRequest):HydroAnalysis{return {id:"analysis:fixture",method:"terrain-drainage-v1",fingerprint:input.sources.fingerprint,rootRevision:1,runoff:"uniform-contributing-land-area",minimumAreaM2:input.minimumAreaM2,focus:input.focus,pins:input.patches.map(p=>({id:p.source.id,revision:1,lod:p.lod,contentHash:p.source.contentHash,spacingX:p.source.frame.width/p.width,spacingY:p.source.frame.height/p.height}))};}
function checkFlow(input:HydroRequest){const before=input.patches.map(p=>p.grid.slice()),flow=calculateHydroFlow(input);for(let i=0;i<flow.mesh.count;i++){const to=flow.receiver[i];if(to>=0)assert.ok(flow.mesh.heights[to]<=flow.mesh.heights[i]+1e-8,"receivers never climb the saved analysis field");}input.patches.forEach((p,i)=>assert.deepEqual(p.grid,before[i]));const terminalArea=flow.area.reduce((sum,value,i)=>sum+(flow.receiver[i]<0?value:0),0);assert.ok(Math.abs(terminalArea-flow.metrics.landAreaM2)<1e-6);return flow;}

test("physical descent, coastal outlets and land-area accumulation are deterministic without terrain edits",()=>{
  const input=fixture((x,y)=>300-y*10),a=checkFlow(input),b=calculateHydroFlow(input);
  assert.deepEqual(a.receiver,b.receiver);assert.deepEqual(a.area,b.area);assert.ok(a.metrics.seaOutlets>0);assert.equal(a.metrics.closedBasins,0);
  const network=hydroSuggestions(a,analysis(input));assert.ok(network.edges.length>0);assert.ok(network.nodes.some(n=>n.kind==="sea-outlet"));assert.deepEqual(network,hydroSuggestions(b,analysis(input)));
});
test("mountain valleys produce connected confluences with no cycles",()=>{
  const input=fixture((x,y)=>Math.round(Math.abs(x-16)*18+(30-y)*9-20)),flow=checkFlow(input),network=hydroSuggestions(flow,analysis(input));
  assert.ok(network.nodes.some(n=>n.kind==="confluence"));assert.ok(network.nodes.some(n=>n.kind==="source"));
  for(const edge of network.edges)assert.ok(network.nodes.some(n=>n.id===edge.from)&&network.nodes.some(n=>n.id===edge.to));
  assert.ok(hydroLayerSchema.safeParse(network).success);
});
test("flat plateaus route to lower exits, while an enclosed depression remains a potential lake basin",()=>{
  const plateau=checkFlow(fixture((x,y)=>y===31?-10:100));assert.equal(plateau.metrics.closedBasins,0);assert.ok(plateau.metrics.seaOutlets>0);
  const basin=checkFlow(fixture((x,y)=>Math.round(20+(x-16)**2+(y-16)**2)));assert.equal(basin.metrics.closedBasins,1);assert.equal(basin.metrics.seaOutlets,0);
  const sink=Array.from(basin.receiver).findIndex((to,id)=>to<0&&basin.area[id]>0);assert.ok(Number.isFinite(basin.spill[sink]));assert.ok(basin.spill[sink]>basin.mesh.heights[sink]);
});
test("wrapped flow crosses the true seam over short physical distances and has no east/west boundary exits",()=>{
  const input=fixture((x,y)=>x===0?-100:x===31?200+y:Math.min(x,32-x)*20+y, true),flow=checkFlow(input);let crossings=0;
  for(let id=0;id<flow.mesh.count;id++){const next=flow.receiver[id];if(next>=0&&Math.abs(flow.mesh.point(id).x-flow.mesh.point(next).x)>500)crossings++;}
  assert.ok(crossings>0);assert.ok(flow.metrics.seaOutlets>0);
});
test("unequal World axes choose the steepest physical slope rather than the largest raw height drop",()=>{
  const input=fixture((x,y)=>20000-x*50-y*10);input.sources.world.width=100000;input.sources.sources[0].frame.width=100000;input.focus.width=100000;
  const flow=checkFlow(input),id=flow.mesh.locate({x:50000,y:500}),to=flow.receiver[id],a=flow.mesh.point(id),b=flow.mesh.point(to);
  assert.equal(a.x,b.x);assert.ok(b.y>a.y);
});
test("clipped adjacent/nested coverage conserves area and joins coarse/fine neighbors bidirectionally",()=>{
  const input=fixture((x,y)=>500-y*10),parent:HydroSource={...input.sources.sources[0],id:childId,parentId:null,level:1,frame:{x:112.3,y:198.7,width:400,height:350}},child:HydroSource={...parent,id:nestedId,parentId:childId,level:2,frame:{x:199.1,y:240.2,width:100,height:120}},adjacent:HydroSource={...parent,id:"00000000-0000-4000-8000-000000000004",frame:{...parent.frame,x:512.3}};
  for(const source of [parent,child,adjacent]){input.sources.sources.push(source);input.patches.push({source,lod:0,width:32,height:32,grid:Int16Array.from({length:1024},(_,i)=>Math.round(500-(source.frame.y+Math.floor(i/32)*source.frame.height/32)/1000*320))});}
  const flow=checkFlow(input),mesh=flow.mesh;assert.ok(Math.abs(mesh.area-1e6)<.001);let interfaces=0;
  for(let id=0;id<mesh.count;id++)for(let j=mesh.offsets[id];j<mesh.offsets[id+1];j++){const other=mesh.neighbors[j];if(mesh.sourceIds[id]!==mesh.sourceIds[other]){interfaces++;assert.ok(mesh.neighbors.subarray(mesh.offsets[other],mesh.offsets[other+1]).includes(id));}}
  assert.ok(interfaces>0);assert.equal(mesh.patches[mesh.sourceIds[mesh.locate({x:220,y:260})]].source.id,nestedId);
});
test("a refinement crossing wrapped longitude partitions the existing World exactly",()=>{
  const input=fixture(()=>100,true),source:HydroSource={...input.sources.sources[0],id:childId,level:1,frame:{x:930,y:100,width:140,height:200}};input.sources.sources.push(source);input.patches.push({source,lod:0,width:32,height:32,grid:new Int16Array(1024).fill(100)});
  const mesh=new HydroMesh(input.sources.world,input.patches);assert.ok(Math.abs(mesh.area-1e6)<.001);assert.equal(mesh.locate({x:20,y:150}),mesh.locate({x:1020,y:150}));
});
test("analysis plans are bounded, deterministic and independent of viewport ordering",()=>{
  const input=fixture(()=>100);input.sources.sources[0].gridWidth=input.sources.sources[0].gridHeight=1024;
  for(let i=2;i<=40;i++)input.sources.sources.push({...input.sources.sources[0],id:`00000000-0000-4000-8000-${String(i).padStart(12,"0")}`,level:1,parentId:null,frame:{x:i*2,y:i*2,width:100,height:100}});
  const a=hydrologyPlan(input.sources),b=hydrologyPlan({...input.sources,sources:[...input.sources.sources].reverse()});assert.deepEqual(a,b);assert.ok(a.reduce((sum,p)=>sum+p.width*p.height,0)<=524288);assert.ok(a.some(p=>p.lod>0));
});
test("acceptance includes downstream connections, protects authoring and keeps previews unchanged",()=>{
  const input=fixture((x,y)=>300-y*10),preview=hydroSuggestions(checkFlow(input),analysis(input)),copy=structuredClone(preview),accepted=acceptHydrology(EMPTY_HYDROLOGY,preview,preview.edges[0].id);
  assert.deepEqual(preview,copy);assert.ok(accepted.edges.length);const edited={...accepted,edges:accepted.edges.map(e=>({...e,name:"Creator name",protected:true}))},again=acceptHydrology(edited,preview);assert.equal(again.edges.find(e=>e.id===edited.edges[0].id)!.name,"Creator name");
  assert.ok(removeHydroEdge(accepted,accepted.edges[0].id).edges.length<accepted.edges.length);
});
test("source placement follows saved drainage and manual junction edits keep connected endpoints coherent",()=>{
  const input=fixture((x,y)=>300-y*10),flow=checkFlow(input),preview=hydroSuggestions(flow,analysis(input),{x:500,y:100});assert.ok(preview.edges.length);const edge=preview.edges[0],point={x:510,y:120},moved=moveHydroPoint(preview,edge.id,0,point);assert.deepEqual(moved.nodes.find(n=>n.id===edge.from)!.point,point);assert.equal(moved.edges.find(e=>e.id===edge.id)!.flowKind,"manual");assert.ok(moved.edges.find(e=>e.id===edge.id)!.protected);validateHydroFrame(moved,input.sources.world);
  assert.throws(()=>hydroSuggestions(flow,analysis(input),{x:500,y:990}),/saved land/);
});
test("graph validation rejects false links, flow loops, unexplained exceptions and outside coordinates",()=>{
  const input=fixture((x,y)=>300-y*10),network=hydroSuggestions(checkFlow(input),analysis(input)),edge=network.edges[0];
  assert.equal(hydroLayerSchema.safeParse({...network,edges:[{...edge,to:"missing"}]}).success,false);
  assert.equal(hydroLayerSchema.safeParse({...network,edges:[{...edge,flowKind:"exception"}]}).success,false);
  assert.equal(hydroLayerSchema.safeParse({...network,edges:[edge,{...edge,id:"reverse",from:edge.to,to:edge.from,points:[...edge.points].reverse()}]}).success,false);
  assert.throws(()=>validateHydroFrame({...network,nodes:[{...network.nodes[0],point:{x:1001,y:0}}]},input.sources.world),/inside/);
});

test("replacement retains protected and manual identities while dropping obsolete derived channels",()=>{
  const input=fixture((x,y)=>300-y*10),preview=hydroSuggestions(checkFlow(input),analysis(input)),base=acceptHydrology(EMPTY_HYDROLOGY,preview);assert.ok(base.edges.length>=3);
  const protectedEdge={...base.edges[0],protected:true,name:"Keep the authored name"},manualEdge={...base.edges[1],flowKind:"manual" as const,protected:false},authored={...base,edges:[protectedEdge,manualEdge,...base.edges.slice(2)]};
  const replacement=replaceUnprotectedHydrology(authored,EMPTY_HYDROLOGY);assert.deepEqual(replacement.edges,[protectedEdge,manualEdge]);assert.equal(replacement.nodes.length,new Set(replacement.edges.flatMap(e=>[e.from,e.to])).size);assert.ok(hydroLayerSchema.safeParse(replacement).success);
});
