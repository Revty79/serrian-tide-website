import { currentWorldDraftActor, ownsLegacyWorldDraftKey,ownsWorldDraft } from "./world-editor-credentials";
import {nativeOriginalScopePrefix,nativeOriginalScopeSchema} from "./native-map-history-transport";

/** Original request keys contain only a request UUID. Recover their unmodified
 * scope receipt only after both its map and timeline were verified as owned. */
export function ownsLegacyWorldDraftReceipt(key:string,raw:string|null,owns:(id:string)=>boolean){
 if(!key.startsWith(nativeOriginalScopePrefix)||!raw||raw.length>12000)return false;
 try{const receipt=nativeOriginalScopeSchema.parse(JSON.parse(raw));return key===nativeOriginalScopePrefix+receipt.requestId&&owns(receipt.scope.target.id)&&owns(receipt.scope.timelineId);}catch{return false;}
}

/** Logical keys and packet bytes stay unchanged; the storage boundary owns the account namespace. */
export function bindWorldAccountStorage(store:Storage,actorId:string|undefined,legacyAllowed:(key:string)=>boolean=()=>false):Storage{
  if(!actorId)return store;
  const prefix=`st:world-account:${encodeURIComponent(actorId)}:`;
  const physical=(key:string)=>prefix+key;
  const observed=new Map<string,string|null>();
  const legacy=(key:string)=>legacyAllowed(key)?store.getItem(key):null;
  const visible=()=>{
    const keys=new Set<string>();
    for(let index=0;index<store.length;index++){
      const key=store.key(index);if(!key)continue;
      if(key.startsWith(prefix)&&!key.startsWith(prefix+"retired-legacy:"))keys.add(key.slice(prefix.length));
      else if(!key.startsWith("st:world-account:")&&legacy(key)!==null)keys.add(key);
    }
    return [...keys];
  };
  return {
    get length(){return visible().length;},key(index){return visible()[index]??null;},
    getItem(key){const value=store.getItem(physical(key))??legacy(key);observed.set(key,value);return value;},
    setItem(key,value){const legacyValue=legacy(key);if(store.getItem(physical(key))===null&&legacyValue!==null){if(observed.has(key)&&observed.get(key)!==legacyValue)throw Error("Another tab changed the retained owner draft. Its original bytes are preserved.");store.setItem(key,value);}else store.setItem(physical(key),value);observed.set(key,value);},
    removeItem(key){const own=store.getItem(physical(key)),raw=own??legacy(key);if(raw!==null&&observed.has(key)&&observed.get(key)!==raw)throw Error("Another tab changed the retained draft. Reload it before discarding or accepting this recovery.");if(own!==null)store.removeItem(physical(key));else if(raw!==null)store.removeItem(key);observed.delete(key);/* Only acknowledgement or explicit discard retires an owner-verified legacy packet; no duplicate quota is needed. */},
    clear(){for(const key of visible())store.removeItem(physical(key));},
  };
}
const storageByActor=new Map<string,Storage>();
const emptyStorage:Storage={length:0,key:()=>null,getItem:()=>null,setItem:()=>{},removeItem:()=>{},clear:()=>{}};
export function accountWorldStorage(){
  if(typeof window==="undefined")return emptyStorage;
  const actor=currentWorldDraftActor();if(!actor)return window.localStorage;
  let bound=storageByActor.get(actor);if(!bound){bound=bindWorldAccountStorage(window.localStorage,actor,key=>ownsLegacyWorldDraftKey(key,actor)||ownsLegacyWorldDraftReceipt(key,window.localStorage.getItem(key),id=>ownsLegacyWorldDraftKey(id,actor)));storageByActor.set(actor,bound);}return bound;
}
export function accountWorldDatabaseName(name:string){const actor=currentWorldDraftActor();return actor?`${name}:account:${encodeURIComponent(actor)}`:name;}
async function openRecoveryDatabase(name:string,version:number,create:(database:IDBDatabase)=>void){return new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open(name,version);request.onupgradeneeded=()=>create(request.result);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error("Another tab is blocking recovery storage. Keep this draft open and retry."));});}
async function legacyRecoveryDatabase(name:string,version:number,create:(database:IDBDatabase)=>void){if(typeof indexedDB.databases==="function"&&!(await indexedDB.databases()).some(database=>database.name===name))return;return openRecoveryDatabase(name,version,create);}
function recoveryValue(database:IDBDatabase,store:string,key:IDBValidKey){return new Promise<unknown>((resolve,reject)=>{const request=database.transaction(store).objectStore(store).get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
/** Legacy bytes are opened only for an ownership-verified World/resource. A
 * recovered packet continues in place until its original acceptance/discard. */
export async function worldRecoveryDatabase(name:string,version:number,create:(database:IDBDatabase)=>void,store:string,key:IDBValidKey){
 const account=accountWorldDatabaseName(name),modern=await openRecoveryDatabase(account,version,create);if(account===name||await recoveryValue(modern,store,key))return modern;
 const actor=currentWorldDraftActor(),legacy=await legacyRecoveryDatabase(name,version,create);if(!legacy)return modern;
 try{const row=await recoveryValue(legacy,store,key);const worldId=row&&typeof row==="object"&&"worldId"in row&&typeof row.worldId==="string"?row.worldId:undefined;if(row&&(worldId?ownsWorldDraft(worldId,actor):ownsLegacyWorldDraftKey(String(key),actor))){modern.close();return legacy;}}catch(error){legacy.close();modern.close();throw error;}
 legacy.close();return modern;
}
export async function legacyWorldRecoveryRows<T extends {worldId:string}>(name:string,version:number,create:(database:IDBDatabase)=>void,store:string,worldId:string):Promise<T[]>{
 const actor=currentWorldDraftActor();if(!actor||!ownsWorldDraft(worldId,actor))return [];const legacy=await legacyRecoveryDatabase(name,version,create);if(!legacy)return [];
 try{return await new Promise<T[]>((resolve,reject)=>{const request=legacy.transaction(store).objectStore(store).getAll();request.onsuccess=()=>resolve((request.result as T[]).filter(row=>row.worldId===worldId));request.onerror=()=>reject(request.error);});}finally{legacy.close();}
}
