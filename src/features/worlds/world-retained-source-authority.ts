import "server-only";
import {AsyncLocalStorage} from "node:async_hooks";
import type {AuthorizedWorld} from "./world-access-service";
import {worldScopes} from "./world-permissions";

const sourceRead=new AsyncLocalStorage<AuthorizedWorld>();
/** Private server snapshot construction only. The caller first authorizes the
 * actual actor's map/history scope. Unshared components are retained verbatim,
 * never released as a content response or used as editing authority. */
export function withWorldRetainedSourceRead<T>(authorized:AuthorizedWorld,run:()=>T):T{
 return sourceRead.run({...authorized,permission:{...authorized.permission,scopes:[...worldScopes],protectedContent:true,canEdit:false}},run);
}
export function retainedWorldSourceRead(worldId:string,userId?:string){const value=sourceRead.getStore();return value?.id===worldId&&(!userId||value.permission.actorId===userId)?value:undefined;}
