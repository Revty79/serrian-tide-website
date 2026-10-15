import { z } from "zod";
import { boundsSchema, geoId, splitExtent, type GeographicBounds, type SpatialReference } from "./geographic";

export const RASTER_TILE_SIZE=256,RASTER_VIEW_TILES=16,RASTER_ALGORITHM=1;
export const rasterStyleSchema=z.enum(["shaded","tint"]);
export const rasterPreferencesSchema=z.object({visible:z.boolean(),style:rasterStyleSchema,opacity:z.number().min(.2).max(1)}).strict();
export type RasterPreferences=z.infer<typeof rasterPreferencesSchema>;
export const DEFAULT_RASTER_PREFERENCES:RasterPreferences={visible:true,style:"shaded",opacity:.85};
const digest=z.string().regex(/^[a-f0-9]{64}$/);
export const rasterGridSchema=z.object({width:z.number().int().positive().max(100000),height:z.number().int().positive().max(100000),bounds:boundsSchema,registration:z.literal("area"),horizontalReference:z.string().min(1).max(300),units:z.string().min(1).max(100),verticalReference:z.string().min(1).max(300),noData:z.number().finite().nullable(),encoding:z.enum(["geotiff","float32-le"]),horizontalScale:z.object({x:z.number().positive(),y:z.number().positive(),latitudeAdjusted:z.boolean()}).strict()}).strict().refine(g=>g.bounds[0]<g.bounds[2]&&g.bounds[1]<g.bounds[3],"Raster grids need increasing original bounds.");
export type RasterGrid=z.infer<typeof rasterGridSchema>;
export const rasterAssetSchema=z.object({key:z.string().regex(/^(source|numerical|shaded|tint)\/[a-zA-Z0-9_.\/-]+$/).max(200),sha256:digest,bytes:z.number().int().positive().max(1_073_741_824),kind:z.enum(["source","numerical","shaded","tint"])}).strict();
export type RasterAsset=z.infer<typeof rasterAssetSchema>;
export const rasterManifestSchema=z.object({version:z.literal(1),algorithm:z.literal(RASTER_ALGORITHM),name:z.string().min(1).max(160),externalId:z.string().min(1).max(200),grid:rasterGridSchema,source:z.object({provider:z.string().min(1).max(160),dataset:z.string().min(1).max(200),edition:z.string().min(1).max(160),url:z.string().url().max(2000),license:z.string().min(1).max(300),licenseUrl:z.string().url().max(2000),attribution:z.string().min(1).max(2000),sha256:digest,interpretation:z.string().min(1).max(2000)}).strict(),levels:z.array(z.object({factor:z.number().int().positive().max(100000),width:z.number().int().positive(),height:z.number().int().positive(),method:z.enum(["original","box-mean-nodata-propagated"])}).strict()).min(1).max(20),assets:z.array(rasterAssetSchema).min(1).max(20000),statistics:z.object({validCells:z.number().int().nonnegative(),noDataCells:z.number().int().nonnegative(),minimum:z.number().finite(),maximum:z.number().finite(),nativeValuesSha256:digest}).strict()}).strict().superRefine((m,c)=>{
  const keys=new Set(m.assets.map(a=>a.key));if(keys.size!==m.assets.length)c.addIssue({code:"custom",message:"Asset identities must be unique."});
  let expected=1;
  for(const level of m.levels)for(let y=0;y<Math.ceil(level.height/256);y++)for(let x=0;x<Math.ceil(level.width/256);x++){
    for(const style of ["shaded","tint"]){expected++;if(!keys.has(`${style}/${level.factor}/${x}-${y}.webp`))c.addIssue({code:"custom",message:"Every declared level needs complete relief imagery."});}
    if(level.factor>1){expected++;if(!keys.has(`numerical/${level.factor}/${x}-${y}.f32.gz`))c.addIssue({code:"custom",message:"Every derived level needs its retained numerical cells."});}
  }
  if(expected!==m.assets.length)c.addIssue({code:"custom",message:"The asset inventory must exactly cover its declared levels."});
  if(m.assets.filter(a=>a.kind==="source").length!==1)c.addIssue({code:"custom",message:"Retain one original numerical source."});
  if(m.assets.find(a=>a.kind==="source")?.sha256!==m.source.sha256)c.addIssue({code:"custom",message:"Original source checksum does not match."});
  const factors=m.levels.map(l=>l.factor);if(factors[0]!==1||new Set(factors).size!==factors.length||factors.some((f,i)=>i>0&&f<=factors[i-1]))c.addIssue({code:"custom",message:"Numerical levels must start at the original and become coarser."});
  for(const level of m.levels){if(level.width!==Math.ceil(m.grid.width/level.factor)||level.height!==Math.ceil(m.grid.height/level.factor))c.addIssue({code:"custom",message:"Level dimensions do not match original pixel registration."});}
  if(m.statistics.validCells+m.statistics.noDataCells!==m.grid.width*m.grid.height)c.addIssue({code:"custom",message:"Every original cell must be accounted for."});
});
export type RasterManifest=z.infer<typeof rasterManifestSchema>;
export type RasterLevel=RasterManifest["levels"][number];
export type RasterTile={x:number;y:number;width:number;height:number;key:string};
export type RasterView={previewReader?:string;sourceId:string;versionId:string;revision:number;viewRevision:number;stamp:string;name:string;grid:RasterGrid;level:RasterLevel;tiles:RasterTile[];preferences:RasterPreferences;canEdit:boolean;credit:RasterManifest["source"];versions:{id:string;revision:number;protected:boolean;archived:boolean}[];protected:boolean;archived:boolean;statistics:RasterManifest["statistics"]};
export const rasterCommandSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("preferences"),mapId:geoId,timelineId:geoId,sourceId:geoId,revision:z.number().int().positive(),preferences:rasterPreferencesSchema}).strict(),
  z.object({action:z.literal("revise"),mapId:geoId,timelineId:geoId,sourceId:geoId,revision:z.number().int().positive(),requestId:geoId,note:z.string().trim().min(1).max(4000),protected:z.boolean(),archived:z.boolean()}).strict(),
]);
export function rasterTilePlan<L extends Pick<RasterLevel,"factor"|"width"|"height">>(grid:Pick<RasterGrid,"bounds"|"width"|"height">,levels:L[],extent:GeographicBounds,style:z.infer<typeof rasterStyleSchema>|"classification"):{level:L;tiles:RasterTile[]}{
  for(const level of levels){const tiles=new Map<string,RasterTile>(),[west,south,east,north]=grid.bounds;
    for(const e of splitExtent(extent)){const a=Math.max(west,e[0]),b=Math.max(south,e[1]),c=Math.min(east,e[2]),d=Math.min(north,e[3]);if(a>=c||b>=d)continue;
      const firstX=Math.floor((a-west)/(east-west)*grid.width/level.factor/256),lastX=Math.min(Math.ceil(level.width/256)-1,Math.ceil((c-west)/(east-west)*grid.width/level.factor/256)-1),firstY=Math.floor((north-d)/(north-south)*grid.height/level.factor/256),lastY=Math.min(Math.ceil(level.height/256)-1,Math.ceil((north-b)/(north-south)*grid.height/level.factor/256)-1);
      for(let y=firstY;y<=lastY;y++)for(let x=firstX;x<=lastX;x++){const key=`${style}/${level.factor}/${x}-${y}.${style==="classification"?"png":"webp"}`;tiles.set(key,{x,y,width:Math.min(256,level.width-x*256),height:Math.min(256,level.height-y*256),key});if(tiles.size>RASTER_VIEW_TILES)break;}
    }
    if(tiles.size<=RASTER_VIEW_TILES)return {level,tiles:[...tiles.values()]};
  }
  throw new Error("Zoom closer to read this raster within the bounded tile budget.");
}
export function rasterPixel(grid:Pick<RasterGrid,"bounds"|"width"|"height">,x:number,y:number){const [w,s,e,n]=grid.bounds;if(x<w||x>e||y<s||y>n)return null;return {column:Math.min(grid.width-1,Math.floor((x-w)/(e-w)*grid.width)),row:Math.min(grid.height-1,Math.floor((n-y)/(n-s)*grid.height))};}
export function validateRasterReference(grid:Pick<RasterGrid,"bounds"|"horizontalReference">&Partial<Pick<RasterGrid,"horizontalScale">>,reference:SpatialReference){if(grid.horizontalReference!==reference.crs)throw new Error("The raster coordinate reference does not match this original surface.");const b=reference.kind==="plane"?reference.bounds:[-180,-90,180,90];if(grid.bounds[0]<b[0]||grid.bounds[1]<b[1]||grid.bounds[2]>b[2]||grid.bounds[3]>b[3])throw new Error("The raster lies outside this original coordinate surface.");if(grid.horizontalScale?.latitudeAdjusted&&reference.kind!=="sphere")throw new Error("Latitude adjustment belongs to an explicitly angular surface.");}

// Scientific elevation stops, shared with the semantic legend variables. They
// describe numerical heights, rather than a page-specific appearance palette.
export const ELEVATION_STOPS:[number,[number,number,number]][]=[[-11000,[15,37,73]],[-6000,[35,77,116]],[-2000,[64,122,150]],[0,[151,194,196]],[1,[113,148,113]],[500,[158,168,119]],[2000,[174,152,119]],[4000,[165,141,124]],[6000,[209,201,190]],[9000,[246,245,238]]];
export function elevationColor(value:number):[number,number,number]{for(let i=1;i<ELEVATION_STOPS.length;i++){const [height,color]=ELEVATION_STOPS[i],[previous,a]=ELEVATION_STOPS[i-1];if(value<=height){const t=Math.max(0,(value-previous)/(height-previous));return a.map((v,j)=>Math.round(v+(color[j]-v)*t)) as [number,number,number];}}return ELEVATION_STOPS.at(-1)![1];}
