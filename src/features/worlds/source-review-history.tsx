"use client";
import {useState} from "react";
import {worldEditorHeaders,worldFetch} from "./world-editor-credentials";
import type {RightsSource} from "./source-rights";
export function SourceReviewHistory({worldId,sourceId,review}:{worldId:string;sourceId:string;review:boolean}){
 const [rows,setRows]=useState<RightsSource["reviews"]>([]),[next,setNext]=useState<number|null>(0),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 async function load(){if(next===null)return;setBusy(true);try{const r=await worldFetch(`/api/worlds/source-rights?world=${worldId}&source=${sourceId}&offset=${next}${review?"&review=1":""}`,{headers:worldEditorHeaders(`/api/worlds/${worldId}`)}),v=await r.json();if(!r.ok)throw Error(v.error);setRows(v.reviews);setNext(v.next);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div>{rows.map(r=><article key={r.revision}><p>Review {r.revision} — {r.decision}. {r.createdAt}; reviewer {r.reviewerId}</p><p>{r.reason}</p><p>{r.evidence}</p><p>Uses: {r.uses.join(", ")}</p><p style={{whiteSpace:"pre-wrap"}}>{r.credits}</p></article>)}{next!==null&&<button type="button" className="st-button" disabled={busy} onClick={()=>void load()}>{next===0?"Read recorded review history":"Read older review decisions"}</button>}{error&&<p role="alert">{error}</p>}</div>;
}
