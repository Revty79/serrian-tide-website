import "server-only";
import {createHash} from "node:crypto";
import {eq,sql} from "drizzle-orm";
import {db} from "@/db";
import {worldRegionalEdit,type RegionalEditResult} from "@/db/world-regional-authoring-schema";
import {terrainMapContext} from "./terrain-map-context";
import {terrainSourceState} from "./terrain-regions";
import {WorldError} from "./world-service";
import type {RegionalAuthoring,RegionalScope} from "./terrain-regional-scope";

type Connection=Pick<typeof db,"select"|"execute"|"insert">;
type ReadConnection=Pick<typeof db,"select"|"execute">;
type Request={mapId:string;requestId:string;revision:number;regional?:RegionalAuthoring;restoreRevision?:number};
export async function regionalAuthoringAvailable(tx:ReadConnection){return !!(await tx.execute<{present:boolean}>(sql`select to_regclass('public.world_regional_edit') is not null as present`)).rows[0].present;}
export async function regionalAuthoringContext(tx:ReadConnection,worldId:string,mapId:string){
 const context=await terrainMapContext(tx,worldId,mapId);
 let regional:RegionalAuthoring|undefined;
 if(context.region&&await regionalAuthoringAvailable(tx)){
  const details=(await tx.execute<{id:string;revision:number}>(sql`select id,revision from world_terrain_refinement where terrain_id=${context.terrain.id} and world_id=${worldId}`)).rows;
  regional={version:1,regionMapId:context.region.mapId,parentMapId:context.sourceMapId,terrainId:context.terrain.id,regionRevision:context.region.revision,sourceState:terrainSourceState(context.terrain.revision,details)};
 }
 return {...context,regional};
}
export function regionalScope(context:Awaited<ReturnType<typeof regionalAuthoringContext>>):RegionalScope{
 if(!context.region)throw new WorldError("Choose a linked region for bounded geographic editing.",400);
 return {frame:context.region.frame,footprint:context.region.footprint,world:{width:context.terrain.widthMetres,height:context.terrain.heightMetres,wrap:context.terrain.wrap}};
}
export function requireRegionalAuthoringPin(context:Awaited<ReturnType<typeof regionalAuthoringContext>>,regional:RegionalAuthoring|undefined){
 if(!context.region){if(regional)throw new WorldError("This regional authoring request does not belong to the requested map.",400);return;}
 if(!context.regional)throw new WorldError("MIGRATION 0148 REQUIRED before editing shared geography from a region. Existing geography and your draft are retained.",409);
 if(!regional)throw new WorldError("This regional view inherits shared World geography. Reload its accepted authoring context before saving local edits; the draft is retained.",409);
 const pin={...regional};delete pin.compositionRevision;
 if(JSON.stringify(pin)!==JSON.stringify(context.regional))throw new WorldError("The region, parent or accepted numerical sources changed. Your draft and original request are retained; review current geography before accepting it.",409);
}
export async function beginRegionalEdit(tx:Connection,userId:string,worldId:string,kind:string,command:Request){
 const context=await regionalAuthoringContext(tx,worldId,command.mapId);
 if(!context.region){if(command.regional)throw new WorldError("This regional authoring request does not belong to the requested map.",400);return {context};}
 if(!context.regional)throw new WorldError("MIGRATION 0148 REQUIRED before editing shared geography from a region. Existing geography and your draft are retained.",409);
 const inputHash=createHash("sha256").update(JSON.stringify(command)).digest("hex");
 const [used]=await tx.select().from(worldRegionalEdit).where(eq(worldRegionalEdit.requestId,command.requestId));
 if(used){if(used.worldId!==worldId||used.mapId!==command.mapId||used.parentMapId!==context.sourceMapId||used.terrainId!==context.terrain.id||used.kind!==kind||used.createdBy!==userId||used.inputHash!==inputHash)throw new WorldError("This regional request identity was already used for different work. Keep the exact original retry.",409);return {context,retry:used.result,inputHash};}
 if(!command.regional)throw new WorldError("This regional view inherits shared World geography. Reload its accepted authoring context before saving local edits; the draft is retained.",409);
 const pin={...command.regional};delete pin.compositionRevision;
 if(JSON.stringify(pin)!==JSON.stringify(context.regional))throw new WorldError("The region, parent or accepted numerical sources changed. Your draft and original request are retained; load current geography and review a fresh preview before accepting changes.",409);
 if(command.restoreRevision!==undefined)throw new WorldError("Full-layer historical restoration is a parent-World operation. Your regional draft is retained; undo eligible local changes here or open the World history.",409);
 return {context,inputHash};
}
export async function finishRegionalEdit(tx:Connection,userId:string,worldId:string,kind:string,command:Request,access:Awaited<ReturnType<typeof beginRegionalEdit>>,result:RegionalEditResult){
 if(!access.context.region)return;
 await tx.insert(worldRegionalEdit).values({requestId:command.requestId,mapId:access.context.region.mapId,worldId,parentMapId:access.context.sourceMapId,terrainId:access.context.terrain.id,kind,baseRevision:command.revision,inputHash:access.inputHash!,result,createdBy:userId});
}
/** Retry receipts reference existing immutable snapshots; they never store a second layer copy. */
export async function regionalRetryLayer<T>(tx:ReadConnection,kind:string,mapId:string,revision:number,empty:T,parse:(value:unknown)=>T):Promise<T>{
 if(revision===0)return parse(empty);
 const tables:Record<string,string>={materials:"world_terrain_material_version",water:"world_hydrology_version",environment:"world_environment_version",artwork:"world_artwork_version",labels:"world_labels_version"};
 const table=tables[kind];if(!table)throw new WorldError("This geographic history is unavailable.",400);
 const [record]=(await tx.execute<{layer:unknown}>(sql`select layer from ${sql.identifier(table)} where map_id=${mapId} and revision=${revision}`)).rows;
 if(!record)throw new WorldError("The accepted geographic snapshot is unavailable. Retain the original request and restore its verified paired backup.",409);
 return parse(record.layer);
}
/** Translate validation failures to the existing conflict/error boundary without losing drafts. */
export function boundedRegionalLayer<T>(construct:()=>T):T{try{return construct();}catch(error){if(error instanceof WorldError)throw error;throw new WorldError((error as Error).message,400);}}
