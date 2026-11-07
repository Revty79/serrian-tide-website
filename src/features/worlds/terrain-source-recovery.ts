import { worldRecoveryDatabase } from "./world-draft-storage";
import {terrainCommandSchema} from "./terrain";
export type SourceCommand=ReturnType<typeof terrainCommandSchema.parse>;
export type SourceAttempt={key:string;command:SourceCommand;savedAt:string};
export async function sourceRecovery(action:"read"|"write"|"delete",key:string,attempt?:SourceAttempt):Promise<SourceAttempt|undefined>{
 const db=await worldRecoveryDatabase("serrian-terrain-source-v1",1,database=>database.createObjectStore("attempts",{keyPath:"key"}),"attempts",key);try{return await new Promise((resolve,reject)=>{const tx=db.transaction("attempts",action==="read"?"readonly":"readwrite"),store=tx.objectStore("attempts"),request=action==="read"?store.get(key):action==="write"?store.put(attempt):store.delete(key);tx.oncomplete=()=>{try{if(action!=="read"||!request.result){resolve(undefined);return;}const value=request.result;if(value.key!==key||typeof value.savedAt!=="string")throw new Error("This source recovery belongs to another workspace.");resolve({key,command:terrainCommandSchema.parse(value.command),savedAt:value.savedAt});}catch(error){reject(error);}};tx.onabort=()=>reject(tx.error??new Error("Source recovery was interrupted."));tx.onerror=()=>reject(tx.error);});}finally{db.close();}
}
