"use client";
import {useNativeApiUrl,useNativeHistoryRecovery,useNativeWorldApi} from "./native-map-history-client";
import {useCallback,useEffect,useMemo,useState} from "react";

import type {TerrainDocument,TerrainGeometry} from "./terrain";
import {protectionGrid,type TerrainSource} from "./terrain-source";
import {frameGeometry,type RefinementMeta,type TerrainViewport} from "./terrain-refinement";
import {TerrainDetailCache,type DetailBatch,type DetailPlan} from "./terrain-refinement-cache";
import {sharedTerrainDetails} from "./terrain-shared-detail-cache";
import {detailViewPlan} from "./terrain-detail-presentation";
export {detailViewPlan} from "./terrain-detail-presentation";

export type RefinementIndex={sourceState?:string;available:boolean;expansionAvailable?:boolean;refinements:RefinementMeta[];rootRevision:number;seaLevel:number;canEdit:boolean};
export type LoadedTerrainDetail={document:TerrainDocument;grid:Int16Array;protection:Uint8Array};
export function refinementApi(worldId:string,mapId:string,review=false){return `/api/worlds/${worldId}/terrain/refinements?terrainMap=${encodeURIComponent(mapId)}${review?"&review=1":""}`;}

export function useTerrainRefinements(root:TerrainDocument,world:TerrainGeometry,view:TerrainViewport|undefined,review:boolean,activeId?:string,density=1){
 const worldApi=useNativeWorldApi();
 const bindApi=useNativeApiUrl(),namespace=useNativeHistoryRecovery();
 const api=bindApi(refinementApi(root.worldId,root.id,review)),[index,setIndex]=useState<RefinementIndex>(),[error,setError]=useState(""),[cacheTick,setCacheTick]=useState(0),[plans,setPlans]=useState<DetailPlan[]>([]),[loadProgress,setLoadProgress]=useState<number|null>(null);
 const fetcher=useCallback((plan:DetailPlan&{historical?:boolean},signal:AbortSignal)=>worldApi<DetailBatch>(`${api}&refinement=${plan.meta.id}&revision=${plan.meta.revision}&lod=${plan.lod}&keys=${plan.keys.join(",")}${plan.historical?"&historical=1":""}`,"GET",undefined,signal),[api,worldApi]);
 const cache=useMemo(()=>new TerrainDetailCache(fetcher,2048,2,sharedTerrainDetails(root.worldId,root.terrainId,namespace)),[fetcher,root.worldId,root.terrainId,namespace]),previous=useMemo(()=>({density,lods:new Map<string,number>()}),[density]);
 useEffect(()=>{const unsubscribe=cache.subscribe(()=>setCacheTick(v=>v+1));return()=>{unsubscribe();cache.dispose();};},[cache]);
 const reload=useCallback(async()=>{try{const result=await worldApi<RefinementIndex>(api);setIndex(result);setError("");return result;}catch(e){setError(e instanceof Error?e.message:"Terrain detail could not be read.");throw e;}},[api,worldApi]);
 useEffect(()=>{const controller=new AbortController();let alive=true;const run=()=>{void worldApi<RefinementIndex>(api,"GET",undefined,controller.signal).then(value=>{if(alive){setIndex(value);setError("");}}).catch(e=>{if(alive&&!controller.signal.aborted)setError(e.message);});};run();window.addEventListener("focus",run);return()=>{alive=false;controller.abort();window.removeEventListener("focus",run);};},[api,worldApi]);
 useEffect(()=>{if(!view||!index?.available||loadProgress!==null)return;const timer=setTimeout(()=>{const next=detailViewPlan(index.refinements,view,world,previous.lods,1024,previous.density);setPlans(next);cache.schedule(next.filter(p=>p.meta.id!==activeId));},100);return()=>clearTimeout(timer);},[view,index,world,previous,cache,activeId,loadProgress]);
 const load=useCallback(async(meta:RefinementMeta,signal:AbortSignal,revision=meta.revision):Promise<LoadedTerrainDetail>=>{
  const retained=revision===meta.revision?undefined:await worldApi<DetailBatch>(`${api}&refinement=${meta.id}&revision=${revision}&historical=1&lod=0&keys=0`,"GET",undefined,signal);
  const chosen=retained?.refinement??{...meta,revision},shape=frameGeometry(chosen,world),grid=new Int16Array(shape.width*shape.height),masks:{x:number;y:number;mask:string}[]=[],groups:number[][]=[];let acceptedRequestId="",source:TerrainSource={kind:"manual"},seaLevel=root.seaLevel,done=0,rootPin:number|undefined;
  for(let key=0;key<shape.width*shape.height/1024;key+=64)groups.push(Array.from({length:Math.min(64,shape.width*shape.height/1024-key)},(_,n)=>key+n));
  const controller=new AbortController(),jobSignal=AbortSignal.any([signal,controller.signal]);setLoadProgress(0);cache.schedule([]);let offset=0;
  try{const worker=async()=>{while(offset<groups.length){if(jobSignal.aborted)throw new DOMException("Terrain detail loading was cancelled.","AbortError");const keys=groups[offset++],plan={meta:chosen,lod:0,keys,historical:revision!==meta.revision},batch=await fetcher(plan,jobSignal);if(signal.aborted)throw new DOMException("Terrain detail loading was cancelled.","AbortError");if(revision===meta.revision&&batch.headRevision!==revision)throw Error("Newer detail arrived while loading. Refresh the accepted sources before editing.");if(rootPin!==undefined&&(batch.rootRevision!==rootPin||batch.seaLevel!==seaLevel))throw Error("The shared World setting changed while loading. Refresh before editing this source.");rootPin=batch.rootRevision;await cache.accept(plan,batch);for(const tile of batch.tiles){const key=tile.y*(shape.width/32)+tile.x,entry=cache.peek(meta.id,revision,0,key)!;for(let y=0;y<32;y++)grid.set(entry.samples.subarray(y*32,y*32+32),(tile.y*32+y)*shape.width+tile.x*32);masks.push({x:tile.x,y:tile.y,mask:tile.mask});}acceptedRequestId=batch.acceptedRequestId;source=batch.source;seaLevel=batch.seaLevel;done+=keys.length;setLoadProgress(done/(shape.width*shape.height/1024));}};await Promise.all([worker(),worker()]);
   return {grid,protection:protectionGrid(masks,shape.width,shape.height),document:{...root,revision,acceptedRequestId,source,origin:undefined,seaLevel,settings:{...root.settings,gridWidth:shape.width,gridHeight:shape.height,widthKm:shape.displayWidth/1000,heightKm:shape.displayHeight/1000,wrap:false},width:shape.width,height:shape.height,tiles:[],protection:masks,refinement:chosen}};
  }finally{controller.abort();setLoadProgress(null);}
 },[world,root,cache,fetcher,api,worldApi]);
 return {api,index,reload,error:error||cache.error,cache,cacheTick,plans,load,loadProgress};
}
