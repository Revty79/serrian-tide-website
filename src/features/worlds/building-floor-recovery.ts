import {FLOOR_LIMITS,type FloorDesign} from "./building-floor";
type Store=Pick<Storage,"getItem"|"setItem"|"removeItem"|"key"|"length">;
let documentTab:string|undefined;
export function floorRecoveryKey(worldId:string,floorId:string,creation=false){
 if(!documentTab){try{const key="st:building-floor-tab:v1",retained=sessionStorage.getItem(key),reload=(performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming|undefined)?.type==="reload";documentTab=reload&&retained?retained:crypto.randomUUID();sessionStorage.setItem(key,documentTab);}catch{documentTab=crypto.randomUUID();}}
 return `${creation?"st:floor-create:v1":"st:building-floor:v1"}:${worldId}:${floorId}:${documentTab}`;
}
export const floorRecoveryPrefix=(key:string)=>key.slice(0,key.lastIndexOf(":"))+":";
export function readFloorRecovery(store:Store,key:string,saved:FloorDesign){
 const own=store.getItem(key);if(own)return {key,raw:own,otherTab:false};const prefix=floorRecoveryPrefix(key),candidates:{key:string;raw:string;updated:number}[]=[];
 for(let i=0;i<store.length;i++){const candidate=store.key(i);if(!candidate?.startsWith(prefix))continue;const raw=store.getItem(candidate);if(!raw)continue;try{const value=JSON.parse(raw);if(value.floorId&&!value.pending&&!value.drawing?.length&&JSON.stringify(value.design)===JSON.stringify(saved))continue;candidates.push({key:candidate,raw,updated:typeof value.updatedAt==="number"?value.updatedAt:0});}catch{candidates.push({key:candidate,raw,updated:0});}}
 candidates.sort((a,b)=>b.updated-a.updated);return candidates[0]?{...candidates[0],otherTab:true}:undefined;
}
export function writeFloorRecovery(store:Store,key:string,value:unknown){const raw=JSON.stringify({...value as object,updatedAt:Date.now()});if(new TextEncoder().encode(raw).length>FLOOR_LIMITS.draftBytes)throw Error("This draft exceeds the four-million-byte recovery limit.");if(!store.getItem(key)){const prefix=floorRecoveryPrefix(key);let count=0;for(let i=0;i<store.length;i++)if(store.key(i)?.startsWith(prefix))count++;if(count>=4)throw Error("Four tab drafts are retained for this floor. Save or export an earlier tab draft before closing this editor.");}store.setItem(key,raw);}
