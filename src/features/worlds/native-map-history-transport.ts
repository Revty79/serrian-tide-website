import { z } from "zod";
import { nativeHistoryScopeSchema, nativeHistoryAppearanceBinding, type NativeHistoryScope } from "./native-map-history";

export const NATIVE_TRANSPORT_LIMITS=Object.freeze({bodyBytes:8*1024*1024,totalBytes:64*1024*1024,packets:64,scopeReceipts:4096});
export const nativeOriginalScopePrefix="st:native-original-scope:v1:";
export const nativeOriginalScopeSchema=z.object({version:z.literal(1),requestId:z.uuid(),scope:nativeHistoryScopeSchema}).strict();
function originalEndpoint(endpoint:string){const url=new URL(endpoint,"https://atlas.invalid");url.searchParams.delete("historicalAtlas");url.searchParams.sort();return url;}
export function nativeTransportJson(value:unknown){return JSON.stringify(value,(_key,item)=>item&&typeof item==="object"&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);}
export type NativeTransportPacket={version:1;worldId:string;requestId:string;endpoint:string;scope:NativeHistoryScope;body:string;bytes:number;createdAt:string};
export const nativeTransportPacketSchema=z.object({version:z.literal(1),worldId:z.uuid(),requestId:z.uuid(),endpoint:z.string().max(12000),scope:nativeHistoryScopeSchema,body:z.string().max(NATIVE_TRANSPORT_LIMITS.bodyBytes),bytes:z.number().int().positive().max(NATIVE_TRANSPORT_LIMITS.bodyBytes),createdAt:z.string().datetime()}).strict().superRefine((packet,ctx)=>{
  if(!packet.scope.edit){ctx.addIssue({code:"custom",message:"An original request retains its editable source binding."});return;}
  try{
    const url=new URL(packet.endpoint,"https://atlas.invalid");
    if(url.origin!=="https://atlas.invalid"||!url.pathname.startsWith(`/api/worlds/${packet.worldId}/`)||url.searchParams.has("historicalAtlas")||url.hash)throw Error();
    const body=JSON.parse(packet.body);
    if(!body||typeof body!=="object"||body.requestId!==packet.requestId||nativeTransportJson(body)!==packet.body||new TextEncoder().encode(packet.body).length!==packet.bytes)throw Error();
  }catch{ctx.addIssue({code:"custom",message:"Keep the original request identity, private World endpoint and canonical command bytes together."});}
});
export function nativeTransportPacket(worldId:string,endpoint:string,scope:NativeHistoryScope,body:unknown):NativeTransportPacket{
  const command=z.object({requestId:z.uuid()}).passthrough().parse(body),serialized=nativeTransportJson(body),bytes=new TextEncoder().encode(serialized).length;
  const url=originalEndpoint(endpoint);
  if(url.origin!=="https://atlas.invalid"||url.hash)throw Error("Keep the original request within its private World API.");
  return nativeTransportPacketSchema.parse({version:1,worldId,requestId:command.requestId,endpoint:url.pathname+url.search,scope,body:serialized,bytes,createdAt:new Date().toISOString()});
}
/** A retry may be mounted at another year of the same appearance. Its original
 * year still belongs to the request, including after an appearance is split. */
export function assertNativeTransportRetry(packet:NativeTransportPacket,worldId:string,endpoint:string,current:NativeHistoryScope,body:unknown){
  nativeTransportPacketSchema.parse(packet);
  if(!current.edit||current.versionId||current.geographyVersionId||current.connectionSourceVersionId)throw Error("Choose Edit This Appearance before retrying its original request. An immutable reference remains read-only.");
  const url=originalEndpoint(endpoint);
  if(url.origin!=="https://atlas.invalid"||url.hash||packet.worldId!==worldId||packet.endpoint!==url.pathname+url.search||nativeHistoryAppearanceBinding(packet.scope)!==nativeHistoryAppearanceBinding(current)||packet.body!==nativeTransportJson(body))throw Error("This retained request belongs to different content or a different dated appearance. Keep its original packet and explicitly start a new intent instead of changing its destination.");
  return packet.scope;
}
