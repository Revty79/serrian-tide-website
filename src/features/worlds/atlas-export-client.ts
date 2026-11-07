import {worldApi} from "./client-api";
import {worldClientUrl,worldRequestActor} from "./world-editor-credentials";
import {exportManifestSchema,exportResourceSchema,exportJsonHash,ATLAS_EXPORT_LIMITS,type ExportManifest,type ExportResource,type ExportSourceRequest} from "./atlas-export";
import {numericalChecksum} from "./terrain-refinement-cache";

export type ExportProgress=(message:string)=>void;
export function exportRequestUrl(worldId:string,review:boolean,params:Record<string,string>){return `/api/worlds/${encodeURIComponent(worldId)}/exports?${new URLSearchParams({...params,...review?{review:"1"}:{}})}`;}
export async function prepareExportSource(worldId:string,review:boolean,request:ExportSourceRequest,signal:AbortSignal){
 const raw=await worldApi<unknown>(exportRequestUrl(worldId,review,{op:"prepare",source:JSON.stringify(request)}),"GET",undefined,signal),manifest=exportManifestSchema.parse(raw),{pin,...body}=manifest;
 if(manifest.worldId!==worldId||manifest.target.id!==request.target.id||manifest.target.kind!==request.target.kind||await exportJsonHash(body)!==pin.sha256)throw Error("This export source failed its identity or integrity check. Prepare the saved map again.");return manifest;
}
export type ExportTile={index:number;x:number;y:number;lod:number;sha256:string;bytes:number;encoding:string;samples:number[]};
/** Only immutable pin-bound objects. This cache belongs to one canceled/released job. */
export class AtlasExportData{
 private resources=new Map<string,Promise<ExportResource>>();
 private images=new Map<string,{image:HTMLImageElement;url:string;bytes:number}>();
 private imageBytes=0;
 private actor:string|undefined;
 readonly metrics={resources:0,metadataBytes:0,tileBatches:0,tiles:0,peakImageBytes:0};
 constructor(readonly manifest:ExportManifest,readonly review:boolean,readonly signal:AbortSignal,readonly progress:ExportProgress=()=>{}){this.actor=worldRequestActor(exportRequestUrl(manifest.worldId,review,{op:"check"}));}
 check(){if(this.signal.aborted)throw new DOMException("Export canceled. Your map and draft are unchanged.","AbortError");if(this.actor&&worldRequestActor(exportRequestUrl(this.manifest.worldId,this.review,{op:"check"}))!==this.actor)throw Error("The signed-in account changed. This pending export was withheld.");}
 url(params:Record<string,string>){return exportRequestUrl(this.manifest.worldId,this.review,{...params,pin:JSON.stringify(this.manifest.pin)});}
 resource(key:string){let value=this.resources.get(key);if(!value){value=this.loadResource(key);this.resources.set(key,value);}return value;}
 private async loadResource(key:string){
  this.check();const descriptor=this.manifest.resources.find(r=>r.key===key);if(!descriptor)throw Error("This selected saved source does not include the requested map layer.");this.progress("Loading saved map layers…");
  const value=exportResourceSchema.parse(await worldApi<unknown>(this.url({op:"resource",key}),"GET",undefined,this.signal));this.check();const bytes=new TextEncoder().encode(JSON.stringify(value)).length;
  if(descriptor.kind!==value.kind||descriptor.bytes!==bytes||await exportJsonHash(value)!==descriptor.sha256||value.kind==="geometry"&&value.value.family!==this.manifest.family)throw Error("A saved map resource failed its exact source check. No incomplete output was produced.");
  this.metrics.resources++;this.metrics.metadataBytes+=bytes;if(this.metrics.metadataBytes>ATLAS_EXPORT_LIMITS.metadataBytes)throw Error("This export exceeds the 24 MiB map-layer allowance. Choose a smaller saved Region or source; no layer was dropped.");return value;
 }
 async optional(key:string){return this.manifest.resources.some(r=>r.key===key)?this.resource(key):undefined;}
 async tiles(key:string,indexes:number[]){
  this.check();if(!indexes.length||indexes.length>ATLAS_EXPORT_LIMITS.tileBatch||new Set(indexes).size!==indexes.length)throw Error("Use a bounded distinct numerical tile batch.");
  const resource=await this.resource(key),references=resource.kind==="geometry"&&"tiles" in resource.value?resource.value.tiles:resource.kind==="numerical"?resource.tiles:null;if(!references||indexes.some(i=>!references[i]))throw Error("A numerical tile index is outside its retained resource.");
  const response=await worldApi<ExportTile[]>(this.url({op:"tiles",key,indexes:JSON.stringify(indexes)}),"GET",undefined,this.signal);this.check();if(!Array.isArray(response)||response.length!==indexes.length)throw Error("A numerical object batch is incomplete.");const requested=new Set(indexes);
  for(const tile of response){const ref=references[tile.index];if(!requested.delete(tile.index)||!ref||tile.sha256!==ref.sha256||tile.x!==ref.x||tile.y!==ref.y||tile.lod!==ref.lod||tile.bytes!==2048||tile.encoding!=="i16le-v1"||!Array.isArray(tile.samples)||tile.samples.length!==1024||tile.samples.some(n=>!Number.isInteger(n)||n< -30000||n>30000)||await numericalChecksum(tile.samples)!==ref.sha256)throw Error("A retained numerical object failed verification. No incomplete image was generated.");}
  this.metrics.tileBatches++;this.metrics.tiles+=response.length;return response;
 }
 async image(assetId:string,version:number){
  this.check();const key=assetId+":"+version,old=this.images.get(key);if(old){this.images.delete(key);this.images.set(key,old);return old.image;}
  const reference=this.manifest.images.find(i=>i.assetId===assetId&&i.version===version);if(!reference)throw Error("This image does not belong to the authorized saved map.");if(reference.creditIssue)throw Error(reference.creditIssue);
  const url=worldClientUrl(this.url({op:"image",asset:assetId,version:String(version)})),actor=worldRequestActor(url),response=await fetch(url,{credentials:"same-origin",cache:"no-store",signal:this.signal,headers:actor?{"X-World-Actor":actor}:{}});
  if(!response.ok){const error=await response.json().catch(()=>null);throw Error(error?.error??"An exact saved image is unavailable. Retry or omit uploaded artwork.");}
  if(actor&&(response.headers.get("X-World-Actor")!==actor||worldRequestActor(url)!==actor))throw Error("The signed-in account changed. This export was withheld.");
  if(response.headers.get("Content-Type")!=="image/webp")throw Error("An artwork response is not an authorized image.");const blob=await response.blob();if(blob.size>8*1024*1024)throw Error("An image exceeds its bounded private image allowance.");this.check();const objectUrl=URL.createObjectURL(blob),image=new Image();
  try{await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error("An exact saved image failed to decode. Retry or omit uploaded artwork."));image.src=objectUrl;});this.check();const bytes=image.naturalWidth*image.naturalHeight*4;while(this.imageBytes+bytes>72*1024*1024&&this.images.size){const first=this.images.entries().next().value!;this.images.delete(first[0]);first[1].image.src="";URL.revokeObjectURL(first[1].url);this.imageBytes-=first[1].bytes;}if(bytes>72*1024*1024)throw Error("An uploaded image exceeds the bounded export image cache.");this.images.set(key,{image,url:objectUrl,bytes});this.imageBytes+=bytes;this.metrics.peakImageBytes=Math.max(this.metrics.peakImageBytes,this.imageBytes);return image;
  }catch(error){image.src="";URL.revokeObjectURL(objectUrl);throw error;}
 }
 async authorizeDelivery(){this.check();this.progress("Checking current access before download…");const result=await worldApi<{authorized:boolean;sha256:string}>(this.url({op:"check"}),"GET",undefined,this.signal);this.check();if(!result.authorized||result.sha256!==this.manifest.pin.sha256)throw Error("This output is no longer authorized. Your map remains unchanged.");}
 dispose(){for(const value of this.images.values()){value.image.src="";URL.revokeObjectURL(value.url);}this.images.clear();this.imageBytes=0;this.resources.clear();}
}
