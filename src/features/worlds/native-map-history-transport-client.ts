"use client";
import { accountWorldDatabaseName,worldRecoveryDatabase,legacyWorldRecoveryRows } from "./world-draft-storage";
import { accountWorldStorage } from "./world-draft-storage";
import { nativeHistoryScopeSchema,nativeHistoryUrl,type NativeHistoryScope } from "./native-map-history";
import { nativeOriginalScopePrefix,nativeOriginalScopeSchema,nativeTransportJson,nativeTransportPacket,assertNativeTransportRetry,nativeTransportPacketSchema,NATIVE_TRANSPORT_LIMITS,type NativeTransportPacket } from "./native-map-history-transport";

import {currentWorldDraftActor} from "./world-editor-credentials";
const scopeKey=(id:string)=>(currentWorldDraftActor()??"")+":"+id;
const scopes=new Map<string,NativeHistoryScope>();
type Sender=<T>(url:string,method?:string,body?:unknown,signal?:AbortSignal)=>Promise<T>;
export type NativeTransportMeta=Omit<NativeTransportPacket,"body">;
type PacketMeta=NativeTransportMeta;
function changed(){window.dispatchEvent(new Event("atlas:original-requests"));}
const openings=new Map<string,Promise<IDBDatabase>>();
const create=(database:IDBDatabase)=>{database.createObjectStore("packets",{keyPath:"requestId"});database.createObjectStore("metadata",{keyPath:"requestId"});};
function database(requestId=""){
 const name=accountWorldDatabaseName("serrian-native-original-requests-v1"),key=name+":"+requestId,existing=openings.get(key);if(existing)return existing;
 const opening=worldRecoveryDatabase("serrian-native-original-requests-v1",1,create,"packets",requestId).catch(error=>{openings.delete(key);throw error;});openings.set(key,opening);return opening;
}
const result=<T,>(request:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
const finished=(transaction:IDBTransaction)=>{const complete=new Promise<void>((resolve,reject)=>{transaction.oncomplete=()=>resolve();transaction.onabort=()=>reject(transaction.error??Error("Original request recovery was not committed."));transaction.onerror=()=>reject(transaction.error);});void complete.catch(()=>{});return complete;};
export function markNativeOriginalScope(requestId:string,scope?:NativeHistoryScope){
 const localStorage=accountWorldStorage();
  if(!scope?.edit||scope.versionId||scope.geographyVersionId||scope.connectionSourceVersionId||typeof window==="undefined")return;
  const receipt=nativeOriginalScopeSchema.parse({version:1,requestId,scope});
  const existing=scopes.get(scopeKey(requestId));if(existing)return;
  if(scopes.size>=NATIVE_TRANSPORT_LIMITS.scopeReceipts)scopes.delete(scopes.keys().next().value!);
  scopes.set(scopeKey(requestId),receipt.scope);
  try{
    const key=nativeOriginalScopePrefix+requestId,old=localStorage.getItem(key);
    if(old){const retained=nativeOriginalScopeSchema.parse(JSON.parse(old));scopes.set(scopeKey(requestId),retained.scope);return;}
    let count=0;for(let index=0;index<localStorage.length;index++)if(localStorage.key(index)?.startsWith(nativeOriginalScopePrefix))count++;
    if(count<NATIVE_TRANSPORT_LIMITS.scopeReceipts)localStorage.setItem(key,JSON.stringify(receipt));
  }catch{/* The pending transport packet must still commit before any HTTP write. */}
}
export function nativeOriginalRequestUuid(scope?:NativeHistoryScope){
  let id:string;
  if(crypto.randomUUID)id=crypto.randomUUID();else{const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const value=Array.from(bytes,byte=>byte.toString(16).padStart(2,"0")).join("");id=`${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20)}`;}
  markNativeOriginalScope(id,scope);return id;
}
export function nativeOriginalRequestUuidForUrl(endpoint:string){const raw=new URL(endpoint,"https://atlas.invalid").searchParams.get("historicalAtlas");return nativeOriginalRequestUuid(raw?nativeHistoryScopeSchema.parse(JSON.parse(raw)):undefined);}
function storedScope(id:string){
 const localStorage=accountWorldStorage();
  if(scopes.has(scopeKey(id)))return scopes.get(scopeKey(id));
  const raw=localStorage.getItem(nativeOriginalScopePrefix+id);if(!raw)return;
  return nativeOriginalScopeSchema.parse(JSON.parse(raw)).scope;
}
export async function retainedNativeTransport(requestId:string){
  const connection=await database(requestId),transaction=connection.transaction("packets","readonly"),complete=finished(transaction),packet=await result(transaction.objectStore("packets").get(requestId));await complete;
  return packet?nativeTransportPacketSchema.parse(packet):undefined;
}
export async function listNativeTransports(worldId:string):Promise<PacketMeta[]>{
  const connection=await database(),transaction=connection.transaction("metadata","readonly"),complete=finished(transaction),rows=await result(transaction.objectStore("metadata").getAll()) as PacketMeta[];await complete;
  const legacy=await legacyWorldRecoveryRows<PacketMeta>("serrian-native-original-requests-v1",1,create,"metadata",worldId);
  return [...rows.filter(row=>row.worldId===worldId),...legacy.filter(old=>!rows.some(row=>row.requestId===old.requestId))].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
}
export async function retainNativeTransport(packet:NativeTransportPacket){
  nativeTransportPacketSchema.parse(packet);
  const connection=await database(packet.requestId),transaction=connection.transaction(["packets","metadata"],"readwrite"),complete=finished(transaction);
  try{
    const packets=transaction.objectStore("packets"),metadata=transaction.objectStore("metadata"),existing=await result(packets.get(packet.requestId));
    if(existing){const old=nativeTransportPacketSchema.parse(existing);assertNativeTransportRetry(old,packet.worldId,packet.endpoint,packet.scope,JSON.parse(packet.body));transaction.abort();await complete.catch(()=>{});return old;}
    const entries=await result(metadata.getAll()) as PacketMeta[];
    if(entries.length>=NATIVE_TRANSPORT_LIMITS.packets||entries.reduce((sum,row)=>sum+row.bytes,0)+packet.bytes>NATIVE_TRANSPORT_LIMITS.totalBytes)throw Error("Retained original requests reached their 64-packet / 64 MiB limit. Resolve or export an existing request before submitting more work.");
    packets.add(packet);const {body:_,...summary}=packet;void _;metadata.add(summary);await complete;changed();return packet;
  }catch(error){try{transaction.abort();}catch{/* already aborted or completed */}await complete.catch(()=>{});throw error;}
}
async function acknowledge(packet:NativeTransportPacket){
 const localStorage=accountWorldStorage();
  const connection=await database(packet.requestId),transaction=connection.transaction(["packets","metadata"],"readwrite"),complete=finished(transaction);
  transaction.objectStore("packets").delete(packet.requestId);transaction.objectStore("metadata").delete(packet.requestId);await complete;
  scopes.delete(scopeKey(packet.requestId));
  try{localStorage.removeItem(nativeOriginalScopePrefix+packet.requestId);}catch{/* The server also retains this accepted scope. */}
  changed();
}
/** Explicit local release never changes the server's immutable request ledger. */
export async function releaseNativeTransport(packet:NativeTransportPacket){
  const connection=await database(packet.requestId),transaction=connection.transaction(["packets","metadata"],"readwrite"),complete=finished(transaction);
  try{
    const packets=transaction.objectStore("packets"),existing=await result(packets.get(packet.requestId));
    if(!existing||nativeTransportJson(existing)!==nativeTransportJson(packet))throw Error("Another tab changed this retained request. Reload its original bytes before releasing it.");
    packets.delete(packet.requestId);transaction.objectStore("metadata").delete(packet.requestId);await complete;changed();
  }catch(error){try{transaction.abort();}catch{}await complete.catch(()=>{});throw error;}
}
/** Called with the raw HTTP sender, never with a mutable-URL inference. */
export async function sendOriginalNativeRequest<T>(url:string,method:string,body:unknown,signal:AbortSignal|undefined,send:Sender):Promise<T>{
  const endpoint=new URL(url,"https://atlas.invalid"),match=endpoint.pathname.match(/^\/api\/worlds\/([a-f0-9-]{36})\//),encoded=endpoint.searchParams.get("historicalAtlas");
  if(!match||!encoded||!body||typeof body!=="object"||!("requestId"in body)||typeof body.requestId!=="string")throw Error("Keep the original private World request and its explicit historical binding together.");
  const current=nativeHistoryScopeSchema.parse(JSON.parse(encoded)),worldId=match[1],id=body.requestId;
  let packet=await retainedNativeTransport(id);
  if(packet)assertNativeTransportRetry(packet,worldId,url,current,body);
  else{
    let scope=storedScope(id);
    if(!scope){const receipt=await send<{scope:NativeHistoryScope|null}>(`/api/worlds/${worldId}/atlas-history/request?request=${encodeURIComponent(id)}`,"GET",undefined,signal);scope=receipt.scope??undefined;}
    if(!scope)throw Error("The original request's year and source binding were not retained. Export the draft, or explicitly release that original request and start a new intent; it cannot be reassigned to this viewing year.");
    packet=nativeTransportPacket(worldId,url,scope,body);assertNativeTransportRetry(packet,worldId,url,current,body);packet=await retainNativeTransport(packet);
  }
  const accepted=await send<T>(nativeHistoryUrl(packet.endpoint,packet.scope),method,JSON.parse(packet.body),signal);
  // Failure to clear an acknowledged packet is safe: its exact next retry uses
  // the immutable server receipt and never submits different command bytes.
  await acknowledge(packet).catch(()=>{});return accepted;
}
