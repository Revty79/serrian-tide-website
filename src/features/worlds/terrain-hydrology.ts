import {z} from "zod";
import {regionalAuthoringSchema} from "./terrain-regional-scope";
import {waterFeatureSchema,waterPresentationSchema,lakeArtworkSchema,courseKindSchema,naturalDetailSchema,type NaturalDetail} from "./terrain-water-feature-schema";
export type {WaterFeature,WaterPresentation,NaturalDetail} from "./terrain-water-feature-schema";
import {validateWaterRings,nearestWaterShore,waterBodiesOverlap,waterDx} from "./terrain-water-geometry";
import type {TerrainFrame} from "./terrain-refinement";

export const HYDROLOGY_LIMITS = {cells:524288,meshNodes:655360,nodes:8192,edges:4096,points:65536,analyses:32} as const;
const identity=z.string().min(1).max(160).regex(/^[a-zA-Z0-9:._-]+$/);
export const hydroPointSchema=z.object({x:z.number().finite().min(0).max(1e9),y:z.number().finite().min(0).max(1e9)}).strict();
export type HydroPoint=z.infer<typeof hydroPointSchema>;
const frameSchema=z.object({x:z.number().finite().min(0),y:z.number().finite().min(0),width:z.number().finite().positive(),height:z.number().finite().positive()}).strict();
export const hydroPinSchema=z.object({id:z.string().uuid(),revision:z.number().int().positive(),lod:z.number().int().min(0).max(5),contentHash:z.string().regex(/^[a-f0-9]{64}$/),spacingX:z.number().finite().positive(),spacingY:z.number().finite().positive()}).strict();
export const hydroAnalysisSchema=z.object({
  id:identity,method:z.enum(["terrain-drainage-v1","terrain-water-v2","terrain-natural-v3"]),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),rootRevision:z.number().int().positive(),
  runoff:z.literal("uniform-contributing-land-area"),minimumAreaM2:z.number().finite().positive().max(1e18),focus:frameSchema,
  pins:z.array(hydroPinSchema).min(1).max(129),naturalDetail:naturalDetailSchema.optional(),lakeMinimumAreaM2:z.number().finite().positive().max(1e18).optional(),lakeMinimumDepthM:z.number().finite().positive().max(30000).optional(),
}).strict().superRefine((a,c)=>{if(a.method!=="terrain-drainage-v1"&&(a.lakeMinimumAreaM2===undefined||a.lakeMinimumDepthM===undefined))c.addIssue({code:"custom",message:"A connected-water analysis must retain its lake area and depth assumptions."});if(a.method==="terrain-drainage-v1"&&(a.lakeMinimumAreaM2!==undefined||a.lakeMinimumDepthM!==undefined))c.addIssue({code:"custom",message:"A 3A drainage analysis cannot claim later lake assumptions."});if(a.method==="terrain-natural-v3"?!a.naturalDetail:a.naturalDetail!==undefined)c.addIssue({code:"custom",message:"Natural selection must retain its explicit detail recipe; older methods cannot claim it."});});
export type HydroAnalysis=z.infer<typeof hydroAnalysisSchema>;
export const hydroNodeSchema=z.object({
  id:identity,point:hydroPointSchema,kind:z.enum(["source","channel","confluence","branch","closed-sink","sea-outlet","boundary-outlet","open-end","lake-inlet","lake-outlet"]),
  elevationM:z.number().finite().min(-30000).max(30000).nullable(),drainageM2:z.number().finite().min(0).max(1e18),spillM:z.number().finite().min(-30000).max(30000).nullable(),lakeId:identity.optional(),detached:z.boolean().optional(),
}).strict();
export type HydroNode=z.infer<typeof hydroNodeSchema>;
export const hydroEdgeSchema=z.object({
  id:identity,from:identity,to:identity,courseKind:courseKindSchema.optional(),name:z.string().max(120),points:z.array(hydroPointSchema).min(2).max(512),
  drainageM2:z.number().finite().min(0).max(1e18),flowKind:z.enum(["derived","manual","exception"]),exceptionReason:z.string().max(1000),protected:z.boolean(),analysisId:identity.nullable(),widthM:z.number().finite().positive().max(100000).nullable().optional(),sourceIds:z.array(z.string().uuid()).max(129).optional(),
}).strict();
export type HydroEdge=z.infer<typeof hydroEdgeSchema>;
export const hydroLakeSchema=z.object({id:identity,artwork:lakeArtworkSchema.optional(),name:z.string().max(120),rings:z.array(z.array(hydroPointSchema).min(3).max(8192)).min(1).max(64),levelM:z.number().finite().min(-30000).max(30000),seed:hydroPointSchema,spillM:z.number().finite().min(-30000).max(30000).nullable(),condition:z.enum(["potential","standing","intermittent","dry"]),mode:z.enum(["closed","outlet"]),inletNodeIds:z.array(identity).max(1024),outletNodeId:identity.nullable(),flowKind:z.enum(["derived","manual","exception"]),exceptionReason:z.string().max(1000),protected:z.boolean(),analysisId:identity.nullable(),sourceIds:z.array(z.string().uuid()).max(129),authoredPins:z.array(hydroPinSchema).max(129).optional(),review:z.boolean()}).strict();
export type HydroLake=z.infer<typeof hydroLakeSchema>;
export const hydroCatchmentSchema=z.object({id:identity,name:z.string().max(120),rings:z.array(z.array(hydroPointSchema).min(3).max(8192)).min(1).max(128),outlet:hydroPointSchema,terminal:hydroPointSchema,kind:z.enum(["coastal","inland","fixed-edge","tributary"]),areaM2:z.number().finite().positive().max(1e18),analysisId:identity,sourceIds:z.array(z.string().uuid()).max(129),parentId:identity.nullable(),frameMode:z.literal("canonical-cut").optional(),samplingM:z.number().finite().positive()}).strict();
export type HydroCatchment=z.infer<typeof hydroCatchmentSchema>;
export const hydroLayerSchema=z.object({version:z.literal(1),visible:z.boolean(),opacity:z.number().finite().min(0).max(1),analyses:z.array(hydroAnalysisSchema).max(HYDROLOGY_LIMITS.analyses),nodes:z.array(hydroNodeSchema).max(HYDROLOGY_LIMITS.nodes),edges:z.array(hydroEdgeSchema).max(HYDROLOGY_LIMITS.edges),systemVersion:z.union([z.literal(2),z.literal(3)]).optional(),features:z.array(waterFeatureSchema).max(512).optional(),presentation:waterPresentationSchema.optional(),lakes:z.array(hydroLakeSchema).max(256).optional(),catchments:z.array(hydroCatchmentSchema).max(64).optional()}).strict().superRefine((layer,context)=>{
  const problem=(message:string)=>context.addIssue({code:"custom",message});
  const nodes=new Map(layer.nodes.map(n=>[n.id,n])),edges=new Set(layer.edges.map(e=>e.id)),analyses=new Set(layer.analyses.map(a=>a.id));
  if(nodes.size!==layer.nodes.length||edges.size!==layer.edges.length||analyses.size!==layer.analyses.length)problem("Water identities must be unique.");
  if(layer.edges.reduce((sum,e)=>sum+e.points.length,0)>HYDROLOGY_LIMITS.points)problem("This water network exceeds its 65,536 point budget. Keep the draft and analyse a smaller area or fewer channels.");
  const lakes=layer.lakes??[],lakeIds=new Set(lakes.map(l=>l.id));if(lakeIds.size!==lakes.length)problem("Lake identities must be unique.");
  if((layer.lakes||layer.catchments||layer.nodes.some(n=>n.lakeId)||layer.edges.some(e=>e.widthM!==undefined))&&(layer.systemVersion??1)<2)problem("Connected water authoring requires its version-2 extension marker.");
  if([...lakes.flatMap(l=>l.rings),...(layer.catchments??[]).flatMap(c=>c.rings),...(layer.features??[]).flatMap(f=>f.kind==="wetland"?f.rings:[])].reduce((n,r)=>n+r.length,0)>32768)problem("Water surfaces and watersheds exceed their shared 32,768-point budget.");
  for(const lake of lakes){if(new Set(lake.inletNodeIds).size!==lake.inletNodeIds.length)problem("A lake inlet cannot be duplicated.");if((lake.mode==="closed")!==(lake.outletNodeId===null))problem("A closed lake has no outlet; an open lake needs exactly one outlet.");if(lake.flowKind==="exception"&&!lake.exceptionReason.trim())problem("Explain this lake's fictional exception.");if(lake.flowKind==="derived"&&!lake.analysisId||lake.analysisId&&!analyses.has(lake.analysisId))problem("A suggested lake must retain its terrain analysis.");for(const id of [...lake.inletNodeIds,...lake.outletNodeId?[lake.outletNodeId]:[]]){const n=nodes.get(id);if(!n||n.lakeId!==lake.id||n.kind!==(id===lake.outletNodeId?"lake-outlet":"lake-inlet"))problem("Lake ports must refer to their shared lake nodes.");}}
  for(const node of layer.nodes)if((node.kind==="lake-inlet"||node.kind==="lake-outlet")&&!node.lakeId)problem("Lake port nodes require their lake identity.");
  for(const node of layer.nodes)if(node.lakeId&&!lakes.some(l=>l.id===node.lakeId&&(l.outletNodeId===node.id||l.inletNodeIds.includes(node.id))))problem("A lake node must belong to a retained lake port.");
  const catchmentIds=new Set((layer.catchments??[]).map(c=>c.id));if(catchmentIds.size!==(layer.catchments?.length??0))problem("Watershed identities must be unique.");for(const c of layer.catchments??[])if(!analyses.has(c.analysisId))problem("A watershed must retain its terrain analysis.");
  if((layer.features||layer.presentation||layer.edges.some(e=>e.courseKind!==undefined)||lakes.some(l=>l.artwork)||layer.analyses.some(a=>a.method==="terrain-natural-v3"))&&layer.systemVersion!==3)problem("Special water features and artwork require their version-3 extension marker.");
  const featureIds=new Set<string>();for(const f of layer.features??[]){if(featureIds.has(f.id)||edges.has(f.id)||nodes.has(f.id)||lakeIds.has(f.id))problem("Special water identities must be unique.");featureIds.add(f.id);if(f.riverId&&!edges.has(f.riverId))problem("A water feature must link to a retained river or be explicitly detached.");if(f.kind==="wetland"&&f.lakeId&&!lakeIds.has(f.lakeId))problem("A wetland must link to a retained lake.");if((f.kind==="waterfall"||f.kind==="rapids")&&!f.riverId&&!f.review)problem("A waterfall or rapids needs a river; detached features require review.");if(f.flowKind==="exception"&&!f.exceptionReason.trim())problem("Explain this water feature's fictional exception.");if(f.analysisId&&!analyses.has(f.analysisId)||f.flowKind==="derived"&&!f.analysisId)problem("A suggested water feature must retain its terrain analysis.");if(f.flowKind==="derived"&&f.kind==="wetland"&&f.classification!=="potential")problem("A suggested wet area remains potential until the creator chooses its classification.");if(f.flowKind==="derived"&&(f.kind==="spring"||!f.evidence))problem("Springs are creator-defined; other suggestions require sampled evidence.");}
  const incoming=new Map(layer.nodes.map(n=>[n.id,0])),outgoing=new Map<string,string[]>();
  for(const edge of layer.edges){
    const from=nodes.get(edge.from),to=nodes.get(edge.to);
    if(!from||!to||edge.from===edge.to){problem("Every channel must connect two distinct saved water nodes.");continue;}
    if(!sameHydroPoint(edge.points[0],from.point)||!sameHydroPoint(edge.points.at(-1)!,to.point))problem("Channel endpoints must agree with their shared source and junction positions.");
    if(edge.analysisId&&!analyses.has(edge.analysisId)||edge.flowKind==="derived"&&!edge.analysisId)problem("A terrain-derived channel must retain its analysis provenance.");
    if((edge.flowKind==="exception"||edge.courseKind==="fictional")&&!edge.exceptionReason.trim())problem("Explain the deliberate fictional flow exception.");
    if(from.lakeId&&from.kind!=="lake-outlet"||to.lakeId&&to.kind!=="lake-inlet")problem("Rivers enter lake inlets and leave their outlet; they cannot pass through a closed lake.");
    if(edge.courseKind==="intermittent"&&edge.flowKind==="derived")problem("Intermittent flow must be a creator choice, not inferred from uniform runoff.");
    incoming.set(edge.to,incoming.get(edge.to)!+1);outgoing.set(edge.from,[...(outgoing.get(edge.from)??[]),edge.to]);
  }
  for(const lake of lakes)if(lake.outletNodeId&&nodes.has(lake.outletNodeId))for(const id of lake.inletNodeIds)if(nodes.has(id)){incoming.set(lake.outletNodeId,incoming.get(lake.outletNodeId)!+1);outgoing.set(id,[...(outgoing.get(id)??[]),lake.outletNodeId]);}
  const queue=layer.nodes.filter(n=>incoming.get(n.id)===0).map(n=>n.id);let seen=0;
  for(let i=0;i<queue.length;i++){seen++;for(const next of outgoing.get(queue[i])??[]){incoming.set(next,incoming.get(next)!-1);if(incoming.get(next)===0)queue.push(next);}}
  if(seen!==layer.nodes.length)problem("Water must have a direction without a closed flow loop. Use a described exception for unusual geography, while retaining an outlet or sink.");
});
export type HydroLayer=z.infer<typeof hydroLayerSchema>;
export const EMPTY_HYDROLOGY:HydroLayer={version:1,visible:true,opacity:1,analyses:[],nodes:[],edges:[]};
export const hydroSaveSchema=z.object({mapId:z.string().uuid(),revision:z.number().int().min(0),requestId:z.string().uuid(),layer:hydroLayerSchema,restoreRevision:z.number().int().positive().optional(),regional:regionalAuthoringSchema.optional()}).strict();
export type HydroCommand=z.infer<typeof hydroSaveSchema>;
export type HydroGeometry={width:number;height:number;wrap:boolean};
export type HydroSource={id:string;parentId:string|null;level:number;revision:number;gridWidth:number;gridHeight:number;frame:TerrainFrame;contentHash:string};
export type HydroSources={fingerprint:string;rootRevision:number;seaLevel:number;world:HydroGeometry;sources:HydroSource[]};

