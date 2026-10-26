import {z} from "zod";
import type {TerrainFrame} from "./terrain-refinement";

export const HYDROLOGY_LIMITS = {cells:524288,meshNodes:655360,nodes:8192,edges:4096,points:65536,analyses:32} as const;
const identity=z.string().min(1).max(160).regex(/^[a-zA-Z0-9:._-]+$/);
export const hydroPointSchema=z.object({x:z.number().finite().min(0).max(1e9),y:z.number().finite().min(0).max(1e9)}).strict();
export type HydroPoint=z.infer<typeof hydroPointSchema>;
const frameSchema=z.object({x:z.number().finite().min(0),y:z.number().finite().min(0),width:z.number().finite().positive(),height:z.number().finite().positive()}).strict();
export const hydroPinSchema=z.object({id:z.string().uuid(),revision:z.number().int().positive(),lod:z.number().int().min(0).max(5),contentHash:z.string().regex(/^[a-f0-9]{64}$/),spacingX:z.number().finite().positive(),spacingY:z.number().finite().positive()}).strict();
export const hydroAnalysisSchema=z.object({
  id:identity,method:z.literal("terrain-drainage-v1"),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),rootRevision:z.number().int().positive(),
  runoff:z.literal("uniform-contributing-land-area"),minimumAreaM2:z.number().finite().positive().max(1e18),focus:frameSchema,
  pins:z.array(hydroPinSchema).min(1).max(129),
}).strict();
export type HydroAnalysis=z.infer<typeof hydroAnalysisSchema>;
export const hydroNodeSchema=z.object({
  id:identity,point:hydroPointSchema,kind:z.enum(["source","channel","confluence","branch","closed-sink","sea-outlet","boundary-outlet","open-end"]),
  elevationM:z.number().finite().min(-30000).max(30000).nullable(),drainageM2:z.number().finite().min(0).max(1e18),spillM:z.number().finite().min(-30000).max(30000).nullable(),
}).strict();
export type HydroNode=z.infer<typeof hydroNodeSchema>;
export const hydroEdgeSchema=z.object({
  id:identity,from:identity,to:identity,name:z.string().max(120),points:z.array(hydroPointSchema).min(2).max(512),
  drainageM2:z.number().finite().min(0).max(1e18),flowKind:z.enum(["derived","manual","exception"]),exceptionReason:z.string().max(1000),protected:z.boolean(),analysisId:identity.nullable(),
}).strict();
export type HydroEdge=z.infer<typeof hydroEdgeSchema>;
export const hydroLayerSchema=z.object({version:z.literal(1),visible:z.boolean(),opacity:z.number().finite().min(0).max(1),analyses:z.array(hydroAnalysisSchema).max(HYDROLOGY_LIMITS.analyses),nodes:z.array(hydroNodeSchema).max(HYDROLOGY_LIMITS.nodes),edges:z.array(hydroEdgeSchema).max(HYDROLOGY_LIMITS.edges)}).strict().superRefine((layer,context)=>{
  const problem=(message:string)=>context.addIssue({code:"custom",message});
  const nodes=new Map(layer.nodes.map(n=>[n.id,n])),edges=new Set(layer.edges.map(e=>e.id)),analyses=new Set(layer.analyses.map(a=>a.id));
  if(nodes.size!==layer.nodes.length||edges.size!==layer.edges.length||analyses.size!==layer.analyses.length)problem("Water identities must be unique.");
  if(layer.edges.reduce((sum,e)=>sum+e.points.length,0)>HYDROLOGY_LIMITS.points)problem("This water network exceeds its 65,536 point budget. Keep the draft and analyse a smaller area or fewer channels.");
  const incoming=new Map(layer.nodes.map(n=>[n.id,0])),outgoing=new Map<string,string[]>();
  for(const edge of layer.edges){
    const from=nodes.get(edge.from),to=nodes.get(edge.to);
    if(!from||!to||edge.from===edge.to){problem("Every channel must connect two distinct saved water nodes.");continue;}
    if(!sameHydroPoint(edge.points[0],from.point)||!sameHydroPoint(edge.points.at(-1)!,to.point))problem("Channel endpoints must agree with their shared source and junction positions.");
    if(edge.analysisId&&!analyses.has(edge.analysisId)||edge.flowKind==="derived"&&!edge.analysisId)problem("A terrain-derived channel must retain its analysis provenance.");
    if(edge.flowKind==="exception"&&!edge.exceptionReason.trim())problem("Explain the deliberate fictional flow exception.");
    incoming.set(edge.to,incoming.get(edge.to)!+1);outgoing.set(edge.from,[...(outgoing.get(edge.from)??[]),edge.to]);
  }
  const queue=layer.nodes.filter(n=>incoming.get(n.id)===0).map(n=>n.id);let seen=0;
  for(let i=0;i<queue.length;i++){seen++;for(const next of outgoing.get(queue[i])??[]){incoming.set(next,incoming.get(next)!-1);if(incoming.get(next)===0)queue.push(next);}}
  if(seen!==layer.nodes.length)problem("Water must have a direction without a closed flow loop. Use a described exception for unusual geography, while retaining an outlet or sink.");
});
export type HydroLayer=z.infer<typeof hydroLayerSchema>;
export const EMPTY_HYDROLOGY:HydroLayer={version:1,visible:true,opacity:1,analyses:[],nodes:[],edges:[]};
export const hydroSaveSchema=z.object({mapId:z.string().uuid(),revision:z.number().int().min(0),requestId:z.string().uuid(),layer:hydroLayerSchema,restoreRevision:z.number().int().positive().optional()}).strict();
export type HydroCommand=z.infer<typeof hydroSaveSchema>;
export type HydroGeometry={width:number;height:number;wrap:boolean};
export type HydroSource={id:string;parentId:string|null;level:number;revision:number;gridWidth:number;gridHeight:number;frame:TerrainFrame;contentHash:string};
export type HydroSources={fingerprint:string;rootRevision:number;seaLevel:number;world:HydroGeometry;sources:HydroSource[]};

