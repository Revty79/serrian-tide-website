"use client";
import {useEffect,useMemo,useState} from "react";
import {useNativeWorldApi} from "./native-map-history-client";
import type {TerrainGeometry} from "./terrain";
import {type RefinementMeta,type TerrainViewport} from "./terrain-refinement";
import {TerrainDetailCache,numericalChecksum,type DetailBatch} from "./terrain-refinement-cache";
import {sharedReliefPreviewPlans} from "./terrain-shared-relief-preview-geometry";
import type {TerrainDetailScene} from "./terrain-detail-renderer";
import {refinementApi,type RefinementIndex} from "./terrain-refinement-client";
import {EMPTY_PROTECTION} from "./terrain-source";
import type {SharedReliefPreview} from "./terrain-shared-relief-packet";

/** Transient windows use the existing tile cache and renderer. Native arrays,
 * accepted source identities and source resolution are never replaced. */
export function useSharedReliefScene(worldId:string,mapId:string,world:TerrainGeometry,proposal:SharedReliefPreview|undefined,before:boolean,options?:{enabled?:boolean;rootRevision?:number}){
 const worldApi=useNativeWorldApi(),[view,setView]=useState<TerrainViewport>(),[index,setIndex]=useState<RefinementIndex>(),[error,setError]=useState(""),[tick,setTick]=useState(0);
 const api=refinementApi(worldId,mapId),enabled=options?.enabled!==false,rootRevision=options?.rootRevision,
  contextChanged=enabled&&rootRevision!==undefined&&!!index&&index.rootRevision!==rootRevision;
 useEffect(()=>{if(!enabled)return;const c=new AbortController();void worldApi<RefinementIndex>(api,"GET",undefined,c.signal).then(value=>{setIndex(value);setError("");}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[api,worldApi,enabled]);
 const prepared=useMemo(()=>proposal?.header.windows.map((w,i)=>({w,i})).filter(({w})=>w.sourceId!==null).map(({w,i})=>{
  let levels=0;while(w.width%(32*2**(levels+1))===0&&w.height%(32*2**(levels+1))===0)levels++;
  const meta:RefinementMeta={id:w.id+":shared:"+proposal.header.previewHash+":"+(before?"before":"after"),worldId,mapId,terrainId:proposal.header.terrainId,name:w.name,parentId:w.id,parentRevision:w.revision,level:w.level+.5,revision:w.revision,
   frame:{x:w.frame.x+w.x/w.sourceWidth*w.frame.width,y:w.frame.y+w.y/w.sourceHeight*w.frame.height,width:w.width/w.sourceWidth*w.frame.width,height:w.height/w.sourceHeight*w.frame.height},gridWidth:w.width,gridHeight:w.height,overviewLevels:levels,updatedAt:""};
  return {meta,grid:proposal.windows[i][before?"before":"after"]};
 })??[],[proposal,before,worldId,mapId]);
 const cache=useMemo(()=>new TerrainDetailCache(async(plan,signal)=>{
  const ready=prepared.find(p=>p.meta.id===plan.meta.id);if(!ready)return worldApi<DetailBatch>(`${api}&refinement=${plan.meta.id}&revision=${plan.meta.revision}&lod=${plan.lod}&keys=${plan.keys.join(",")}`,"GET",undefined,signal);
  const factor=2**plan.lod,width=ready.meta.gridWidth/factor;
  const tiles=await Promise.all(plan.keys.map(async key=>{
   const x=key%(width/32),y=Math.floor(key/(width/32)),samples:number[]=[],average=(x:number,y:number,lod:number):number=>!lod?ready.grid[y*ready.meta.gridWidth+x]:Math.round((average(x,y,lod-1)+average(x+2**(lod-1),y,lod-1)+average(x,y+2**(lod-1),lod-1)+average(x+2**(lod-1),y+2**(lod-1),lod-1))/4);
   for(let n=0;n<1024;n++){if(plan.lod>=3&&(n&15)===0){if(signal.aborted)throw new DOMException("Preview display cancelled.","AbortError");await new Promise<void>(r=>setTimeout(r,0));}samples.push(average((x*32+n%32)*factor,(y*32+Math.floor(n/32))*factor,plan.lod));}
   return {x,y,samples,mask:EMPTY_PROTECTION,sha256:await numericalChecksum(samples)};
  }));
  return {refinement:plan.meta,headRevision:plan.meta.revision,lod:plan.lod,tiles,source:{kind:"manual"},acceptedRequestId:proposal!.header.previewHash,rootRevision:proposal!.header.rootRevision,seaLevel:index?.seaLevel??0,canEdit:false};
 }),[api,worldApi,prepared,proposal,index?.seaLevel]);
 useEffect(()=>{const unsubscribe=cache.subscribe(()=>setTick(n=>n+1));return()=>{unsubscribe();cache.dispose();};},[cache]);
 const plans=useMemo(()=>{
  if(!enabled||contextChanged||!view)return [];
  const all=[...(proposal?.header.refinements??index?.refinements??[]),...prepared.map(p=>p.meta)];
  return sharedReliefPreviewPlans(all,view,world);
 },[view,world,index?.refinements,proposal,prepared,enabled,contextChanged]);
 useEffect(()=>{cache.schedule(plans);},[cache,plans]);
 const scene=useMemo<TerrainDetailScene>(()=>({cache,plans,tick}),[cache,plans,tick]);
 return {scene,onViewport:setView,error:enabled?(contextChanged?"Accepted terrain changed. Keep the profile and reopen the saved map before drawing.":error||cache.error):"",ready:enabled&&!!view&&!!index&&!contextChanged&&!error&&!cache.loading&&plans.every(p=>p.keys.every(key=>cache.peek(p.meta.id,p.meta.revision,p.lod,key)))};
}
