"use client";
import { useEffect, useRef, useState } from "react";
import { worldApi } from "./client-api";
import { useWorldAtlasContext } from "./world-atlas-context-client";
import { worldContextUrl, type WorldAtlasContext } from "./world-atlas-context";
import type { WorldAtlasDiscovery, WorldAtlasSubject } from "./world-atlas-discovery";

export function atlasRecordReturnUrl() {
  const url = new URL(location.href);
  url.searchParams.delete("worldReturn");
  const event = new CustomEvent<{ view?: unknown }>("atlas:capture-view", { detail: {} });
  window.dispatchEvent(event);
  if (event.detail.view) url.searchParams.set("atlasView", JSON.stringify(event.detail.view));
  return url.pathname + url.search;
}
function withReturn(href: string, returnTo: string) {
  const url = new URL(href, location.href);
  url.searchParams.set("worldReturn", returnTo);
  return url.pathname + url.search;
}
const coverageLabel = { established: "Established at this year", outside: "Outside recorded period", unknown: "Year coverage unknown", "current-reference": "Current reference; no dated claim" };
export function WorldAtlasDiscoveryPanel({ context, subject }: { context: WorldAtlasContext; subject: WorldAtlasSubject }) {
  const [result,setResult]=useState<{key:string;bundle?:WorldAtlasDiscovery;error?:string}>(),[epoch,setEpoch]=useState(0);
  const [returnTo] = useState(() => atlasRecordReturnUrl());
  const key = JSON.stringify(subject), request = useRef(0),binding=JSON.stringify([context.worldId,context.timelineId,context.year,context.review,context.ordinary,key,epoch]);
  const bundle=result?.key===binding?result.bundle:undefined,error=result?.key===binding?result.error:undefined;
  useEffect(() => {
    const controller = new AbortController(), generation = ++request.current;
    const query = new URLSearchParams({ timeline: context.timelineId, subject: key });
    if (context.year !== undefined) query.set("year", String(context.year));
    if (context.review) query.set("review", "1");
    if (context.ordinary) query.set("knowledge", "ordinary");
    worldApi<WorldAtlasDiscovery>(`/api/worlds/${context.worldId}/atlas-discovery?${query}`, "GET", undefined, controller.signal).then(result => { if (generation === request.current && !controller.signal.aborted) setResult({key:binding,bundle:result}); }).catch(failure => { if (!controller.signal.aborted && generation === request.current) setResult({key:binding,error:failure.message}); });
    return () => controller.abort();
  }, [context.worldId, context.timelineId, context.year, context.review, context.ordinary, key, epoch,binding]);
  return <section aria-label={subject.kind === "map" ? "Related Worlds Records" : "Find in Atlas"}>
    <h3>{subject.kind === "map" ? "Related Worlds Records" : "Find in Atlas"}</h3>
    {error ? <p role="alert">{error} <button className="st-button is-secondary" onClick={() => setEpoch(value => value + 1)}>Retry saved relationships</button></p> : !bundle ? <p role="status">Loading authorized saved relationships…</p> : <>
      <p>{bundle.explanation}</p>
      {bundle.maps.map(map => <article key={map.id}><h4>{map.name}</h4>{map.locationName&&<p>Location: {map.locationName}</p>}<p>{map.relationship}</p><p>{coverageLabel[map.coverage]}</p><a className="st-button is-secondary" href={withReturn(map.href, returnTo)} target="_blank" rel="noopener">Show in Atlas</a></article>)}
      {bundle.records.map(record => <article key={`${record.kind}:${record.id}:${record.associationId ?? ""}:${record.versionId ?? ""}`}><h4>{record.name}</h4><p>{record.relationship}</p><p>{coverageLabel[record.coverage]}{record.versionId ? " · Exact saved source" : " · Shared World identity"}</p><a className="st-button is-secondary" href={withReturn(record.href, returnTo)} target="_blank" rel="noopener">Open original World record</a></article>)}
      {subject.kind !== "map" && !bundle.maps.length && <a className="st-button is-secondary" href={worldContextUrl(context, { tab: "atlas" }, returnTo)} target="_blank" rel="noopener">Browse Atlas at this context</a>}
      <p>Links open in a separate tab. Your map or record draft stays here.</p>
    </>}
  </section>;
}
export function WorldRecordMapLinks({ subject, context: explicit }: { subject: WorldAtlasSubject; context?: WorldAtlasContext }) {
  const inherited = useWorldAtlasContext(), context = explicit ?? inherited, [open, setOpen] = useState(false);
  return context ? <details onToggle={event => setOpen(event.currentTarget.open)}><summary>Find in Atlas</summary>{open && <WorldAtlasDiscoveryPanel context={context} subject={subject}/>}</details> : null;
}
