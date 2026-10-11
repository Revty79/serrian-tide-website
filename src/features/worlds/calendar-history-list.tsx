"use client";
import { useEffect, useRef, useState } from "react";
import type { CalendarHistoryPage } from "./calendar-history";
import { sourceLabel } from "./calendar-dates";
import { worldApi } from "./client-api";
import styles from "./calendar.module.css";

export function CalendarHistoryList({worldId, timelineId, versionId, review, ordinary, onReadEntry}: {
  worldId: string; timelineId: string; versionId: string; review: boolean; ordinary: boolean; onReadEntry: (id: string) => void;
}) {
  const [includeArchived, setIncludeArchived] = useState(false);
  const [result, setResult] = useState<CalendarHistoryPage | null>(null), [loadedApi, setLoadedApi] = useState("");
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  const requestGeneration = useRef(0);
  const query = new URLSearchParams({timeline: timelineId, version: versionId});
  if (review) query.set("review", "1");
  if (ordinary) query.set("ordinary", "1");
  if (includeArchived) query.set("archived", "1");
  const api = `/api/worlds/${worldId}/calendars/history?${query}`;
  // A new context has no readable rows until its own projection is ready.
  const data = loadedApi === api ? result : null;
  useEffect(() => {
    const tracker = requestGeneration;
    const generation = ++tracker.current;
    let alive = true;
    worldApi<CalendarHistoryPage>(api).then(fresh => {
      if (alive && generation === tracker.current) {setResult(fresh); setLoadedApi(api); setError(""); setPending(false);}
    }).catch(failure => {if (alive && generation === tracker.current) {setResult(null); setLoadedApi(api); setError(failure.message); setPending(false);}});
    return () => {alive = false; ++tracker.current;};
  }, [api, retry]);
  async function more() {
    if (!data || data.nextOffset === null || pending) return;
    const generation = requestGeneration.current;
    setPending(true); setError("");
    try {
      const fresh = await worldApi<CalendarHistoryPage>(`${api}&offset=${data.nextOffset}`);
      if (generation !== requestGeneration.current) return;
      // Store the request's context with the response; late pages from another
      // archive/context choice cannot be rendered in the current one.
      setResult({entries: [...data.entries, ...fresh.entries.filter(e => !data.entries.some(previous => previous.id === e.id))], nextOffset: fresh.nextOffset});
      setLoadedApi(api);
    } catch (failure) {if (generation === requestGeneration.current) setError((failure as Error).message);} finally {if (generation === requestGeneration.current) setPending(false);}
  }
  return <section aria-label="Calendar historical accounts">
    <h3>History using this definition</h3>
    <label className={styles.archiveToggle}><input type="checkbox" checked={includeArchived} onChange={event => setIncludeArchived(event.target.checked)}/>Include archived calendar accounts</label>
    <p className={styles.caption}>Read saved accounts in the selected timeline. Ordinary knowledge includes only accounts whose saved references are also available.</p>
    {!data && !error && <p role="status">Opening calendar accounts…</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" className="st-button is-secondary" onClick={() => {setError(""); setRetry(value => value + 1);}}>Reload calendar accounts</button></div>}
    {data?.entries.map(entry => <button type="button" className={styles.agendaItem} key={entry.id} onClick={() => onReadEntry(entry.id)}><strong>{entry.title}{entry.narrative === "planned" ? " · planned" : ""}{entry.archived ? " · archived" : ""}</strong><span>{sourceLabel(entry.calendarSource!)}</span></button>)}
    {data?.entries.length === 0 && <p>No available accounts use this definition in the selected timeline.</p>}
    {data?.nextOffset !== null && data && <button type="button" className="st-button is-secondary" disabled={pending} onClick={() => void more()}>{pending ? "Opening more accounts…" : "Load more calendar accounts"}</button>}
  </section>;
}
