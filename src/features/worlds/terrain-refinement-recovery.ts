import { worldRecoveryDatabase } from "./world-draft-storage";
import {refinementCreateSchema,type RefinementCreate} from "./terrain-refinement";
export async function refinementRecovery(action:"read"|"write"|"delete",key:string,command?:RefinementCreate):Promise<RefinementCreate|undefined>{
 const db=await worldRecoveryDatabase("serrian-terrain-refinement-v1",1,database=>database.createObjectStore("attempts",{keyPath:"key"}),"attempts",key);
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction("attempts",action==="read"?"readonly":"readwrite"),store=tx.objectStore("attempts"),request=action==="read"?store.get(key):action==="delete"?store.delete(key):store.put({key,command:refinementCreateSchema.parse(command)});tx.oncomplete=()=>{try{const value=request.result;if(action!=="read"||!value){resolve(undefined);return;}if(value.key!==key)throw Error("This detail request belongs to another map.");resolve(refinementCreateSchema.parse(value.command));}catch(e){reject(e);}};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??Error("Detail recovery storage was interrupted."));});}finally{db.close();}
}
