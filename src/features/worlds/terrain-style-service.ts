import "server-only";
import {and,desc,eq,sql} from "drizzle-orm";
import {db} from "@/db";
import {worldMapStyle} from "@/db/world-map-style-schema";
import {worldMapAppearance} from "@/db/world-map-appearance-schema";
import {WorldError,worldReadAccess,worldWriteTransaction} from "./world-service";
import {mapAppearanceSchema} from "./terrain-appearance";
import {stylePresetSaveSchema} from "./terrain-style-preset";
import {requireAppearanceMap} from "./terrain-appearance-service";
type Connection=Pick<typeof db,"execute"|"select">;
async function available(tx:Connection){return !!(await tx.execute<{present:boolean}>(sql`select to_regclass('public.world_map_style') is not null as present`)).rows[0].present;}
export async function getMapStyles(userId:string,worldId:string,mapId:string,options:{review?:boolean;ordinary?:boolean}={}){
 await worldReadAccess(userId,worldId,options.review??false);if(options.ordinary)throw new WorldError("This terrain map is unavailable.",404);
 return db.transaction(async tx=>{await requireAppearanceMap(tx,worldId,mapId);if(!await available(tx))return {available:false,presets:[]};const rows=await tx.select().from(worldMapStyle).where(eq(worldMapStyle.worldId,worldId)).orderBy(desc(worldMapStyle.createdAt));return {available:true,presets:rows.map(r=>({...r,spec:mapAppearanceSchema.parse(r.spec)}))};},{accessMode:"read only",isolationLevel:"repeatable read"});
}
export async function saveMapStyle(userId:string,worldId:string,raw:unknown){
 const c=stylePresetSaveSchema.parse(raw);
 return worldWriteTransaction(userId,worldId,async tx=>{
  await requireAppearanceMap(tx,worldId,c.mapId);if(!await available(tx))throw new WorldError("MIGRATION 0143 REQUIRED to save named styles. Your appearance preview is retained.",409);
  const [used]=await tx.select().from(worldMapStyle).where(eq(worldMapStyle.id,c.requestId));
  if(used){if(used.worldId!==worldId||used.sourceMapId!==c.mapId||used.sourceAppearanceRevision!==c.appearanceRevision||used.name!==c.name||JSON.stringify(mapAppearanceSchema.parse(used.spec))!==JSON.stringify(c.spec))throw new WorldError("This style request already contains different choices. Keep the original retry or use a fresh request.",409);return used;}
  const [head]=await tx.select({revision:worldMapAppearance.revision}).from(worldMapAppearance).where(and(eq(worldMapAppearance.worldId,worldId),eq(worldMapAppearance.mapId,c.mapId)));
  if((head?.revision??0)!==c.appearanceRevision)throw new WorldError("The saved appearance changed. Load it before capturing a new named style; your candidate is retained.",409);
  const [result]=await tx.insert(worldMapStyle).values({id:c.requestId,worldId,version:1,name:c.name,spec:c.spec,sourceMapId:c.mapId,sourceAppearanceRevision:c.appearanceRevision,createdBy:userId}).returning();return result;
 });
}