export function sameHydroPoint(a:HydroPoint,b:HydroPoint){return Math.abs(a.x-b.x)<1e-5&&Math.abs(a.y-b.y)<1e-5;}
export function hydroIdentity(kind:string,text:string){let a=2166136261,b=3339675911;for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b^text.charCodeAt(i),2246822519);}return `${kind}:${(a>>>0).toString(16)}${(b>>>0).toString(16)}`;}
export function validateHydroFrame(layer:HydroLayer,world:HydroGeometry){
  for(const point of [...layer.nodes.map(n=>n.point),...layer.edges.flatMap(e=>e.points)])if(point.x>=world.width||point.y>=world.height)throw Error("Keep every water position inside this World's metre coordinates.");
  for(const lake of layer.lakes??[]){validateWaterRings(lake.rings,world);for(const p of lake.rings.flat())if(p.x>=world.width||p.y>=world.height)throw Error("Keep every shoreline inside this World.");for(const id of [...lake.inletNodeIds,...lake.outletNodeId?[lake.outletNodeId]:[]]){const n=layer.nodes.find(n=>n.id===id)!;if(nearestWaterShore(n.point,lake.rings,world).distance>1e-4&&!lake.review)throw Error("A changed lake connection needs review before it can be certified on the shoreline.");}}
  const lakes=layer.lakes??[];for(let i=0;i<lakes.length;i++)for(let j=i+1;j<lakes.length;j++)if(waterBodiesOverlap(lakes[i].rings,lakes[j].rings,world))throw Error("These lake shorelines overlap. Review the existing lake identity or combine their geography deliberately before saving.");
  for(const c of layer.catchments??[]){validateWaterRings(c.rings,c.frameMode?{...world,wrap:false}:world);for(const p of c.rings.flat())if((c.frameMode?p.x>world.width:p.x>=world.width)||p.y>=world.height)throw Error("Keep every watershed inside this World.");}
  for(const f of layer.features??[]){if(f.kind==="wetland"){validateWaterRings(f.rings,world);if(f.rings.flat().some(p=>p.x>=world.width||p.y>=world.height))throw Error("Keep wetland boundaries inside this World.");}else {if(f.point.x>=world.width||f.point.y>=world.height)throw Error("Keep water features inside this World.");const river=layer.edges.find(e=>e.id===f.riverId);if(river&&!f.review){let distance=Infinity;for(let i=1;i<river.points.length;i++){const a=river.points[i-1],b=river.points[i],sx=waterDx(a.x,b.x,world),sy=b.y-a.y,x=waterDx(a.x,f.point.x,world),y=f.point.y-a.y,t=Math.max(0,Math.min(1,(x*sx+y*sy)/(sx*sx+sy*sy||1)));distance=Math.min(distance,Math.hypot(x-sx*t,y-sy*t));}if(f.kind==="spring"?!sameHydroPoint(f.point,river.points[0]):distance>1e-4)throw Error("This linked water feature moved away from its course; mark it for review or align it deliberately.");}}}
  for(const analysis of layer.analyses)if(analysis.focus.x>=world.width||analysis.focus.y+analysis.focus.height>world.height+1e-5||analysis.focus.width>world.width+1e-5||!world.wrap&&analysis.focus.x+analysis.focus.width>world.width+1e-5)throw Error("The analysed area must remain inside the existing World frame.");
}