export function sameHydroPoint(a:HydroPoint,b:HydroPoint){return Math.abs(a.x-b.x)<1e-5&&Math.abs(a.y-b.y)<1e-5;}
export function hydroIdentity(kind:string,text:string){let a=2166136261,b=3339675911;for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b^text.charCodeAt(i),2246822519);}return `${kind}:${(a>>>0).toString(16)}${(b>>>0).toString(16)}`;}
export function validateHydroFrame(layer:HydroLayer,world:HydroGeometry){
  for(const point of [...layer.nodes.map(n=>n.point),...layer.edges.flatMap(e=>e.points)])if(point.x>=world.width||point.y>=world.height)throw Error("Keep every water position inside this World's metre coordinates.");
  for(const analysis of layer.analyses)if(analysis.focus.x>=world.width||analysis.focus.y+analysis.focus.height>world.height+1e-5||analysis.focus.width>world.width+1e-5||!world.wrap&&analysis.focus.x+analysis.focus.width>world.width+1e-5)throw Error("The analysed area must remain inside the existing World frame.");
}

/** A fixed, camera-independent plan. Accepted overviews bound work without
 * expanding all refinement originals into one enormous World-sized array. */
export function hydrologyPlan(index:HydroSources,budget=HYDROLOGY_LIMITS.cells){
  const sources=[...index.sources].sort((a,b)=>a.level-b.level||(a.id<b.id?-1:a.id>b.id?1:0)),lods=new Map(sources.map(s=>[s.id,0]));
  const maxLod=(s:HydroSource)=>Math.min(5,Math.floor(Math.log2(Math.min(s.gridWidth,s.gridHeight)/32)));
  const count=(s:HydroSource)=>s.gridWidth*s.gridHeight/4**lods.get(s.id)!;
  while(sources.reduce((sum,s)=>sum+count(s),0)>budget){const candidate=sources.filter(s=>lods.get(s.id)!<maxLod(s)).sort((a,b)=>count(b)-count(a)||a.level-b.level||(a.id<b.id?-1:a.id>b.id?1:0))[0];if(!candidate)throw Error("Too many terrain sources for one drainage analysis. Retain your waterways and use fewer coverage areas.");lods.set(candidate.id,lods.get(candidate.id)!+1);}
  return sources.map(source=>({source,lod:lods.get(source.id)!,width:source.gridWidth/2**lods.get(source.id)!,height:source.gridHeight/2**lods.get(source.id)!}));
}

export function makeHydroAnalysis(index:HydroSources,focus:TerrainFrame,minimumAreaM2:number):HydroAnalysis{
  const pins=hydrologyPlan(index).map(p=>({id:p.source.id,revision:p.source.revision,lod:p.lod,contentHash:p.source.contentHash,spacingX:p.source.frame.width/p.width,spacingY:p.source.frame.height/p.height}));
  const recipe={method:"terrain-drainage-v1" as const,fingerprint:index.fingerprint,rootRevision:index.rootRevision,runoff:"uniform-contributing-land-area" as const,minimumAreaM2,focus,pins};
  return hydroAnalysisSchema.parse({id:hydroIdentity("analysis",JSON.stringify(recipe)),...recipe});
}

