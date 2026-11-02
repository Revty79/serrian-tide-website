"use client";
import {useEffect,useState} from "react";
import {worldApi} from "./client-api";
import type {UndergroundBundle} from "./underground";
export function UndergroundMapList({worldId,review,filter,onChoose}:{worldId:string;review?:boolean;filter:string;onChoose:(id:string)=>void}){
 const [bundle,setBundle]=useState<UndergroundBundle>(),[error,setError]=useState(""),[limit,setLimit]=useState(50);useEffect(()=>{const c=new AbortController();void worldApi<UndergroundBundle>(`/api/worlds/${worldId}/underground${review?"?review=1":""}`,"GET",undefined,c.signal).then(setBundle).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[worldId,review]);
 const query=filter.trim().toLocaleLowerCase(),levels=bundle?.levels.filter(l=>!l.archived&&!bundle.sites.find(s=>s.id===l.siteId)?.archived&&(!query||`${bundle.sites.find(s=>s.id===l.siteId)?.name} ${l.name}`.toLocaleLowerCase().includes(query)))??[];
 return <section aria-label="Underground Maps"><h4>Underground Maps</h4><button type="button" className="st-button" onClick={()=>onChoose("underground:")}>Browse / Create Underground Map</button>{error&&<p role="alert">{error}</p>}{bundle?.available===false&&<p>{bundle.reason}</p>}<ul>{levels.slice(0,limit).map(l=><li key={l.id}><button type="button" className="st-button" onClick={()=>onChoose("underground:"+l.id)}>{bundle?.sites.find(s=>s.id===l.siteId)?.name} · {l.name}</button></li>)}</ul>{levels.length>limit&&<button type="button" className="st-button" onClick={()=>setLimit(limit+50)}>More underground levels</button>}</section>;
}