/** A fixed, camera-independent plan. Accepted overviews bound work without
 * expanding all refinement originals into one enormous World-sized array. */
export function hydrologyPlan(index:HydroSources,budget:number=HYDROLOGY_LIMITS.cells,focus?:TerrainFrame){
  const sources=[...index.sources].sort((a,b)=>a.level-b.level||(a.id<b.id?-1:a.id>b.id?1:0)),lods=new Map(sources.map(s=>[s.id,0]));
  const maxLod=(s:HydroSource)=>Math.min(5,Math.floor(Math.log2(Math.min(s.gridWidth,s.gridHeight)/32)));
  if(focus)for(const s of sources)if(s.level>0){const overlapY=s.frame.y<focus.y+focus.height&&s.frame.y+s.frame.height>focus.y,overlapX=[-index.world.width,0,index.world.width].some(offset=>(index.world.wrap||offset===0)&&s.frame.x+offset<focus.x+focus.width&&s.frame.x+s.frame.width+offset>focus.x);if(!overlapX||!overlapY)lods.set(s.id,maxLod(s));}
  const count=(s:HydroSource)=>s.gridWidth*s.gridHeight/4**lods.get(s.id)!;
  while(sources.reduce((sum,s)=>sum+count(s),0)>budget){const candidate=sources.filter(s=>lods.get(s.id)!<maxLod(s)).sort((a,b)=>count(b)-count(a)||a.level-b.level||(a.id<b.id?-1:a.id>b.id?1:0))[0];if(!candidate)throw Error("Too many terrain sources for one drainage analysis. Retain your waterways and use fewer coverage areas.");lods.set(candidate.id,lods.get(candidate.id)!+1);}
  return sources.map(source=>({source,lod:lods.get(source.id)!,width:source.gridWidth/2**lods.get(source.id)!,height:source.gridHeight/2**lods.get(source.id)!}));
}