export function pruneHydrology(layer:HydroLayer):HydroLayer{
  const used=new Set(layer.edges.flatMap(e=>[e.from,e.to])),analyses=new Set(layer.edges.flatMap(e=>e.analysisId?[e.analysisId]:[]));
  const incoming=new Map<string,number>(),outgoing=new Map<string,number>();for(const e of layer.edges){incoming.set(e.to,(incoming.get(e.to)??0)+1);outgoing.set(e.from,(outgoing.get(e.from)??0)+1);}
  return {...layer,analyses:layer.analyses.filter(a=>analyses.has(a.id)),nodes:layer.nodes.filter(n=>used.has(n.id)).map(n=>({...n,kind:(outgoing.get(n.id)??0)>1?"branch":(incoming.get(n.id)??0)>1&&(outgoing.get(n.id)??0)>0?"confluence":!incoming.get(n.id)?"source":!outgoing.get(n.id)&&!["sea-outlet","boundary-outlet","closed-sink"].includes(n.kind)?"open-end":n.kind}))};
}
export function removeHydroEdge(layer:HydroLayer,id:string){return pruneHydrology({...layer,edges:layer.edges.filter(e=>e.id!==id)});}

export function replaceUnprotectedHydrology(base:HydroLayer,suggestion:HydroLayer){
  const retained=pruneHydrology({...base,edges:base.edges.filter(e=>e.protected||e.flowKind!=="derived")});
  return acceptHydrology(retained,suggestion);
}

/** Accept the chosen course and its downstream connections. Protected authoring
 * is retained; a changed shared junction requires deliberate creator editing. */
export function acceptHydrology(base:HydroLayer,suggestion:HydroLayer,edgeId?:string):HydroLayer{
  const byFrom=new Map<string,HydroEdge[]>();for(const edge of suggestion.edges)byFrom.set(edge.from,[...(byFrom.get(edge.from)??[]),edge]);
  const selected=new Map<string,HydroEdge>(),queue=edgeId?suggestion.edges.filter(e=>e.id===edgeId):[...suggestion.edges];
  for(let i=0;i<queue.length;i++){const edge=queue[i];if(selected.has(edge.id))continue;selected.set(edge.id,edge);queue.push(...(byFrom.get(edge.to)??[]));}
  const nodes=new Map(base.nodes.map(n=>[n.id,n])),edges=new Map(base.edges.map(e=>[e.id,e]));
  for(const edge of selected.values()){
    const previous=edges.get(edge.id);if(previous?.protected)continue;
    for(const id of [edge.from,edge.to]){const proposed=suggestion.nodes.find(n=>n.id===id)!;const current=nodes.get(id);if(current&&!sameHydroPoint(current.point,proposed.point))throw Error("A suggested junction overlaps a creator-adjusted position. Keep the authored route and adjust or reject this suggestion.");if(!current)nodes.set(id,proposed);}
    edges.set(edge.id,edge);
  }
  const analyses=new Map([...base.analyses,...suggestion.analyses].map(a=>[a.id,a]));
  return hydroLayerSchema.parse(pruneHydrology({...base,nodes:[...nodes.values()],edges:[...edges.values()],analyses:[...analyses.values()]}));
}

export function moveHydroPoint(layer:HydroLayer,edgeId:string,index:number,point:HydroPoint):HydroLayer{
  const edge=layer.edges.find(e=>e.id===edgeId);if(!edge||index<0||index>=edge.points.length)return layer;
  const nodeId=index===0?edge.from:index===edge.points.length-1?edge.to:undefined;
  return hydroLayerSchema.parse({...layer,nodes:layer.nodes.map(n=>n.id===nodeId?{...n,point,elevationM:null,spillM:null}:n),edges:layer.edges.map(e=>{if(e.id!==edgeId&&e.from!==nodeId&&e.to!==nodeId)return e;const points=e.points.map((p,i)=>e.id===edgeId&&i===index||nodeId&&(i===0&&e.from===nodeId||i===e.points.length-1&&e.to===nodeId)?point:p);return {...e,points,flowKind:e.flowKind==="exception"?"exception":"manual",protected:true};})});
}
