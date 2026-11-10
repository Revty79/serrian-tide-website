import "server-only";
import {AsyncLocalStorage} from "node:async_hooks";
import {eq,sql} from "drizzle-orm";
import {db} from "@/db";
import {worldTerrainTransfer} from "@/db/world-terrain-transfer-schema";
import {expandedTerrainAvailable} from "./terrain-resolution-service";
import {WorldError} from "./world-errors";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
const acceptance=new AsyncLocalStorage<{userId:string;worldId:string;requestId:string}>();
export function withTerrainTransferAuthority<T>(userId:string,worldId:string,requestId:string,run:()=>Promise<T>){return acceptance.run({userId,worldId,requestId},run);}
/** Reserved request IDs cannot be repurposed through an ordinary writer. */
export async function assertTerrainTransferRequest(tx:Tx,userId:string,worldId:string,requestId:string){
 const scope=acceptance.getStore();if(scope?.requestId===requestId&&scope.worldId===worldId&&scope.userId===userId){await tx.execute(sql`select set_config('serrian.terrain_transfer_request',${requestId},true)`);return;}
 if(!await expandedTerrainAvailable(tx))return;
 const [reserved]=await tx.select({requestId:worldTerrainTransfer.requestId}).from(worldTerrainTransfer).where(eq(worldTerrainTransfer.requestId,requestId)).limit(1);
 if(reserved)throw new WorldError("This request belongs to a retained numerical transfer. Retry its original transfer; it cannot be reused through another save route.",409);
}
