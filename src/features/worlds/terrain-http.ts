import "server-only";
import {WorldError} from "./world-service";

/** Shared original eight-million-byte ceiling, including chunked requests. */
export async function readTerrainRequest(request:Request):Promise<unknown>{
 const reader=request.body?.getReader();if(!reader)throw new WorldError("Enter terrain details.",400);
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>8_000_000){await reader.cancel();throw new WorldError("This terrain edit exceeds the safe request size. Your draft is retained.",413);}chunks.push(part.value);}}finally{reader.releaseLock();}
 const raw=JSON.parse(Buffer.concat(chunks).toString("utf8"));assertTerrainRequestMap(request,raw);return raw;
}
export function assertTerrainRequestMap<T>(request:Request,raw:T):T{
 const mapId=new URL(request.url).searchParams.get("terrainMap");if(!mapId||!raw||typeof raw!=="object")return raw;
 const value=raw as {action?:string;mapId?:string;parentMapId?:string};
 if((value.action==="create-region"?value.parentMapId:value.mapId)!==mapId)
   throw new WorldError("The submitted map does not match this authoring context. Your draft is retained.",400);
 return raw;
}
