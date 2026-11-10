import {z} from "zod";
import {nativeMapTargetSchema} from "./native-map-history";
import {yearSchema} from "./world-year";
import {townDesignSchema,validateTownDesign} from "./town-map";
import {floorDesignSchema,validateFloor} from "./building-floor";
import {undergroundDesignSchema,validateUnderground} from "./underground";
import {volcanoOperationSchema} from "./terrain-advanced-spec";
import {terrainSettingsSchema} from "./terrain";
import {regionFootprintSchema} from "./terrain-region-geometry";
import {terrainMaterialsSchema} from "./terrain-materials";
import {hydroLayerSchema} from "./terrain-hydrology";
import {environmentLayerSchema} from "./terrain-environment";
import {artworkLayerSchema} from "./terrain-artwork";
import {labelsLayerSchema} from "./terrain-labels";
import {mapAppearanceSchema} from "./terrain-appearance";
import {compositionSchema} from "./atlas-assets";

/** Internal saved-source interchange. This is neither a publication approval nor
 * a bearer capability. Every dereference requires current World authorization. */
export const ATLAS_CONSUMPTION = Object.freeze({schema:"serrian-atlas-map",version:1,projection:1,resources:512,manifestBytes:256*1024,resourceBytes:12*1024*1024,tileBatch:32});
const id=z.uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/),number=z.number().finite(),revision=z.number().int().nonnegative();
export const consumptionFrameSchema=z.object({x:number,y:number,width:number.positive(),height:number.positive(),rotation:number.min(-180).max(180)}).strict();
export const consumptionRequestSchema=z.object({target:nativeMapTargetSchema,timelineId:id,year:yearSchema,stateId:id,versionId:id,contractVersion:z.literal(2).optional()}).strict();
export type ConsumptionRequest=z.infer<typeof consumptionRequestSchema>;
const source=consumptionRequestSchema.extend({worldId:id}).strict();
export const consumptionPinSchema=z.object({schema:z.literal("serrian-atlas-map"),schemaVersion:z.union([z.literal(1),z.literal(2)]),projectionVersion:z.literal(1),source,sha256:hash}).strict();
export type ConsumptionPin=z.infer<typeof consumptionPinSchema>;
const tile=z.object({x:z.number().int().min(0).max(31),y:z.number().int().min(0).max(31),lod:z.number().int().min(0).max(5),sha256:hash,bytes:z.literal(2048),encoding:z.literal("i16le-v1")}).strict();
const local={width:number.positive(),height:number.positive()};
const featureFrame=z.object(local).strict();
const terrain=z.object({family:z.enum(["world","regional"]),settings:terrainSettingsSchema.extend({gridWidth:z.number().int().min(32).max(1024).multipleOf(32).default(640),gridHeight:z.number().int().min(32).max(1024).multipleOf(32).default(384)}),terrainId:id,revision,baseElevation:z.number().int().min(-30000).max(30000),seaLevel:number,tiles:z.array(tile).max(1024),region:z.object({parentMapId:id,frame:consumptionFrameSchema,footprint:regionFootprintSchema.nullable()}).strict().nullable()}).strict();
const town=z.object({family:z.literal("town"),frame:featureFrame,design:townDesignSchema}).strict();
const floor=z.object({family:z.literal("floor"),buildingId:id,frame:featureFrame,elevation:number.nullable(),order:z.number().int(),design:floorDesignSchema}).strict();
const underground=z.object({family:z.literal("underground"),siteId:id,frame:featureFrame,depth:z.string().max(120),order:z.number().int(),design:undergroundDesignSchema}).strict();
const craft=z.object({family:z.literal("craft"),frame:featureFrame,classification:z.string().max(80),outlineId:id.nullable(),plan:floorDesignSchema}).strict();
const deck=z.object({family:z.literal("deck"),craftId:id,frame:featureFrame,height:number.nullable(),order:z.number().int(),outlineId:id.nullable(),plan:floorDesignSchema}).strict();
export const consumptionGeometrySchema=z.discriminatedUnion("family",[terrain,town,floor,underground,craft,deck]);
export type ConsumptionGeometry=z.infer<typeof consumptionGeometrySchema>;
const numeric=z.object({kind:z.literal("numerical"),terrainId:id,sourceId:id,parentId:id.nullable(),parentRevision:revision.nullable(),revision,frame:consumptionFrameSchema,gridWidth:z.number().int().positive().max(1024),gridHeight:z.number().int().positive().max(1024),baseElevation:z.number().int().min(-30000).max(30000),tiles:z.array(tile).max(8192)}).strict();
const destination=z.object({target:nativeMapTargetSchema,versionId:id,geographyVersionId:id.nullable(),entranceId:id.nullable(),point:z.object({x:number,y:number}).strict()}).strict();
export const consumptionConnectionSchema=z.object({id,kind:z.enum(["entrance","floor-transition","craft-transition"]),twoWay:z.boolean(),source:destination,destination}).strict();

