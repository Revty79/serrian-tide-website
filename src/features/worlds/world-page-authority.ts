import "server-only";
import { randomUUID } from "node:crypto";
import { withWorldRequestAuthority } from "./world-authorization-context";
import { revalidateWorldResponse } from "./world-access-service";
import { WorldError } from "./world-errors";
type PageSession={user:{id:string};session:{id:string}};
export async function withWorldPageAuthority<T>(session:PageSession,review:boolean,run:()=>Promise<T>):Promise<T>{
  return withWorldRequestAuthority({userId:session.user.id,sessionId:session.session.id,proof:null,review,operationId:randomUUID(),reads:new Map()},async()=>{
    try{const result=await run();await revalidateWorldResponse();return result;}
    catch(error){if(error instanceof WorldError)throw error;if(error&&typeof error==="object"&&"digest"in error&&typeof error.digest==="string"&&error.digest.startsWith("NEXT_"))throw error;console.error("World page unavailable",{kind:error instanceof Error?error.name:typeof error});throw new WorldError("This World could not be loaded right now.",503);}
  });
}
