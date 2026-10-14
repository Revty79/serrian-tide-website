import {z} from "zod";
import {boundsSchema,geoId,type SpatialReference} from "./geographic";

export const CATEGORICAL_TILE_SIZE=256,CATEGORICAL_ALGORITHM=1;
const checksum=z.string().regex(/^[a-f0-9]{64}$/),text=z.string().min(1).max(2000);
export const categoricalClassSchema=z.object({code:z.number().int().min(0).max(255),name:z.string().min(1).max(160),definition:text,color:z.tuple([z.number().int().min(0).max(255),z.number().int().min(0).max(255),z.number().int().min(0).max(255)]),status:z.enum(["classified","uncertain"])}).strict();
export type CategoricalClass=z.infer<typeof categoricalClassSchema>;
export const categoricalGridSchema=z.object({width:z.number().int().positive().max(100000),height:z.number().int().positive().max(100000),bounds:boundsSchema,registration:z.literal("area"),horizontalReference:z.string().min(1).max(300),noData:z.number().int().min(0).max(255),encoding:z.literal("categorical-u8-tiles"),sourceTileSize:z.number().int().positive().max(2048)}).strict().refine(g=>g.bounds[0]<g.bounds[2]&&g.bounds[1]<g.bounds[3],"Use increasing original classification bounds.");
export type CategoricalGrid=z.infer<typeof categoricalGridSchema>;
export const categoricalPreferencesSchema=z.object({visible:z.boolean(),opacity:z.number().min(.05).max(.8)}).strict();
export type CategoricalPreferences=z.infer<typeof categoricalPreferencesSchema>;
export const DEFAULT_CATEGORICAL_PREFERENCES:CategoricalPreferences={visible:true,opacity:.45};
export const categoricalAssetSchema=z.object({key:z.string().regex(/^(source|classification)\/[a-zA-Z0-9_.\/-]+$/).max(200),sha256:checksum,bytes:z.number().int().positive().max(268435456),kind:z.enum(["source","classification"])}).strict();
export const categoricalTileSourceSchema=z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative(),width:z.number().int().positive().max(2048),height:z.number().int().positive().max(2048),key:z.string().regex(/^source\/tiles\/[a-zA-Z0-9_-]+\.u8\.gz$/),valuesSha256:checksum,providerUrl:z.string().url().max(2000).optional(),providerObjectBytes:z.number().int().positive().optional(),providerETag:z.string().min(1).max(100).optional(),providerImage:z.number().int().nonnegative().optional()}).strict();
export type CategoricalTileSource=z.infer<typeof categoricalTileSourceSchema>;
export const categoricalManifestSchema=z.object({version:z.literal(2),semantics:z.literal("categorical"),algorithm:z.literal(CATEGORICAL_ALGORITHM),name:z.string().min(1).max(160),externalId:z.string().min(1).max(200),grid:categoricalGridSchema,classes:z.array(categoricalClassSchema).min(1).max(64),source:z.object({provider:z.string().min(1).max(160),dataset:z.string().min(1).max(200),edition:z.string().min(1).max(160),url:z.string().url().max(2000),license:z.string().min(1).max(300),licenseUrl:z.string().url().max(2000),attribution:text,sha256:checksum,observationPeriod:text,resolution:text,interpretation:text}).strict(),originalTiles:z.array(categoricalTileSourceSchema).min(1).max(10000),levels:z.array(z.object({factor:z.number().int().positive().max(100000),width:z.number().int().positive(),height:z.number().int().positive(),method:z.enum(["original-categorical","area-mode-with-nodata"])}).strict()).min(1).max(20),assets:z.array(categoricalAssetSchema).min(2).max(100000),statistics:z.object({validCells:z.number().int().nonnegative(),noDataCells:z.number().int().nonnegative(),classCounts:z.array(z.object({code:z.number().int().min(0).max(255),cells:z.number().int().nonnegative()}).strict()).min(1).max(64),originalValuesSha256:checksum}).strict()}).strict().superRefine((m,c)=>{
  const fail=(message:string)=>c.addIssue({code:"custom",message}),codes=new Set(m.classes.map(v=>v.code)),keys=new Set(m.assets.map(a=>a.key));
  if(codes.size!==m.classes.length||codes.has(m.grid.noData))fail("Class codes must be unique and distinct from NoData.");
  if(keys.size!==m.assets.length)fail("Asset keys must be unique.");
  if(!m.assets.some(a=>a.key==="source/index.json"&&a.kind==="source"&&a.sha256===m.source.sha256))fail("Retain the complete checksummed original classification index.");
  let count=1;const positions=new Set<string>(),sourceKeys=new Set<string>();
  for(const t of m.originalTiles){const position=`${t.x}:${t.y}`;if(positions.has(position)||sourceKeys.has(t.key)||!m.assets.some(a=>a.key===t.key&&a.kind==="source")||t.width!==Math.min(m.grid.sourceTileSize,m.grid.width-t.x*m.grid.sourceTileSize)||t.height!==Math.min(m.grid.sourceTileSize,m.grid.height-t.y*m.grid.sourceTileSize))fail("Original classification tiles must have unique complete bounded positions and source identities.");positions.add(position);sourceKeys.add(t.key);count++;}
  let previous=0;for(const l of m.levels){if(l.factor<=previous||l.width!==Math.ceil(m.grid.width/l.factor)||l.height!==Math.ceil(m.grid.height/l.factor))fail("Display levels must match original registration in increasing order.");previous=l.factor;for(let y=0;y<Math.ceil(l.height/256);y++)for(let x=0;x<Math.ceil(l.width/256);x++){count++;if(!keys.has(`classification/${l.factor}/${x}-${y}.png`))fail("Each display level needs complete categorical imagery.");}}
  if(m.levels[0].factor!==1||m.levels[0].method!=="original-categorical"||m.levels.slice(1).some(l=>l.method!=="area-mode-with-nodata"))fail("Keep original and categorical aggregation levels distinct.");
  if(count!==m.assets.length)fail("The declared inventory must exactly match all retained source/display assets.");
  if(m.statistics.validCells+m.statistics.noDataCells!==m.grid.width*m.grid.height||m.statistics.classCounts.length!==codes.size||new Set(m.statistics.classCounts.map(s=>s.code)).size!==codes.size||m.statistics.classCounts.some(s=>!codes.has(s.code))||m.statistics.classCounts.reduce((n,s)=>n+s.cells,0)!==m.statistics.validCells)fail("Account for every original classified or NoData cell.");
});
export type CategoricalManifest=z.infer<typeof categoricalManifestSchema>;
export type CategoricalAsset=z.infer<typeof categoricalAssetSchema>;
export type CategoricalLevel=CategoricalManifest["levels"][number];
export type CategoricalView={sourceId:string;versionId:string;revision:number;viewRevision:number;stamp:string;name:string;account:string|null;grid:CategoricalGrid;classes:CategoricalClass[];level:CategoricalLevel;tiles:{x:number;y:number;width:number;height:number;key:string}[];preferences:CategoricalPreferences;canEdit:boolean;credit:CategoricalManifest["source"];versions:{id:string;revision:number;protected:boolean;archived:boolean}[];protected:boolean;archived:boolean;statistics:CategoricalManifest["statistics"]};
export const categoricalCommandSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("preferences"),mapId:geoId,timelineId:geoId,sourceId:geoId,revision:z.number().int().positive(),preferences:categoricalPreferencesSchema}).strict(),
  z.object({action:z.literal("revise"),mapId:geoId,timelineId:geoId,sourceId:geoId,revision:z.number().int().positive(),requestId:geoId,note:z.string().trim().min(1).max(4000),protected:z.boolean(),archived:z.boolean()}).strict(),
]);
/** Areas share their surface's units. Angular weights need no Earth radius. */
export function categoricalRowWeight(grid:Pick<CategoricalGrid,"height"|"bounds">,row:number,reference:Pick<SpatialReference,"kind">){if(reference.kind==="plane")return 1;const n=grid.bounds[3]-row/grid.height*(grid.bounds[3]-grid.bounds[1]),s=grid.bounds[3]-(row+1)/grid.height*(grid.bounds[3]-grid.bounds[1]);return Math.sin(n*Math.PI/180)-Math.sin(s*Math.PI/180);}
/** No numeric averaging. Unknown area participates; ties prefer NoData, then
 * the lowest declared code. A mixed modal cell is not a confidence estimate. */
export function categoricalMode(counts:ReadonlyMap<number,number>,noData:number){let code=noData,area=-1;for(const [candidate,value] of counts)if(value>area||value===area&&(candidate===noData||code!==noData&&candidate<code)){code=candidate;area=value;}return code;}
