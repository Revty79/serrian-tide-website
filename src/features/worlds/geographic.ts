import { z } from "zod";

export const geoId = z.string().uuid();
const label = z.string().trim().min(1).max(160).regex(/^[^\u0000]*$/,"Text cannot contain a null character.");
const finite = z.number().finite().min(-1e12).max(1e12);
export const sourcePoint = z.tuple([finite, finite]);
// Bounded original sources may be larger than a display part. The unchanged
// four-MB database geometry bound and eight-MB atomic request still apply.
const line = z.array(sourcePoint).min(2).max(131072);
const ring = z.array(sourcePoint).min(4).max(131072);
const polygon = z.array(ring).min(1).max(64);
export const sourceGeometrySchema = z.discriminatedUnion("type", [
  z.object({type:z.literal("Point"),coordinates:sourcePoint}).strict(),
  z.object({type:z.literal("LineString"),coordinates:line}).strict(),
  z.object({type:z.literal("MultiLineString"),coordinates:z.array(line).min(1).max(512)}).strict(),
  z.object({type:z.literal("Polygon"),coordinates:polygon}).strict(),
  z.object({type:z.literal("MultiPolygon"),coordinates:z.array(polygon).min(1).max(512)}).strict(),
]);
export type SourceGeometry = z.infer<typeof sourceGeometrySchema>;
export type Coordinate = [number,number];
export const boundsSchema = z.tuple([finite,finite,finite,finite]);
export type GeographicBounds = z.infer<typeof boundsSchema>;
export const spatialReferenceSchema = z.discriminatedUnion("kind",[
  z.object({version:z.literal(1),kind:z.literal("sphere"),crs:z.enum(["EPSG:4326","AUTHORED:angular"]),units:z.literal("degrees")}).strict(),
  z.object({version:z.literal(1),kind:z.literal("plane"),crs:label,units:label,bounds:boundsSchema}).strict(),
]);
export type SpatialReference = z.infer<typeof spatialReferenceSchema>;
export type Surface = {id:string;name:string;reference:SpatialReference;realmId:string|null;protected:boolean};
const url=z.url().refine(value=>/^https?:\/\//.test(value),"Use a complete HTTP or HTTPS source URL.");
export const geographicLodSchema=z.enum(["overview","regional","detail"]);
export const geographicSemanticSchema=z.enum(["physical-geography","administrative-boundary","authored-geography"]);
export const geographicThemeSchema=z.enum(["land","administrative","rivers","inland-water","mountains","landscapes","marine","cities","authored"]);
export type GeographicTheme=z.infer<typeof geographicThemeSchema>;
export const geographicStyleSchema=z.enum(["land","outline","disputed","river","water","region","peak","city","marine"]);
export const sourceValidationSchema=z.object({retainCoincidentVertices:z.boolean().optional()}).strict();
export type SourceValidation=z.infer<typeof sourceValidationSchema>;
export const geographicDisplaySchema=z.object({lods:z.array(geographicLodSchema).min(1).max(3).refine(v=>new Set(v).size===v.length,"Detail bands must be unique."),priority:z.number().int().min(0).max(100),style:geographicStyleSchema,exact:z.boolean(),theme:geographicThemeSchema.optional(),labels:z.boolean().optional(),labelRank:z.number().int().min(0).max(100).optional()}).strict();
export const provenanceSchema = z.object({provider:label,dataset:label,edition:label,sourceUrl:url,license:label,licenseUrl:url,attribution:z.string().max(2000).regex(/^[^\u0000]*$/),attributionRequired:z.boolean(),fileSha256:z.string().regex(/^[a-f0-9]{64}$/),originalCrs:label,parameters:z.string().min(1).max(4000).regex(/^[^\u0000]*$/),display:geographicDisplaySchema.optional(),validation:sourceValidationSchema.optional()}).strict().refine(p=>!p.attributionRequired||p.attribution.trim().length>0,"Include the attribution required by this dataset license.");
export type GeographicProvenance = z.infer<typeof provenanceSchema>;
export const authoredProvenanceSchema=z.object({kind:z.literal("creator-authored"),creatorId:z.string().min(1),title:z.string().min(1).max(160),account:z.string().min(1).max(4000),originalCrs:z.string().min(1),display:geographicDisplaySchema}).strict();
export type StoredGeographicProvenance=GeographicProvenance|z.infer<typeof authoredProvenanceSchema>;
export function isAuthoredProvenance(source:StoredGeographicProvenance):source is z.infer<typeof authoredProvenanceSchema>{return "kind"in source&&source.kind==="creator-authored";}
export function geographicProvenanceLabel(source:StoredGeographicProvenance){return isAuthoredProvenance(source)?`Creator-authored geography: ${source.title}`:`${source.provider} · ${source.dataset} · ${source.edition}`;}

export const importRecordSchema=z.object({externalId:z.string().trim().min(1).max(200).regex(/^[^\u0000]*$/),name:label,semantic:z.enum(["physical-geography","administrative-boundary","authored-geography"]),context:z.enum(["place","region","settlement"]).optional(),geographyId:geoId.optional(),parentId:geoId.nullable().optional(),geometry:sourceGeometrySchema,properties:z.record(z.string().max(100).regex(/^[^\u0000]*$/),z.union([z.string().max(4000).regex(/^[^\u0000]*$/),z.number().finite(),z.boolean(),z.null()])).default({}),protected:z.boolean().default(false)}).strict();
export const sourceImportSchema=z.object({version:z.literal(1),provenance:provenanceSchema,records:z.array(importRecordSchema).min(1).max(32)}).strict();
export type SourceImport = z.infer<typeof sourceImportSchema>;
export const geographicCommandSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("surface"),requestId:geoId,name:label,reference:spatialReferenceSchema,realmId:geoId.nullable(),timelineId:geoId,protected:z.boolean()}).strict(),
  z.object({action:z.literal("import"),surfaceId:geoId,mapId:geoId,timelineId:geoId,source:sourceImportSchema}).strict(),
  z.object({action:z.literal("revise"),requestId:geoId,featureId:geoId,revision:z.number().int().positive(),geometry:sourceGeometrySchema,note:z.string().trim().min(1).max(4000).regex(/^[^\u0000]*$/),protected:z.boolean()}).strict(),
  z.object({action:z.enum(["archive","restore"]),requestId:geoId,featureId:geoId,revision:z.number().int().positive()}).strict(),
]);
export type GeographicCommand=z.infer<typeof geographicCommandSchema>;
export type GeographicLayer={mapId:string;mapName:string;surface:Surface};
export type GeographicCatalog={canEdit:boolean;layers:GeographicLayer[];surfaces:Surface[];maps:{id:string;name:string}[];realms:{id:string;name:string}[];nextOffset:number|null};
export type GeographicShape={id:string;versionId:string;geographyId:string;name:string;semantic:string;revision:number;part:number;geometryType:SourceGeometry["type"];path:string;displayTolerance?:number;sourceBounds:GeographicBounds;style?:z.infer<typeof geographicStyleSchema>;theme?:GeographicTheme;label?:{x:number;y:number;rank:number;weight?:number}};
export type GeographicViewport={readerId?:string;previewReader?:string;layer:GeographicLayer;canEdit:boolean;context:string;bounds:GeographicBounds;projection:"equirectangular"|"mercator"|"planar";lod:"overview"|"regional"|"detail";shapes:GeographicShape[];attributions:{label:string;license:string;url:string}[];nextCursor:string|null};
export type GeographicViewportStatus=Pick<GeographicViewport,"readerId"|"layer"|"canEdit"|"context">;
/** Reuse paths only after fresh authorization of this reader and all eligible heads. */
export function sameGeographicViewport(view:GeographicViewport,status:GeographicViewportStatus){
 return !!view.readerId&&view.readerId===status.readerId&&view.context===status.context&&view.canEdit===status.canEdit&&view.layer.mapId===status.layer.mapId&&JSON.stringify(view.layer.surface)===JSON.stringify(status.layer.surface);
}
export type GeographicReading={id:string;geographyId:string;name:string;semantic:string;revision:number;versionId:string;geometry:SourceGeometry;bounds:GeographicBounds;protected:boolean;archived:boolean;note:string;createdAt:string;source:StoredGeographicProvenance|null;importedAt:string;contentSha256:string;versions:{id:string;revision:number;createdAt:string;archived:boolean}[];properties:Record<string,string|number|boolean|null>;canEdit:boolean};
export function surfaceBounds(reference:SpatialReference):GeographicBounds{return reference.kind==="sphere"?[-180,-90,180,90]:reference.bounds;}
export function automaticGeographicDetail(bounds:GeographicBounds,reference:SpatialReference):GeographicViewport["lod"]{const domain=surfaceBounds(reference),width=bounds[0]>bounds[2]?360-bounds[0]+bounds[2]:bounds[2]-bounds[0],ratio=width/(domain[2]-domain[0]);return ratio>=.3?"overview":ratio>=.04?"regional":"detail";}
export function focusedGeographicExtent(bounds:GeographicBounds,reference:SpatialReference):GeographicBounds{const d=surfaceBounds(reference),width=bounds[0]>bounds[2]?360-bounds[0]+bounds[2]:bounds[2]-bounds[0],height=bounds[3]-bounds[1],pad=Math.max(width>=360?height:width,height,.5)*.15,south=Math.max(d[1],bounds[1]-pad),north=Math.min(d[3],bounds[3]+pad);return reference.kind==="sphere"?width+2*pad>=360?[-180,south,180,north]:[wrapLongitude(bounds[0]-pad),south,wrapLongitude(bounds[2]+pad),north]:[Math.max(d[0],bounds[0]-pad),south,Math.min(d[2],bounds[2]+pad),north];}
export function wrapLongitude(value:number){return ((value+180)%360+360)%360-180;}
export function validateReference(reference:SpatialReference){if(reference.kind==="plane"&&(reference.bounds[0]>=reference.bounds[2]||reference.bounds[1]>=reference.bounds[3]||reference.crs.startsWith("EPSG:")))throw new Error("Use increasing planar bounds and an author-defined reference name, such as AUTHORED:archipelago.");}
export function validateViewport(bounds:GeographicBounds,reference:SpatialReference){const domain=surfaceBounds(reference);if(bounds[1]>=bounds[3]||bounds[0]===bounds[2]||bounds.some((value,i)=>value<domain[i%2]||value>domain[i%2+2])||(reference.kind==="plane"&&bounds[0]>bounds[2]))throw new Error("Choose a nonempty extent inside this surface. Only spherical longitude may cross a wrapping edge.");}
export function splitExtent(bounds:GeographicBounds):GeographicBounds[]{return bounds[0]>bounds[2]?[[bounds[0],bounds[1],180,bounds[3]],[-180,bounds[1],bounds[2],bounds[3]]]:[bounds];}
export function visitCoordinates(geometry:SourceGeometry,visit:(p:Coordinate)=>void){function walk(value:unknown){if(Array.isArray(value)&&typeof value[0]==="number")visit(value as Coordinate);else if(Array.isArray(value))value.forEach(walk);}walk(geometry.coordinates);}
export function geometryParts(geometry:SourceGeometry):SourceGeometry[]{if(geometry.type==="MultiPolygon")return geometry.coordinates.map(coordinates=>({type:"Polygon",coordinates}));if(geometry.type==="MultiLineString")return geometry.coordinates.map(coordinates=>({type:"LineString",coordinates}));return [geometry];}
export function coordinateCount(geometry:SourceGeometry){let count=0;visitCoordinates(geometry,()=>count++);return count;}
export function atlasPolygonToSource(points:{x:number;y:number}[]):SourceGeometry {if(points.length<3)throw new Error("Choose a saved polygon with at least three points.");const coordinates=points.map(p=>[p.x,p.y] as Coordinate);return {type:"Polygon",coordinates:[[...coordinates,coordinates[0]]]};}

/** Compare validated coordinate references independent of JSONB property order. */
export function sameSpatialReference(a:SpatialReference,b:SpatialReference){return JSON.stringify(spatialReferenceSchema.parse(a))===JSON.stringify(spatialReferenceSchema.parse(b));}
