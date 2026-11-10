import "server-only";
import {withTerrainResourceBudget} from "./terrain-resource-budget";
import {withTerrainTransferAuthority} from "./terrain-transfer-authority";
import type {PoolClient} from "pg";
import {createHash} from "node:crypto";
import {z} from "zod";
import {eq,sql} from "drizzle-orm";
import {db,pool} from "@/db";
import {user} from "@/db/auth-schema";
import {worldTerrainTransfer as transfers,worldTerrainTransferTile as chunks} from "@/db/world-terrain-transfer-schema";
import {lockWorldForWrite} from "./world-access-service";
import {expandedTerrainAvailable} from "./terrain-resolution-service";
import {terrainTransferCommandSchema,type TerrainTransferResult} from "./terrain-transfer";
import {TERRAIN_TRANSFER} from "./terrain-resolution";
import {readTerrainTile,stageTerrainTiles} from "./terrain-storage";
import {changeTerrain} from "./terrain-service";
import {saveRefinement} from "./terrain-refinement-service";
import {WorldError} from "./world-errors";
import type {TerrainTile} from "./terrain";
import type {NativeHistoryScope} from "./native-map-history";
import {withNativeHistoryWrite} from "./native-map-history-write";
import {saveNativeTerrain} from "./native-map-history-terrain-write";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
const hash=(v:unknown)=>createHash("sha256").update(JSON.stringify(v,(_k,value)=>value&&typeof value==="object"&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value)).digest("hex"),key=(t:{x:number;y:number})=>t.x+":"+t.y;
let accepting=false;
async function prepared(tx:Tx,userId:string,worldId:string,requestId:string){const [row]=await tx.select().from(transfers).where(eq(transfers.requestId,requestId));if(!row||row.worldId!==worldId||row.actorId!==userId)throw new WorldError("This retained numerical transfer is unavailable.",404);return row;}
async function receipt(tx:Pick<Tx,"select">,row:typeof transfers.$inferSelect):Promise<TerrainTransferResult>{const rows=await tx.select({x:chunks.x,y:chunks.y}).from(chunks).where(eq(chunks.requestId,row.requestId));return{requestId:row.requestId,received:rows.map(key).sort(),total:row.tileCount,state:row.state,...row.result?{result:row.result,...row.result.historical?{historical:row.result.historical}:{}}:{}};}
async function quota(tx:Tx,userId:string,newRequest:boolean){const [n]=await tx.select({active:sql<number>`count(*) filter(where ${transfers.state}='receiving')::int`,retained:sql<number>`count(*) filter(where ${transfers.state}<>'accepted')::int`}).from(transfers).where(eq(transfers.actorId,userId));if(n.active>=TERRAIN_TRANSFER.activePerActor)throw new WorldError("Two numerical transfers are already pending. Finish one or keep its retained copy before starting another; accepted terrain is unchanged.",429);if(newRequest&&n.retained>=TERRAIN_TRANSFER.retainedPerActor)throw new WorldError("The retained numerical-transfer allowance is full. Finish or review an original request before starting another; no private work was deleted.",413);}
/** Each chunk is durable, bounded and lease-checked. Nothing advances a native head here. */
export async function changeTerrainTransfer(userId:string,worldId:string,raw:unknown,nativeScope?:NativeHistoryScope){
 const c=terrainTransferCommandSchema.parse(raw);
 if(nativeScope&&!nativeScope.edit)throw new WorldError("This dated terrain source is read-only. The retained transfer was not changed.",403);
 const scopes=nativeScope?["atlas","history","appearances"] as const:["atlas"] as const;
 const staged=await db.transaction(async tx=>{
  const requestId=c.op==="begin"?c.command.requestId:c.requestId,[held]=(await tx.execute<{held:boolean}>(sql`select pg_try_advisory_xact_lock(hashtextextended(${requestId},19744601)) held`)).rows;if(!held.held)throw new WorldError("This original numerical save is being confirmed. Keep it and retry shortly.",429);
  await lockWorldForWrite(tx,userId,worldId,scopes);if(!await expandedTerrainAvailable(tx))throw new WorldError("Migration 0161 is required for expanded terrain and resumable transfers. Existing maps and drafts are retained.",503);
  // Serialize quota checks across this actor's Worlds without holding a source grid.
  await tx.select({id:user.id}).from(user).where(eq(user.id,userId)).for("update");
  let row:typeof transfers.$inferSelect;
  if(c.op==="begin"){
   const digest=hash({command:c,nativeScope}),[old]=await tx.select().from(transfers).where(eq(transfers.requestId,c.command.requestId));
   if(old){if(old.actorId!==userId||old.worldId!==worldId||old.inputHash!==digest)throw new WorldError("This save identity has different original tiles or settings. Retry the retained request.",409);row=old;if(old.state==="retained"){await quota(tx,userId,false);[row]=await tx.update(transfers).set({state:"receiving"}).where(eq(transfers.requestId,old.requestId)).returning();}}
   else{await quota(tx,userId,true);[row]=await tx.insert(transfers).values({requestId:c.command.requestId,worldId,actorId:userId,refinementId:c.refinementId??null,inputHash:digest,command:{...c.command,...nativeScope?{nativeScope}:{}},tiles:c.tiles,tileCount:c.tiles.length}).returning();}
  }else row=await prepared(tx,userId,worldId,c.requestId);
  if(hash(row.command.nativeScope??null)!==hash(nativeScope??null))throw new WorldError("This transfer belongs to a different original historical context. Retry from that saved context.",409);
  if(c.op==="retain"&&!row.result)[row]=await tx.update(transfers).set({state:"retained"}).where(eq(transfers.requestId,row.requestId)).returning();
  if((c.op==="chunk"||c.op==="finish")&&row.state==="retained")throw new WorldError("This original transfer is retained. Begin the exact original request again to resume it.",412);
  if(c.op==="chunk"&&!row.result){
   const expected=new Map(row.tiles.map(t=>[key(t),t.sha256]));
   // Check the exact original numerical bytes before publishing even staging objects.
   for(const tile of c.tiles){const bytes=Buffer.alloc(2048);tile.samples.forEach((n,i)=>bytes.writeInt16LE(n,i*2));if(expected.get(key(tile))!==createHash("sha256").update(bytes).digest("hex"))throw new WorldError("A transfer tile differs from the original save manifest. No revision was accepted.",409);}
   if(new Set(c.tiles.map(key)).size!==c.tiles.length)throw new WorldError("A transfer batch repeats a tile.",400);
   const objects=await stageTerrainTiles(row.requestId,worldId,row.refinementId??row.requestId,c.tiles);
   await tx.insert(chunks).values(objects.map(o=>({requestId:row.requestId,...o}))).onConflictDoNothing();
  }
  const value=await receipt(tx,row);await lockWorldForWrite(tx,userId,worldId,scopes);return{row,value};
 });
 if(c.op!=="finish"||staged.row.result)return staged.value;
 if(staged.value.received.length!==staged.row.tileCount)throw new WorldError("This numerical save is incomplete. Retry its missing chunks; accepted terrain is unchanged.",412);
 if(accepting)throw new WorldError("Another numerical transfer is being accepted. Your original save is retained; retry shortly.",429);
 accepting=true;let connection:PoolClient|undefined,held=false;try{connection=await pool.connect();held=!!(await connection.query("select pg_try_advisory_lock(hashtextextended($1,19744601)) held",[staged.row.requestId])).rows[0].held;if(!held)throw new WorldError("This original save is already being confirmed. Retry shortly.",429);const [fresh]=await db.select().from(transfers).where(eq(transfers.requestId,staged.row.requestId));if(fresh.state==="retained")throw new WorldError("This transfer was retained before acceptance. Resume its exact original request first.",412);if(fresh.result)return receipt(db,fresh);return await withTerrainResourceBudget(staged.row.tileCount*1024,async()=>{
 const refs=await db.select().from(chunks).where(eq(chunks.requestId,staged.row.requestId)),byKey=new Map(refs.map(t=>[key(t),t])),tiles:TerrainTile[]=[];
 for(let offset=0;offset<staged.row.tiles.length;offset+=16)tiles.push(...await Promise.all(staged.row.tiles.slice(offset,offset+16).map(async t=>{const ref=byKey.get(key(t));if(!ref||ref.sha256!==t.sha256)throw new WorldError("A staged tile failed its original manifest. The save remains unaccepted.",409);return{x:t.x,y:t.y,samples:await readTerrainTile(ref)};})));
 // Reuse the sole native writer, including exact retries, guards, masks and atomic history.
 const {nativeScope:scope,...header}=staged.row.command,command={...header,tiles};
 const rawResult=await withTerrainTransferAuthority(userId,worldId,command.requestId,()=>scope?withNativeHistoryWrite(userId,worldId,scope,{requestId:command.requestId,endpoint:staged.row.refinementId?"terrain/refinements"+staged.row.refinementId:"terrain",command},(tx,context)=>saveNativeTerrain(tx,context,command,staged.row.refinementId??undefined)):staged.row.refinementId?saveRefinement(userId,worldId,staged.row.refinementId,command):changeTerrain(userId,worldId,command));
 const result=z.object({id:z.uuid(),revision:z.number().int().positive(),refinementId:z.uuid().optional(),historical:z.unknown().optional()}).passthrough().parse(rawResult);
 await db.update(transfers).set({state:"accepted",result}).where(eq(transfers.requestId,staged.row.requestId));
 return{...staged.value,state:"accepted" as const,result,..."historical"in result?{historical:result.historical}:{}};
 });}finally{if(connection){if(held)try{await connection.query("select pg_advisory_unlock(hashtextextended($1,19744601))",[staged.row.requestId]);}catch{connection.release(true);connection=undefined;}connection?.release();}accepting=false;}
}
