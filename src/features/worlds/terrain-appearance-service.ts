import "server-only";
import {and,eq,sql} from "drizzle-orm";
import {db} from "@/db";
import {worldMapAppearance} from "@/db/world-map-appearance-schema";
import {worldMapCanvas} from "@/db/world-terrain-schema";
import {worldAtlasMap} from "@/db/world-atlas-schema";
import {WorldError,worldReadAccess,worldWriteTransaction} from "./world-service";
import {appearanceSaveSchema,mapAppearanceSchema} from "./terrain-appearance";
type Connection=Pick<typeof db,"execute"|"select">;
const missing=()=>new WorldError("This terrain map is unavailable.",404);
async function available(tx:Connection){return !!(await tx.execute<{present:boolean}>(sql`select to_regclass('public.world_map_appearance') is not null as present`)).rows[0].present;}
async function mapAccess(tx:Connection,worldId:string,mapId:string){const [map]=await tx.select({id:worldMapCanvas.mapId}).from(worldMapCanvas).innerJoin(worldAtlasMap,and(eq(worldAtlasMap.id,worldMapCanvas.mapId),eq(worldAtlasMap.worldId,worldId))).where(and(eq(worldMapCanvas.worldId,worldId),eq(worldMapCanvas.mapId,mapId),sql`${worldAtlasMap.archivedAt} IS NULL`));if(!map)throw missing();}
export async function getMapAppearance(userId:string,worldId:string,mapId:string,options:{review?:boolean;ordinary?:boolean}={}){
 await worldReadAccess(userId,worldId,options.review??false);
 if(options.ordinary)throw missing();
 return db.transaction(async tx=>{await mapAccess(tx,worldId,mapId);if(!await available(tx))return {available:false,revision:0,spec:null};const [row]=await tx.select().from(worldMapAppearance).where(and(eq(worldMapAppearance.worldId,worldId),eq(worldMapAppearance.mapId,mapId)));return {available:true,revision:row?.revision??0,spec:row?mapAppearanceSchema.parse(row.spec):null};},{accessMode:"read only",isolationLevel:"repeatable read"});
}
export async function saveMapAppearance(userId:string,worldId:string,raw:unknown){
 const command=appearanceSaveSchema.parse(raw);
 return worldWriteTransaction(userId,worldId,async tx=>{
  await mapAccess(tx,worldId,command.mapId);if(!await available(tx))throw new WorldError("Apply migration 0139 before saving map appearances. The visual preview and numerical terrain remain available.",409);
  if(command.spec.version===2&&!(await tx.execute<{present:boolean}>(sql`select to_regclass('public.world_terrain_material_version') is not null as present`)).rows[0].present)throw new WorldError("MIGRATION 0140 REQUIRED before saving Realistic Terrain appearances. Your local preview is retained.",409);
  const [row]=await tx.select().from(worldMapAppearance).where(and(eq(worldMapAppearance.worldId,worldId),eq(worldMapAppearance.mapId,command.mapId))).for("update");
  if(row?.requestId===command.requestId){if(JSON.stringify(mapAppearanceSchema.parse(row.spec))!==JSON.stringify(command.spec))throw new WorldError("This appearance request was already used with different choices.",409);return {revision:row.revision,spec:mapAppearanceSchema.parse(row.spec)};}
  if((row?.revision??0)!==command.revision)throw new WorldError("Another tab saved a newer map appearance. Your view is retained; load the saved appearance before saving again.",409);
  const [used]=await tx.select({id:worldMapAppearance.mapId}).from(worldMapAppearance).where(eq(worldMapAppearance.requestId,command.requestId));if(used)throw new WorldError("Use a fresh appearance request identity.",409);
  const values={revision:command.revision+1,spec:command.spec,requestId:command.requestId,updatedBy:userId,updatedAt:new Date()};
  await tx.insert(worldMapAppearance).values({mapId:command.mapId,worldId,...values}).onConflictDoUpdate({target:worldMapAppearance.mapId,set:values});return {revision:values.revision,spec:values.spec};
 });
}
