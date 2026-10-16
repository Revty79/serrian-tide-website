import {islandAsset,type AssetReference,type IslandAsset} from "./island-assets";
import type {MapDrawing} from "./cartography";

export const artworkKey=(asset:IslandAsset)=>`${asset.libraryId}:${asset.libraryRevision}:${asset.id}:${asset.revision}:${asset.sourceSha256}`;
export const artworkUrl=(asset:IslandAsset)=>`/cartography/${asset.libraryId}/${asset.libraryRevision}/${asset.file}`;
const MAX_SOURCE_BYTES=1024*1024;

/** Exact committed source only. A failed/mismatched release never becomes substitute artwork. */
export async function readIslandArtwork(asset:IslandAsset,fetchSource:typeof fetch=fetch){
 const response=await fetchSource(artworkUrl(asset),{mode:"same-origin",redirect:"error",signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error(`The ${asset.name.toLowerCase()} illustration could not be loaded. Your editable source is retained.`);
 if(Number(response.headers.get("content-length"))>MAX_SOURCE_BYTES)throw new Error("The illustration file exceeds its supported size.");
 const reader=response.body?.getReader();if(!reader)throw new Error("The illustration file is unavailable.");
 const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_SOURCE_BYTES)throw new Error("The illustration file exceeds its supported size.");chunks.push(value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const source=new TextDecoder("utf-8",{fatal:true}).decode(bytes).replaceAll("\r\n","\n");
 const digest=[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(source)))].map(b=>b.toString(16).padStart(2,"0")).join("");
 if(digest!==asset.sourceSha256)throw new Error(`The ${asset.name.toLowerCase()} file does not match its saved revision. Restore the matching artwork release.`);
 if(!source.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')||!source.endsWith("</svg>\n")&&!source.endsWith("</svg>")||/<(?:script|foreignObject|image|style|use|a)\b|(?:href|on\w+)\s*=|url\s*\(/i.test(source))throw new Error("The illustration file cannot be safely rendered.");
 return source.replace(/^<svg[^>]+>/,"").replace(/<\/svg>\s*$/,"");
}

type SourceState={state:"idle"|"loading"|"ready"|"error";svg?:string;error?:string};
const idle:SourceState={state:"idle"};
export function createIslandArtworkStore(load:(asset:IslandAsset)=>Promise<string>=readIslandArtwork){
 const states=new Map<string,SourceState>(),pending=new Map<string,Promise<void>>(),listeners=new Set<()=>void>();let version=0;
 const publish=()=>{version++;for(const listener of listeners)listener();};
 const read=(asset:IslandAsset)=>states.get(artworkKey(asset))??idle;
 function ensure(asset:IslandAsset,retry=false):Promise<void>{
  const key=artworkKey(asset),current=read(asset),running=pending.get(key);if(running)return running;
  if(current.state==="ready")return Promise.resolve();
  if(current.state==="error"&&!retry)return Promise.reject(new Error(current.error));
  states.set(key,{state:"loading"});publish();
  const request=Promise.resolve().then(()=>load(asset)).then(svg=>{states.set(key,{state:"ready",svg});},error=>{const message=error instanceof Error?error.message:"Illustration unavailable. Your editable source is retained.";states.set(key,{state:"error",error:message});throw new Error(message);}).finally(()=>{pending.delete(key);publish();});
  pending.set(key,request);return request;
 }
 return {read,ensure,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},version:()=>version};
}
export const islandArtwork=createIslandArtworkStore();
export function islandDrawingReferences(drawings:readonly MapDrawing[]):AssetReference[]{
 const refs=new Map<string,AssetReference>();for(const drawing of drawings)if(drawing.version===2&&!drawing.archived){for(const reference of drawing.type==="symbol"?[drawing.assetRef]:drawing.assetRefs)refs.set(JSON.stringify(reference),reference);}return [...refs.values()];
}
export async function prepareIslandArtwork(references:readonly AssetReference[],retry=false){await Promise.all(references.map(ref=>islandArtwork.ensure(islandAsset(ref),retry)));}