const consumptionResourceBase=z.discriminatedUnion("kind",[
 z.object({kind:z.literal("geometry"),value:consumptionGeometrySchema}).strict(),numeric,
 z.object({kind:z.literal("materials"),value:terrainMaterialsSchema}).strict(),
 z.object({kind:z.literal("hydrology"),value:hydroLayerSchema}).strict(),
 z.object({kind:z.literal("environment"),value:environmentLayerSchema}).strict(),
 z.object({kind:z.literal("artwork"),value:artworkLayerSchema}).strict(),
 z.object({kind:z.literal("labels"),value:labelsLayerSchema}).strict(),
 z.object({kind:z.literal("appearance"),value:mapAppearanceSchema.nullable()}).strict(),
 z.object({kind:z.literal("composition"),value:compositionSchema}).strict(),
 z.object({kind:z.literal("landforms"),value:z.array(z.object({id,revision,sourceId:id.nullable(),operation:volcanoOperationSchema}).strict()).max(64)}).strict(),
 z.object({kind:z.literal("connections"),target:nativeMapTargetSchema,value:z.array(consumptionConnectionSchema).max(4096)}).strict(),
 z.object({kind:z.literal("positions"),towns:z.array(z.object({id,townId:id,x:number,y:number,revision}).strict()).max(20000),crafts:z.array(z.object({craftId:id,x:number,y:number,rotation:number,revision}).strict()).max(512)}).strict(),
]);
function checkResource(resource:z.infer<typeof consumptionResourceBase>,ctx:z.RefinementCtx){
 try{
  if(resource.kind==="geometry"){
   const g=resource.value;
   if("settings" in g){if((g.family==="regional")!==!!g.region)throw Error("Preserve the actual regional boundary.");}
   else {const f={x:0,y:0,...g.frame,rotation:0};if(g.family==="town")validateTownDesign(g.design,f);else if(g.family==="underground")validateUnderground(g.design,f);else validateFloor("plan" in g?g.plan:g.design,f);}
   if("outlineId" in g&&g.outlineId&&!g.plan.features.some(f=>f.id===g.outlineId))throw Error("A retained craft outline must identify an included physical shape.");
  }
  if(resource.kind==="connections"){if(new Set(resource.value.map(c=>c.id)).size!==resource.value.length)throw Error("Retain each explicit connection once.");for(const c of resource.value)if(![c.source,c.destination].some(e=>e.target.kind===resource.target.kind&&e.target.id===resource.target.id))throw Error("A saved connection must attach to this map.");}
  const numerical=resource.kind==="numerical"?resource:resource.kind==="geometry"&&"tiles" in resource.value?resource.value:null;
  if(numerical){
   const width="settings" in numerical?numerical.settings.gridWidth:numerical.gridWidth,height="settings" in numerical?numerical.settings.gridHeight:numerical.gridHeight,seen=new Set<string>();
   for(const t of numerical.tiles){const key=`${t.lod}:${t.x}:${t.y}`;if(seen.has(key)||t.x>=Math.max(1,width/32/2**t.lod)||t.y>=Math.max(1,height/32/2**t.lod))throw Error("Numerical tile references must be distinct and inside their exact grid/LOD.");seen.add(key);}
  }
 }catch(error){ctx.addIssue({code:"custom",message:error instanceof Error?error.message:"Incompatible native geometry."});}
}
export const consumptionResourceSchema=consumptionResourceBase.superRefine(checkResource);
const expandedTile=tile.extend({x:z.number().int().min(0).max(127),y:z.number().int().min(0).max(127),lod:z.number().int().min(0).max(7)});
const expandedTerrain=terrain.extend({settings:terrainSettingsSchema,tiles:z.array(expandedTile).max(4096)});
const expandedGeometry=z.discriminatedUnion("family",[expandedTerrain,town,floor,underground,craft,deck]);
const expandedNumeric=numeric.extend({gridWidth:z.number().int().positive().max(4096),gridHeight:z.number().int().positive().max(4096),tiles:z.array(expandedTile).max(32768)});
export const expandedConsumptionResourceSchema=z.discriminatedUnion("kind",[z.object({kind:z.literal("geometry"),value:expandedGeometry}).strict(),expandedNumeric,...consumptionResourceBase.options.slice(2)]).superRefine(checkResource);
export function parseConsumptionResource(raw:unknown,version:1|2=1){const parsed=(version===2?expandedConsumptionResourceSchema:consumptionResourceSchema).safeParse(raw);if(!parsed.success)throw Error(version===1?"This saved numerical source requires Atlas contract version 2. Request that capability; no source was truncated or downsampled.":"This resource exceeds the verified Atlas version 2 numerical representation.");return parsed.data;}
export type ConsumptionResource=z.infer<typeof expandedConsumptionResourceSchema>;
const descriptor=z.object({key:z.string().regex(/^[a-z0-9:-]+$/).max(160),kind:z.enum(["geometry","numerical","materials","hydrology","environment","artwork","labels","appearance","composition","landforms","positions","connections"]),componentId:id,sourceSha256:hash,sha256:hash,bytes:z.number().int().positive().max(ATLAS_CONSUMPTION.resourceBytes)}).strict();
export const consumptionManifestSchema=z.object({
 schema:z.literal("serrian-atlas-map"),schemaVersion:z.union([z.literal(1),z.literal(2)]),projectionVersion:z.literal(1),
 stage:z.literal("accepted-saved"),publication:z.literal("not-published"),readOnly:z.literal(true),
 source,family:z.enum(["world","regional","town","floor","underground","craft","deck"]),sourceRevision:revision,
 history:z.object({originTimelineId:id,startYear:yearSchema,endYear:yearSchema,coverage:z.enum(["established","unknown"]),archived:z.boolean()}).strict(),
 coordinates:z.object({system:z.enum(["world-metres","local-metres"]),unit:z.literal("metre"),elevationUnit:z.literal("metre"),x:z.literal("right"),y:z.literal("down"),...local,wrapX:z.boolean(),sampleOrigin:z.literal("grid-node"),parent:z.object({target:nativeMapTargetSchema,versionId:id,mapping:z.enum(["identity","centre-rotation"]),frame:consumptionFrameSchema}).strict().nullable()}).strict(),
 provenance:z.object({kind:z.enum(["authored-world","canon-source","personal-variation"]),sourceWorldId:id.nullable(),sourceTimelineId:id.nullable(),sourceTarget:nativeMapTargetSchema.nullable(),sourceVersionId:id.nullable()}).strict(),
 resources:z.array(descriptor).min(1).max(ATLAS_CONSUMPTION.resources),connections:z.object({count:z.number().int().min(0).max(4096),resourceKey:z.literal("connections").nullable()}).strict(),
 records:z.array(z.object({kind:z.enum(["town","place","shop-location","building","craft"]),id,identityOnly:z.literal(true)}).strict()).max(4096),
 omissions:z.array(z.enum(["unavailable-parent","unavailable-connection","private-assets","unsupported-resource","no-publication-approval"])).max(5),
 pin:consumptionPinSchema,
}).strict().superRefine((v,c)=>{
 const issue=(message:string)=>c.addIssue({code:"custom",message});
 if(v.schemaVersion!==v.pin.schemaVersion||(v.schemaVersion===2)!==(v.source.contractVersion===2))issue("Select the explicit numerical contract capability belonging to this exact pin.");
 if(v.history.startYear>v.history.endYear)issue("Retain the actual historical interval.");
 if(v.history.coverage!==(!v.history.archived&&v.source.year>=v.history.startYear&&v.source.year<=v.history.endYear?"established":"unknown"))issue("Historical coverage must follow the exact retained source.");
 if(JSON.stringify(v.source)!==JSON.stringify(v.pin.source))issue("The pin belongs to this exact World, map, timeline, year and source.");
 if(new Set(v.resources.map(r=>r.key)).size!==v.resources.length||v.resources.filter(r=>r.key==="geometry"&&r.kind==="geometry").length!==1)issue("Retain distinct resources and exactly one family geometry.");
 if((v.connections.count>0)!==(v.connections.resourceKey!==null)||v.connections.resourceKey&&!v.resources.some(r=>r.key===v.connections.resourceKey&&r.kind==="connections"))issue("Retain the complete saved connections through their bounded resource.");
 if(v.source.target.kind==="terrain"?!["world","regional"].includes(v.family):v.source.target.kind!==v.family)issue("The native target and family must agree.");
 if((v.coordinates.system==="world-metres")!==["world","regional"].includes(v.family))issue("Native World/Region coordinates must not become local coordinates.");
 if(v.coordinates.parent&&v.family==="regional"&&v.coordinates.parent.mapping!=="identity")issue("Regions retain World coordinates without another translation.");

 if(new TextEncoder().encode(JSON.stringify(v)).length>ATLAS_CONSUMPTION.manifestBytes)issue("Use a bounded map manifest.");
});
export type ConsumptionManifest=z.infer<typeof consumptionManifestSchema>;
export type AtlasMapStateBoundary = {stage:"working";pinnable:false}|{stage:"accepted-saved";pin:ConsumptionPin}|{stage:"published-consumer";publicationId:string;approvalId:string;pin:ConsumptionPin};

/** Matches the existing Town/Floor centre rotation in physical metres. */
export function consumptionToParent(point:{x:number;y:number},frame:z.infer<typeof consumptionFrameSchema>,world?:{width:number;wrap:boolean}){
 const r=frame.rotation*Math.PI/180,dx=point.x-frame.width/2,dy=point.y-frame.height/2,x=frame.x+frame.width/2+dx*Math.cos(r)-dy*Math.sin(r);
 return {x:world?.wrap?((x%world.width)+world.width)%world.width:x,y:frame.y+frame.height/2+dx*Math.sin(r)+dy*Math.cos(r)};
}
