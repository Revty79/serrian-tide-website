import { z } from "zod";
import { acceptSavedHistory, mapDraftSchema, validateMapDraft, type EditingHistory, type MapDraft } from "./atlas";
import { assetReferenceSchema, islandAsset } from "./island-assets";
import { boundsSchema, sourcePoint, spatialReferenceSchema, geographicThemeSchema } from "./geographic";
import { geographicRecipeSchema, generationSaveSchema } from "./geographic-generation";
import { AUTHORING_LIMITS, geographicRingCount, geographicVertexCount } from "./geographic-authoring-geometry";
import { rasterCommandSchema, rasterPreferencesSchema } from "./raster";
import { categoricalCommandSchema, categoricalPreferencesSchema } from "./categorical-raster";

export const ISLAND_RECOVERY_BYTES=4*1024*1024;
const id=z.string().uuid(),revision=z.number().int().positive(),text=(max:number)=>z.string().max(max).regex(/^[^\u0000]*$/),number=z.number().finite().min(-1e12).max(1e12);
export const recoveryContextSchema=z.object({userId:text(200).min(1),worldId:id,mapId:id,timelineId:id,scope:z.literal("shared-baseline")}).strict();
export type IslandRecoveryContext=z.infer<typeof recoveryContextSchema>;
export const recoveryBrushSchema=z.object({radius:number,spacing:number,density:number,terrain:z.enum(["mountains","hills","valleys","forest","grassland","desert","wetland","snow","lake"]),path:z.enum(["river","stream","road","trail"]),width:number,curve:number,symbol:z.enum(["mountain","pine","village","city","castle","tower","ruin","port"]),scale:number,rotation:number,text:text(160),labelSize:number,labelStyle:z.enum(["place","region","water"]),symbolStyle:z.enum(["colored","ink"]),assetRefs:z.array(assetReferenceSchema).max(4),assetSeed:number,placeName:text(160),autoLabel:z.boolean()}).strict();
const recoveryMapDraftSchema:z.ZodType<MapDraft>=mapDraftSchema;
const vertex=z.object({id,x:number.min(0).max(2000),y:number.min(0).max(1200)}).strict();
export const artworkRecoverySchema=z.object({baseRevision:revision,draft:recoveryMapDraftSchema,tool:z.enum(["select","draw","trace","sculpt","paint","path","symbol","label","marker","pan","edit","move"]),brush:recoveryBrushSchema,unfinished:z.object({points:z.array(vertex).max(256),redo:z.array(vertex).max(256),kind:z.enum(["continent","island"]),existingId:id.or(z.literal(""))}).strict()}).strict();
const ring=z.object({points:z.array(sourcePoint).max(256),complete:z.boolean(),original:z.array(sourcePoint).max(256).nullable()}).strict();
export const sourceDraftRecoverySchema=z.object({kind:z.enum(["island","landmass","river"]),type:z.enum(["Polygon","MultiPolygon","LineString"]),components:z.array(z.object({rings:z.array(ring).min(1).max(9)}).strict()).min(1).max(8),name:text(160),note:text(4000),protected:z.boolean()}).strict().superRefine((draft,c)=>{
  if(geographicRingCount(draft)>AUTHORING_LIMITS.rings||geographicVertexCount(draft)>AUTHORING_LIMITS.vertices)c.addIssue({code:"custom",message:"This geographic recovery exceeds the visual editor's retained limits."});
  if(draft.type!=="MultiPolygon"&&draft.components.length!==1||draft.type==="LineString"&&draft.components[0].rings.length!==1)c.addIssue({code:"custom",message:"Keep the original geographic component/ring structure."});
});
export const sourceRecoverySchema=z.object({surfaceId:id,sourceId:id.nullable(),baseRevision:revision.nullable(),baseVersionId:id.nullable(),requestId:id,reference:spatialReferenceSchema,draft:sourceDraftRecoverySchema,component:z.number().int().min(0).max(7),ring:z.number().int().min(0).max(8),vertex:z.number().int().min(-1).max(255),acknowledgeImported:z.boolean(),retryPending:z.boolean().optional()}).strict().refine(s=>!!s.sourceId===!!s.baseRevision&&!!s.sourceId===!!s.baseVersionId,"Existing sources need their exact saved revision and version identity.");
export const setupRecoverySchema=z.object({requestId:id,fields:z.object({name:text(160),kind:z.enum(["plane","sphere"]),units:text(160),west:text(100),south:text(100),east:text(100),north:text(100),realmId:id.or(z.literal("")),protected:z.boolean(),existing:id.or(z.literal(""))}).strict()}).strict();
// Empty numeric controls have an explicit wire representation, rather than JSON's lossy NaN -> null.
const draftNumber=number.or(z.literal(""));
export const generationRecoverySchema=z.object({surfaceId:id,fields:z.object({seed:text(64),settings:z.object({continents:draftNumber,islands:draftNumber,landCoverage:draftNumber,complexity:draftNumber,size:z.enum(["small","medium","large","varied"]),shape:z.enum(["balanced","elongated","crescent","varied"])}).strict(),extent:z.array(text(100)).length(4),name:text(120),note:text(2000),protected:z.boolean()}).strict(),preview:z.object({recipe:geographicRecipeSchema,context:z.string().regex(/^[a-f0-9]{64}$/),digest:z.string().regex(/^[a-f0-9]{64}$/),requestId:id}).strict().nullable(),attempt:generationSaveSchema.nullable()}).strict();
const rasterBase={sourceId:id,versionId:id,baseRevision:revision,viewRevision:revision,requestId:id,note:text(4000),protected:z.boolean().nullable()};
export const elevationRecoverySchema=z.object({...rasterBase,preferences:rasterPreferencesSchema.nullable(),attempts:z.array(rasterCommandSchema).max(2)}).strict();
export const landCoverRecoverySchema=z.object({...rasterBase,preferences:categoricalPreferencesSchema.nullable(),attempts:z.array(categoricalCommandSchema).max(2)}).strict();
export const recoveryViewSchema=z.object({surfaceId:id.nullable(),bounds:boundsSchema.nullable(),projection:z.enum(["planar","equirectangular","mercator"]),themes:z.array(geographicThemeSchema).max(9),labels:z.boolean(),artworkView:z.object({x:number,y:number,width:number.min(250).max(8000),height:number.min(150).max(4800)}).strict().optional(),tool:artworkRecoverySchema.shape.tool.optional(),brush:recoveryBrushSchema.optional(),selectedId:id.nullable().optional(),vertexId:id.nullable().optional()}).strict();
const domainsSchema=z.object({artwork:artworkRecoverySchema.optional(),source:sourceRecoverySchema.optional(),setup:setupRecoverySchema.optional(),generation:generationRecoverySchema.optional(),elevation:elevationRecoverySchema.optional(),landCover:landCoverRecoverySchema.optional()}).strict();
export type IslandRecoveryDomains=z.infer<typeof domainsSchema>;
export type ArtworkRecovery=z.infer<typeof artworkRecoverySchema>;
export type SourceRecovery=z.infer<typeof sourceRecoverySchema>;
export type SetupRecovery=z.infer<typeof setupRecoverySchema>;
export type GenerationRecovery=z.infer<typeof generationRecoverySchema>;
export type ElevationRecovery=z.infer<typeof elevationRecoverySchema>;
export type LandCoverRecovery=z.infer<typeof landCoverRecoverySchema>;
export type RecoveryView=z.infer<typeof recoveryViewSchema>;
const envelopeSchema=z.object({format:z.literal("serrian-atlas-island-recovery"),version:z.literal(1),context:recoveryContextSchema,createdAt:z.string().datetime(),view:recoveryViewSchema,domains:domainsSchema}).strict();
export type IslandRecoveryBundle={format:"serrian-atlas-island-recovery";version:1;context:IslandRecoveryContext;createdAt:string;view:RecoveryView;domains:IslandRecoveryDomains};
export function validateIslandRecovery(value:unknown,context:IslandRecoveryContext):IslandRecoveryBundle{
  const data=envelopeSchema.parse(value);
  if(JSON.stringify(data.context)!==JSON.stringify(recoveryContextSchema.parse(context)))throw new Error("This recovery belongs to a different signed-in user, World, map, timeline or viewing context. Open its original live owned context; nothing was restored.");
  if(data.domains.artwork&&["settlementState","settlementShapes","settlementEntities","interiorState","interiorShapes","interiorEntities","interiorLinks","dungeonState","dungeonShapes","dungeonEntities","dungeonLinks"].some(key=>Object.hasOwn(data.domains.artwork!.draft,key)))throw new Error("This generic-map recovery cannot restore a specialized settlement, interior or dungeon source format.");
  if(data.domains.artwork){validateMapDraft(data.domains.artwork.draft as MapDraft);for(const ref of data.domains.artwork.brush.assetRefs)islandAsset(ref);}
  for(const ref of data.view.brush?.assetRefs??[])islandAsset(ref);
  if(data.domains.generation?.attempt){const a=data.domains.generation.attempt;if(a.mapId!==context.mapId||a.timelineId!==context.timelineId||a.surfaceId!==data.domains.generation.surfaceId)throw new Error("The retained generation request does not match this map, timeline and surface.");}
  for(const raster of [data.domains.elevation,data.domains.landCover])if(raster){if(new Set(raster.attempts.map(a=>a.action)).size!==raster.attempts.length)throw new Error("Retain at most one pending request per presentation/source action.");for(const attempt of raster.attempts)if(attempt.mapId!==context.mapId||attempt.timelineId!==context.timelineId||attempt.sourceId!==raster.sourceId)throw new Error("A retained presentation request belongs to a different map, timeline or source.");}
  const generation=data.domains.generation;
  if(generation?.attempt){const a=generation.attempt,f=generation.fields,p=generation.preview;if(p&&(p.requestId!==a.requestId||p.context!==a.expectedContext||p.digest!==a.outputDigest||JSON.stringify(p.recipe)!==JSON.stringify(a.recipe)))throw new Error("The retained generation preview and pending request disagree. Nothing was staged.");if(f.seed.trim()!==a.recipe.seed||JSON.stringify(f.settings)!==JSON.stringify(a.recipe.settings)||f.extent.some((v,i)=>!v.trim()||Number(v)!==a.recipe.extent[i])||f.name.trim()!==a.name||f.note.trim()!==a.note||f.protected!==a.protected)throw new Error("The generation fields disagree with their retained pending request. Nothing was staged.");}
  for(const raster of [data.domains.elevation,data.domains.landCover])if(raster)for(const a of raster.attempts){if(a.action==="preferences"){if(a.revision!==raster.viewRevision||JSON.stringify(a.preferences)!==JSON.stringify(raster.preferences))throw new Error("Presentation fields disagree with their retained pending request. Nothing was staged.");}else if(a.revision!==raster.baseRevision||a.requestId!==raster.requestId||raster.note.trim()&&a.note!==raster.note.trim()||raster.protected!==null&&a.protected!==raster.protected)throw new Error("Source revision fields disagree with their retained pending request. Nothing was staged.");}
  return data;
}
export function encodeIslandRecovery(bundle:IslandRecoveryBundle){const text=JSON.stringify(validateIslandRecovery(bundle,bundle.context));if(new TextEncoder().encode(text).byteLength>ISLAND_RECOVERY_BYTES)throw new Error("This recovery exceeds the 4-MiB envelope. Your live draft is retained; reduce the included domains or download them separately.");return text;}
export function decodeIslandRecovery(text:string,context:IslandRecoveryContext){if(new TextEncoder().encode(text).byteLength>ISLAND_RECOVERY_BYTES)throw new Error("This file exceeds the 4-MiB recovery limit. The live draft is unchanged.");return validateIslandRecovery(JSON.parse(text),context);}
export const islandRecoveryKey=(c:IslandRecoveryContext)=>`serrian-atlas-island-recovery:v1:${encodeURIComponent(c.userId)}:${c.worldId}:${c.mapId}:${c.timelineId}`;

/** Align CAS metadata and retained identities without substituting the saved artwork. */
export function rebaseRecoveredArtwork(history:EditingHistory,latest:MapDraft):EditingHistory{
  const aligned=acceptSavedHistory({...history,past:[...history.past,history.present]},latest);
  return {...aligned,present:aligned.past.at(-1)!,past:aligned.past.slice(0,-1)};
}