export function makeHydroAnalysis(index:HydroSources,focus:TerrainFrame,minimumAreaM2:number,water?:{lakeMinimumAreaM2:number;lakeMinimumDepthM:number;naturalDetail?:NaturalDetail}):HydroAnalysis{
  const pins=hydrologyPlan(index,HYDROLOGY_LIMITS.cells,water?focus:undefined).map(p=>({id:p.source.id,revision:p.source.revision,lod:p.lod,contentHash:p.source.contentHash,spacingX:p.source.frame.width/p.width,spacingY:p.source.frame.height/p.height}));
  const recipe={method:water?.naturalDetail?"terrain-natural-v3" as const:water?"terrain-water-v2" as const:"terrain-drainage-v1" as const,fingerprint:index.fingerprint,rootRevision:index.rootRevision,runoff:"uniform-contributing-land-area" as const,minimumAreaM2,focus,pins,...water};
  return hydroAnalysisSchema.parse({id:hydroIdentity("analysis",JSON.stringify(recipe)),...recipe});
}

export function pruneHydrology(layer:HydroLayer):HydroLayer{
  if(layer.features)layer={...layer,features:layer.features.map(f=>{const riverMissing=!!f.riverId&&!layer.edges.some(e=>e.id===f.riverId),lakeMissing=f.kind==="wetland"&&!!f.lakeId&&!layer.lakes?.some(l=>l.id===f.lakeId);return riverMissing||lakeMissing?{...f,riverId:riverMissing?null:f.riverId,...f.kind==="wetland"?{lakeId:lakeMissing?null:f.lakeId}:{},review:true}:f;})};
  if(layer.lakes){layer={...layer,lakes:layer.lakes.map(l=>{const inletNodeIds=l.inletNodeIds.filter(id=>layer.edges.some(e=>e.to===id)),outletNodeId=l.outletNodeId&&layer.edges.some(e=>e.from===l.outletNodeId)?l.outletNodeId:null;return {...l,inletNodeIds,outletNodeId,mode:outletNodeId?"outlet":"closed"};})};const ports=new Set(layer.lakes!.flatMap(l=>[...l.inletNodeIds,...l.outletNodeId?[l.outletNodeId]:[]]));layer={...layer,nodes:layer.nodes.map(n=>{if(!n.lakeId||ports.has(n.id))return n;const next={...n,kind:n.kind==="lake-outlet"?"source" as const:"open-end" as const,detached:true};delete next.lakeId;return next;})};}
  const ports=(layer.lakes??[]).flatMap(l=>[...l.inletNodeIds,...l.outletNodeId?[l.outletNodeId]:[]]),used=new Set([...ports,...layer.edges.flatMap(e=>[e.from,e.to])]),analyses=new Set([...layer.edges.flatMap(e=>e.analysisId?[e.analysisId]:[]),...(layer.lakes??[]).flatMap(l=>l.analysisId?[l.analysisId]:[]),...(layer.catchments??[]).map(c=>c.analysisId),...(layer.features??[]).flatMap(f=>f.analysisId?[f.analysisId]:[])]);
  const incoming=new Map<string,number>(),outgoing=new Map<string,number>();for(const e of layer.edges){incoming.set(e.to,(incoming.get(e.to)??0)+1);outgoing.set(e.from,(outgoing.get(e.from)??0)+1);}
  return {...layer,analyses:layer.analyses.filter(a=>analyses.has(a.id)),nodes:layer.nodes.filter(n=>used.has(n.id)).map(n=>({...n,kind:n.lakeId?n.kind:(outgoing.get(n.id)??0)>1?"branch":(incoming.get(n.id)??0)>1&&(outgoing.get(n.id)??0)>0?"confluence":!incoming.get(n.id)?"source":!outgoing.get(n.id)&&!["sea-outlet","boundary-outlet","closed-sink"].includes(n.kind)?"open-end":n.kind}))};
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
  for(let i=0;i<queue.length;i++){const edge=queue[i];if(selected.has(edge.id))continue;selected.set(edge.id,edge);queue.push(...(byFrom.get(edge.to)??[]));const lake=suggestion.lakes?.find(l=>l.inletNodeIds.includes(edge.to));if(lake?.outletNodeId)queue.push(...byFrom.get(lake.outletNodeId)??[]);}
  const nodes=new Map(base.nodes.map(n=>[n.id,n])),edges=new Map(base.edges.map(e=>[e.id,e]));
  for(const edge of selected.values()){
    const previous=edges.get(edge.id);if(previous?.protected)continue;
    for(const id of [edge.from,edge.to]){const proposed=suggestion.nodes.find(n=>n.id===id)!;const current=nodes.get(id);if(current&&!sameHydroPoint(current.point,proposed.point))throw Error("A suggested junction overlaps a creator-adjusted position. Keep the authored route and adjust or reject this suggestion.");if(!current)nodes.set(id,proposed);}
    edges.set(edge.id,edge);
  }
  const analyses=new Map([...base.analyses,...suggestion.analyses].map(a=>[a.id,a]));
  const lakes=new Map((base.lakes??[]).map(l=>[l.id,l]));for(const lake of suggestion.lakes??[]){if(edgeId&&!lake.inletNodeIds.some(id=>[...selected.values()].some(e=>e.to===id)))continue;if(lakes.get(lake.id)?.protected)continue;const previousLake=lakes.get(lake.id),outletNodeId=lake.outletNodeId??previousLake?.outletNodeId??null,next={...lake,outletNodeId,mode:outletNodeId?"outlet" as const:"closed" as const,review:lake.review||!!previousLake?.review,inletNodeIds:[...new Set([...lakes.get(lake.id)?.inletNodeIds??[],...lake.inletNodeIds])].filter(id=>[...edges.values()].some(e=>e.to===id))};lakes.set(lake.id,next);for(const id of [...next.inletNodeIds,...next.outletNodeId?[next.outletNodeId]:[]]){const n=suggestion.nodes.find(n=>n.id===id);if(n&&!nodes.has(id))nodes.set(id,n);}}
  return hydroLayerSchema.parse(pruneHydrology({...base,nodes:[...nodes.values()],edges:[...edges.values()],analyses:[...analyses.values()],...(base.systemVersion||suggestion.systemVersion?{systemVersion:base.systemVersion===3||suggestion.systemVersion===3?3 as const:2 as const,lakes:[...lakes.values()],catchments:base.catchments??[]}:{} )}));
}

export function moveHydroPoint(layer:HydroLayer,edgeId:string,index:number,point:HydroPoint):HydroLayer{
  const edge=layer.edges.find(e=>e.id===edgeId);if(!edge||index<0||index>=edge.points.length)return layer;
  const nodeId=index===0?edge.from:index===edge.points.length-1?edge.to:undefined,lakeId=layer.nodes.find(n=>n.id===nodeId)?.lakeId;
  return hydroLayerSchema.parse({...layer,...lakeId?{lakes:layer.lakes?.map(l=>l.id===lakeId?{...l,review:true,protected:true}:l)}:{},nodes:layer.nodes.map(n=>n.id===nodeId?{...n,point,elevationM:null,spillM:null}:n),edges:layer.edges.map(e=>{if(e.id!==edgeId&&e.from!==nodeId&&e.to!==nodeId)return e;const points=e.points.map((p,i)=>e.id===edgeId&&i===index||nodeId&&(i===0&&e.from===nodeId||i===e.points.length-1&&e.to===nodeId)?point:p);return {...e,points,flowKind:e.flowKind==="exception"?"exception":"manual",protected:true};})});
}
