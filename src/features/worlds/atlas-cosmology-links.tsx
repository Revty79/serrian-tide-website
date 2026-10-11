"use client";
import { useEffect, useState } from "react";
import { worldApi } from "./client-api";
import type { LoreList } from "./peoples";

export function AtlasCosmologyLinks({worldId,timelineId,placeId,review,ordinary}:{worldId:string;timelineId:string;placeId:string;review:boolean;ordinary:boolean}) {
  const [records,setRecords]=useState<LoreList["records"]>([]),[hasMore,setHasMore]=useState(false),[error,setError]=useState(""),[pending,setPending]=useState(false);
  const query=new URLSearchParams({timeline:timelineId,place:placeId,group:"cosmology"});if(review)query.set("review","1");if(ordinary)query.set("ordinary","1");
  const url=`/api/worlds/${worldId}/peoples?${query}`;
  useEffect(()=>{let alive=true;worldApi<LoreList>(url).then(result=>{if(alive){setRecords(result.records);setHasMore(result.hasMore);}}).catch(failure=>{if(alive)setError(failure.message);});return()=>{alive=false;};},[url]);
  return <section aria-label="Cosmological associations"><h3>Cosmological associations</h3><p>Saved cosmic accounts involving this Atlas place retain its original identity. Locations, gateways, symbolic links and disputed interpretations do not alter maps or move Campaign actors.</p>{records.map(record=><p key={record.id}><a href={`/worlds/${worldId}?tab=cosmology&timeline=${timelineId}&entity=${record.id}${review?"&review=1":""}${ordinary?"&knowledge=ordinary":""}`}>{record.name}</a>{record.archived?" · archived":""}</p>)}{!records.length&&!error&&<p>No available cosmic association has been authored for this place.</p>}{hasMore&&<button type="button" className="st-button is-secondary" disabled={pending} onClick={async()=>{setPending(true);setError("");try{const result=await worldApi<LoreList>(`${url}&offset=${records.length}`);setRecords(rows=>[...rows,...result.records]);setHasMore(result.hasMore);}catch(failure){setError((failure as Error).message);}finally{setPending(false);}}}>Show more cosmic associations</button>}{error&&<p role="alert">{error}</p>}</section>;
}
