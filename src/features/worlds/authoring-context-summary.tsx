"use client";
import { useEffect, useState } from "react";
import type { AuthoringSelection, CampaignContext } from "./campaign-associations";
import { contextUnavailableReason } from "./campaign-associations";
import { formatTime, type DatingSystem } from "./chronology";
import { worldApi } from "./client-api";
import styles from "./worlds.module.css";
export function AuthoringContextSummary({ worldId, timelineName, displaySystem, version }: { worldId:string;timelineName:string;displaySystem:DatingSystem|null;version:number }) {
  const [data,setData]=useState<{selection:AuthoringSelection;context:CampaignContext|null}|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{let alive=true;worldApi<{selection:AuthoringSelection;context:CampaignContext|null}>("/api/worlds/campaign-contexts?selection=1").then(value=>{if(alive){setData(value);setError("");}}).catch(failure=>{if(alive)setError(failure.message);});return()=>{alive=false;};},[version]);
  const context=data?.context;
  return <aside className={styles.authoringContext} aria-label="Worlds authoring context"><p>Browsing history: <strong>{timelineName}</strong>.</p>
    {error?<p role="alert">{error}</p>:!data?<p>Loading your authoring selection…</p>:context?<p>Authoring for <strong>{context.campaignName}</strong> · {context.worldName} · {context.timelineName} · {data.selection.viewingYear===null?"Viewing year not authored":formatTime({version:1,scale:"world-year",kind:"known",year:data.selection.viewingYear},context.worldId===worldId?displaySystem:null)}{!context.available?` · Unavailable: ${contextUnavailableReason(context)}`:""}</p>:<p>{data.selection.contextId?"Your retained authoring context is unavailable.":"No Campaign selected for Worlds authoring."}</p>}
    <p className={styles.caption}>Choose or change this in Campaigns. Browsing and authoring selections do not move Characters or advance Campaign time.</p>
  </aside>;
}
