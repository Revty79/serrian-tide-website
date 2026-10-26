import type {SurfaceWorkerRequest,SurfaceWorkerReply} from "./terrain-surface-worker-protocol";
import {terrainSurfaceSampler,surfaceFieldWork} from "./terrain-surface-field";
import {surfacePixelWork} from "./terrain-surface-art";
import {rasterSurfaceJob} from "./terrain-surface-raster";
import {MEAN_SURFACE_TEXTURES} from "./terrain-surface-textures";
import {loadSurfaceTextures,cachedSurfaceTextures} from "./terrain-surface-texture-client";
import {TerrainSurfaceProfile} from "./terrain-surface-profile";

const endpoint=globalThis as unknown as {onmessage:((event:MessageEvent<SurfaceWorkerRequest>)=>void)|null;postMessage:(message:SurfaceWorkerReply,options?:{transfer:ArrayBuffer[]})=>void};
let source:Extract<SurfaceWorkerRequest,{type:"source"}>["source"]|undefined,sample:ReturnType<typeof terrainSurfaceSampler>|undefined,profile=new TerrainSurfaceProfile(),assetError=false,serial=Promise.resolve();
const field=surfaceFieldWork(),work=surfacePixelWork();
async function receive(message:SurfaceWorkerRequest){
 if(message.type==="retry"){assetError=false;return;}
 if(message.type==="source"){
  source=message.source;if(profile.enabled!==message.profile)profile=new TerrainSurfaceProfile(message.profile);
  const tiles=new Map(source.tiles.map(t=>[`${t.id}/${t.revision}/${t.lod}/${t.key}`,t]));
  sample=terrainSurfaceSampler(source.root,source.world,{plans:source.plans,active:source.active,preview:source.preview,cache:{peek:(id,revision,lod,key)=>tiles.get(`${id}/${revision}/${lod}/${key}`)},tick:0});return;
 }
 if(!source||!sample)throw Error("The artwork source is unavailable.");
 if(message.fine&&!cachedSurfaceTextures()&&!assetError){try{const textures=await loadSurfaceTextures();endpoint.postMessage({type:"assets",state:"ready",bytes:textures.bytes});}catch{assetError=true;endpoint.postMessage({type:"assets",state:"error",bytes:0});}}
 const period=source.world.wrap?source.world.displayWidth:null,result=rasterSurfaceJob(message,sample,period,cachedSurfaceTextures()??MEAN_SURFACE_TEXTURES,profile,field,work);
 endpoint.postMessage({type:"image",key:message.key,width:result.width,height:result.height,pixels:result.pixels.buffer,ms:result.ms,profile:profile.enabled?profile.snapshot():null},{transfer:[result.pixels.buffer]});
}
// Serialize messages even while texture decoding yields. An older job can never
// observe a newer source snapshot halfway through preparation.
endpoint.onmessage=event=>{serial=serial.then(()=>receive(event.data)).catch(error=>{endpoint.postMessage({type:"failed",message:error instanceof Error?error.message:"Artwork preparation failed."});});};
