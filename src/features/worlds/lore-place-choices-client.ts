"use client";
import {useEffect,useState} from "react";
import {worldApi} from "./client-api";
import {useWorldAtlasContext} from "./world-atlas-context-client";
import type {LorePlaceChoices} from "./lore-place-choices";

export function useLorePlaceChoices(worldId:string,timelineId:string,search:string,after:string|null,selected:string[]){
 const context=useWorldAtlasContext(),query=new URLSearchParams({timeline:timelineId,placeChoices:"1",q:search,...after?{after}:{},...context?.review?{review:"1"}:{},...context?.ordinary?{ordinary:"1"}:{}});
 for(const id of [...new Set(selected)].filter(Boolean).sort())query.append("selected",id);
 const url=`/api/worlds/${worldId}/peoples?${query}`,[result,setResult]=useState<{url:string;page?:LorePlaceChoices;error?:string}>();
 useEffect(()=>{const controller=new AbortController(),timer=setTimeout(()=>{worldApi<LorePlaceChoices>(url,"GET",undefined,controller.signal).then(page=>{if(!controller.signal.aborted)setResult({url,page});}).catch(e=>{if(!controller.signal.aborted)setResult({url,error:e.message});});},160);return()=>{clearTimeout(timer);controller.abort();};},[url]);
 return {page:result?.url===url?result.page:undefined,error:result?.url===url?result.error:undefined,loading:result?.url!==url};
}
