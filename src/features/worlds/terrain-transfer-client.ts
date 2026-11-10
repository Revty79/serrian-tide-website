import type {TerrainTile} from "./terrain";
import type {TerrainTransferResult} from "./terrain-transfer";
import {TERRAIN_TRANSFER} from "./terrain-resolution";
import {numericalChecksum} from "./terrain-refinement-cache";
type Send=<T>(url:string,method?:string,body?:unknown,signal?:AbortSignal)=>Promise<T>;
type Command={action:string;requestId:string;tiles?:TerrainTile[];[key:string]:unknown};
/** Explicitly setting aside a browser draft preserves uploaded chunks and
 * releases an active-transfer slot. It never deletes an accepted revision. */
export async function retainTerrainCommand(api:string,command:{requestId:string;tiles?:TerrainTile[]}|undefined,send:Send){
 if(!command?.tiles||command.tiles.length<=1024)return;
 const parsed=new URL(api,location.origin),match=parsed.pathname.match(/^\/api\/worlds\/([a-f0-9-]{36})\/terrain/);if(!match)throw Error("This retained save has no World identity.");
 const target=new URL(`/api/worlds/${match[1]}/terrain/transfers`,location.origin);for(const name of["historicalAtlas","review"])if(parsed.searchParams.has(name))target.searchParams.set(name,parsed.searchParams.get(name)!);
 try{await send(target.pathname+target.search,"POST",{op:"retain",requestId:command.requestId});}catch(error){if(!error||typeof error!=="object"||!("status"in error)||error.status!==404)throw error;}
}
/** The original browser/IndexedDB command remains the retry authority. */
export async function sendTerrainCommand<T>(api:string,command:Command,send:Send,status:(message:string)=>void=()=>{},signal?:AbortSignal):Promise<T>{
 if(!command.tiles||command.tiles.length<=1024)return send<T>(api,"POST",command,signal);
 const parsed=new URL(api,location.origin),match=parsed.pathname.match(/^\/api\/worlds\/([a-f0-9-]{36})\/terrain/);if(!match)throw Error("This terrain transfer has no World identity.");
 const target=new URL(`/api/worlds/${match[1]}/terrain/transfers`,location.origin);for(const key of ["historicalAtlas","review"])if(parsed.searchParams.has(key))target.searchParams.set(key,parsed.searchParams.get(key)!);
 const url=target.pathname+target.search,{tiles,...header}=command,manifest=[];
 for(let n=0;n<tiles.length;n++){if(signal?.aborted)throw new DOMException("Transfer paused; the original request is retained.","AbortError");const t=tiles[n];manifest.push({x:t.x,y:t.y,sha256:await numericalChecksum(Int16Array.from(t.samples))});if(n%64===0){status(`Preparing numerical transfer · ${n} / ${tiles.length} tiles`);await new Promise<void>(resolve=>setTimeout(resolve,0));}}
 const start=await send<TerrainTransferResult>(url,"POST",{op:"begin",command:header,tiles:manifest,...parsed.searchParams.get("refinement")?{refinementId:parsed.searchParams.get("refinement")}:{}},signal);
 if(start.result)return start.result as T;const received=new Set(start.received),pending=tiles.filter(t=>!received.has(t.x+":"+t.y));let complete=tiles.length-pending.length;
 for(let n=0;n<pending.length;n+=TERRAIN_TRANSFER.chunkTiles){if(signal?.aborted)throw new DOMException("Transfer paused; accepted terrain and the original request are retained.","AbortError");const batch=pending.slice(n,n+TERRAIN_TRANSFER.chunkTiles);await send<TerrainTransferResult>(url,"POST",{op:"chunk",requestId:command.requestId,tiles:batch},signal);complete+=batch.length;status(`Saving numerical tiles · ${complete} / ${tiles.length}. The accepted revision is unchanged until confirmation.`);}
 if(signal?.aborted)throw new DOMException("Transfer paused before acceptance; retry the retained request.","AbortError");status("Confirming the complete numerical save… Keep this request for an exact retry if interrupted.");
 const result=await send<TerrainTransferResult>(url,"POST",{op:"finish",requestId:command.requestId},signal);if(!result.result)throw Error("The complete numerical save is still unaccepted. Retry its original request.");return result.result as T;
}
