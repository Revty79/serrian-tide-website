"use client";
import { worldRecoveryDatabase,legacyWorldRecoveryRows } from "./world-draft-storage";
import type {AssetImport} from "./atlas-assets";
export type RetainedImport={id:string;worldId:string;command:AssetImport;file:Blob};
const create=(database:IDBDatabase)=>{database.createObjectStore("imports",{keyPath:"id"});};
async function database(id=""){return worldRecoveryDatabase("st-atlas-image-imports",1,create,"imports",id);}
export async function retainedImports(worldId:string){const legacy=await legacyWorldRecoveryRows<RetainedImport>("st-atlas-image-imports",1,create,"imports",worldId),db=await database();try{const rows=await new Promise<RetainedImport[]>((resolve,reject)=>{const r=db.transaction("imports").objectStore("imports").getAll();r.onsuccess=()=>resolve((r.result as RetainedImport[]).filter(v=>v.worldId===worldId));r.onerror=()=>reject(r.error);});return [...rows,...legacy.filter(old=>!rows.some(row=>row.id===old.id))];}finally{db.close();}}
export async function retainImport(value:RetainedImport){const db=await database(value.id);try{await new Promise<void>((resolve,reject)=>{const t=db.transaction("imports","readwrite");t.objectStore("imports").put(value);t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});}finally{db.close();}}
export async function forgetImport(id:string){const db=await database(id);try{await new Promise<void>((resolve,reject)=>{const t=db.transaction("imports","readwrite");t.objectStore("imports").delete(id);t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});}finally{db.close();}}
