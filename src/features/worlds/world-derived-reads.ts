import "server-only";
import {and,eq} from "drizzle-orm";
import {db} from "@/db";
import {worldTownMap} from "@/db/world-town-map-schema";
import {authorizeWorldRead} from "./world-access-service";
import {WorldError} from "./world-errors";
import {townFrameSchema,townToWorld,type TownFrame} from "./town-map";

/** A Town's bounded saved backdrop is part of that Town. It never grants the
 * caller access to arbitrary World terrain samples or hydrology endpoints. */
export async function authorizeTownBackdrop(userId:string,worldId:string,mapId:string,frame:TownFrame,review=false){
 await authorizeWorldRead(userId,worldId,review,"settlements");const requested=townFrameSchema.parse(frame);
 const rows=await db.select({frame:worldTownMap.frame}).from(worldTownMap).where(and(eq(worldTownMap.worldId,worldId),eq(worldTownMap.sourceMapId,mapId)));
 if(!rows.some(row=>JSON.stringify(townFrameSchema.parse(row.frame))===JSON.stringify(requested)))throw new WorldError("Choose the retained backdrop of an authorized Town Map. Choosing new geographic extents requires Atlas permission.",403);
}
export function townBackdropSamplePoints(frame:TownFrame,world:{width:number;height:number;wrap:boolean}){const size=17;return Array.from({length:size*size},(_,i)=>townToWorld({x:i%size/(size-1)*frame.width,y:Math.floor(i/size)/(size-1)*frame.height},frame,world));}
