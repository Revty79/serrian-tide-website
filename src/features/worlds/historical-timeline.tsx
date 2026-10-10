"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Maximize2, Minus, Plus } from "lucide-react";
import { yearLabel, type EntryRecord, type EraRecord } from "./history";
import { fitHistory, gotoYear, groupTimelineEntries, panViewport, position, timelineTicks, zoomViewport, type Viewport } from "./timeline";
import styles from "./worlds.module.css";
import { DISPLAY_YEAR_LIMIT, formatEra, formatTime, formatYear, fromReckoning, type DatingSystem } from "./chronology";
export function HistoricalTimeline({ eras, entries, onEntry, onEra, compact = false, displaySystem = null }: { eras: EraRecord[]; entries: EntryRecord[]; onEntry: (entry: EntryRecord) => void; onEra: (era: EraRecord) => void; compact?: boolean; displaySystem?:DatingSystem|null }) {
  const [view, setView] = useState<Viewport>(() => fitHistory(eras, entries));
  const [width, setWidth] = useState(900);
  const [jump, setJump] = useState({value:"",systemId:displaySystem?.id ?? null});
  const year = jump.systemId === (displaySystem?.id ?? null) ? jump.value : "";
  const [yearError, setYearError] = useState("");
  const [crowd, setCrowd] = useState<string[]>([]);
  const [undatedLimit, setUndatedLimit] = useState(12);
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; view: Viewport } | null>(null);
  useEffect(() => { if (!root.current) return; const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width)); observer.observe(root.current); return () => observer.disconnect(); }, []);
  const groups = useMemo(() => groupTimelineEntries(entries, view, width), [entries, view, width]);
  const visibleGroups = groups.slice(0, 200);
  const knownEnd=(era:EraRecord)=>era.historyContext?.mode==="partial"?era.historyContext.coveredUntil:era.endYear;
  const visibleEras = eras.filter((era) => (knownEnd(era) === null || knownEnd(era)! >= view.start) && (era.startYear === null || era.startYear <= view.end)).slice(0, 40);
  const lanes = visibleGroups.reduce((max, group) => Math.max(max, group.lane + 1), 1);
  const undated = entries.filter((entry) => entry.time.kind === "undated");
  function fit() { setView(fitHistory(eras, entries)); }
  return <section className={styles.timeline} aria-label="Historical timeline">
    <div className={styles.timelineHeading}><div><p className={styles.eyebrow}>Explore the ages</p><h2>{compact ? "History at a glance" : "Historical timeline"}</h2></div><span className={styles.privateBadge}>Viewing history</span></div>
    <div className={styles.timelineToolbar}>
      <div className={styles.actions}><button className="st-button is-secondary" aria-label="Earlier years" onClick={() => setView(panViewport(view, -.4))}><ArrowLeft size={17} /></button><button className="st-button is-secondary" aria-label="Later years" onClick={() => setView(panViewport(view, .4))}><ArrowRight size={17} /></button><button className="st-button is-secondary" aria-label="Zoom out" onClick={() => setView(zoomViewport(view, 2))}><Minus size={17} /></button><button className="st-button is-secondary" aria-label="Zoom in" onClick={() => setView(zoomViewport(view, .5))}><Plus size={17} /></button><button className="st-button is-secondary" onClick={fit}><Maximize2 size={17} /><span>Fit history</span></button></div>
      <form className={styles.yearJump} onSubmit={(event) => { event.preventDefault(); try { if (!year.trim()) throw new Error("Enter a year in the selected dating convention."); const value = fromReckoning(Number(year),displaySystem); setYearError(""); setView(gotoYear(view,value)); } catch(failure) {setYearError(failure instanceof Error ? failure.message : "Enter a valid year.");} }}><label htmlFor={compact ? "preview-year" : "history-year"}>Go to year</label><input className="st-control" id={compact ? "preview-year" : "history-year"} type="number" step="1" min={-DISPLAY_YEAR_LIMIT} max={DISPLAY_YEAR_LIMIT} value={year} aria-describedby={compact ? "preview-year-guide" : "history-year-guide"} onChange={(e) => setJump({value:e.target.value,systemId:displaySystem?.id ?? null})} /><button className="st-button is-secondary">Go</button></form>
    </div>
    {yearError && <p role="alert" className={styles.feedback}>{yearError}</p>}
    <p className={styles.range} aria-live="polite">{displaySystem ? `${formatYear(Math.round(view.start),displaySystem)} to ${formatYear(Math.round(view.end),displaySystem)}` : `Years ${yearLabel(Math.round(view.start))} to ${yearLabel(Math.round(view.end))}`}</p>
    <div className={styles.timelineViewport} ref={root} tabIndex={0} role="region" aria-label="Timeline canvas. Arrow keys move through years; plus and minus zoom; Home fits history." onKeyDown={(event) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setView(panViewport(view, event.key === "ArrowLeft" ? -.2 : .2)); }
      else if (event.key === "+" || event.key === "=" || event.key === "-") { event.preventDefault(); setView(zoomViewport(view, event.key === "-" ? 2 : .5)); }
      else if (event.key === "Home") { event.preventDefault(); fit(); }
    }} onPointerDown={(event) => { if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return; drag.current = {x:event.clientX,view}; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (!drag.current) return; const fraction = -(event.clientX - drag.current.x) / Math.max(1,width); setView(panViewport(drag.current.view,fraction)); }} onPointerUp={() => {drag.current = null;}} onPointerCancel={() => {drag.current = null;}}>
      <div className={styles.axis}>{timelineTicks(view, width < 500 ? 3 : 8).map((tick) => <span key={tick} title={formatYear(tick,displaySystem)} style={{left:`${position(tick,view)}%`}}>{displaySystem ? formatYear(tick,displaySystem) : yearLabel(tick)}</span>)}</div>
      <div className={styles.eraBands}>{visibleEras.map((era) => {
        const left = Math.min(100 - 4400 / Math.max(44,width),position(Math.max(view.start,era.startYear ?? view.start),view)), right = position(Math.min(view.end,knownEnd(era) ?? view.end),view);
        const partial=era.historyContext?.mode==="partial";
        return <div key={era.id} className={styles.eraLane}><button className={styles.eraBand} data-tone={era.tone} data-open={era.startYear === null || era.endYear === null} data-known-through={partial?era.historyContext?.coveredUntil:undefined} style={{marginLeft:`${left}%`,width:`${Math.max(1,right-left)}%`}} onClick={() => onEra(era)} title={`${era.name}: ${partial?`Existence known through Year ${era.historyContext?.coveredUntil}; continuation unknown`:formatEra(era,displaySystem)}`}><span>{era.name}</span><small>{partial?"Pre-divergence existence only":formatEra(era,displaySystem)}</small></button></div>;
      })}</div>
      <div className={styles.eventStage} style={{height:`${Math.max(100,lanes*58 + 24)}px`}}>
        {visibleGroups.map((group) => {
          const entry = group.entries[0], left = position(group.start,view);
          return <button key={`${entry.id}:${group.entries.length}`} className={styles.eventMarker} data-kind={entry.time.kind} data-edge={left > 75 && entry.time.kind !== "duration" && entry.time.kind !== "window" ? "end" : undefined} data-planned={entry.narrative === "planned"} data-accuracy={entry.accuracy} style={{left:`${entry.time.kind === "duration" || entry.time.kind === "window" ? Math.min(left,100 - 4400 / Math.max(44,width)) : left}%`,top:`${group.lane*58 + 12}px`,width:entry.time.kind === "duration" || entry.time.kind === "window" ? `max(44px, ${position(group.end,view)-left}%)` : undefined}} onClick={() => group.entries.length === 1 ? onEntry(entry) : setCrowd(group.entries.map((item) => item.id))} aria-label={group.entries.length > 1 ? `Open ${group.entries.length} entries near ${displaySystem ? formatYear(group.start,displaySystem) : `Year ${yearLabel(group.start)}`}` : `${entry.title}. ${formatTime(entry.time,displaySystem)}. ${entry.narrative === "planned" ? "Planned development. " : ""}${entry.accuracy}`} title={`${entry.title} · ${formatTime(entry.time,displaySystem)}`}><span className={styles.markerDot} aria-hidden="true">{entry.time.kind === "approximate" ? "≈" : entry.accuracy === "disputed" || entry.accuracy === "unverified" ? "?" : "◆"}</span><span>{group.entries.length > 1 ? `${group.entries.length} entries` : entry.title}</span></button>;
        })}
        {!groups.length && <p className={styles.axisEmpty}>{entries.some((entry) => entry.time.kind !== "undated") ? "No dated entries in this view. Fit history to return to them." : "Your dated history will take shape here."}</p>}
      </div>
    </div>
    <div className={styles.legend}><span>◆ Known event</span><span>≈ Approximate</span><span>Dashed span: uncertain window</span><span>Solid span: duration</span><span>Dashed outline: planned</span><span>? Disputed / unverified</span><span>Struck title: disproven</span></div>
    <p className={styles.caption} id={compact ? "preview-year-guide" : "history-year-guide"}>Year navigation uses {displaySystem?.name ?? "canonical world years"}; negative inputs mean Before and positive inputs mean After. {displaySystem?.numbering === "no-year-zero" ? "This convention excludes Year 0. " : "Year 0 is supported. "}Drag to explore, or use the arrow and zoom buttons. Keyboard: arrows, +, − and Home. Viewing history never advances a Campaign clock.</p>
    {(groups.length > 200 || eras.length > 40) && <p className={styles.feedback}>This view shows up to 200 event groups and 40 era bands. Zoom or filter to focus the timeline; the chronological view includes every matching entry.</p>}
    {crowd.length > 0 && <section className={styles.crowd} aria-label="Grouped historical entries"><div className={styles.sectionHeading}><h3>History gathered here</h3><button className="st-button is-ghost" onClick={() => setCrowd([])}>Close group</button></div>{entries.filter((entry) => crowd.includes(entry.id)).map((entry) => <button key={entry.id} className={styles.readingLink} onClick={() => onEntry(entry)}><span>{entry.title}</span><small>{formatTime(entry.time,displaySystem)}</small></button>)}</section>}
    {undated.length > 0 && <section className={styles.undated} aria-label="Undated entries"><h3>Beyond the dated record <span>{undated.length}</span></h3><p className={styles.muted}>These accounts have no canonical World year. Calendar dates, when recorded, remain available in account details.</p><div className={styles.undatedGrid}>{undated.slice(0,undatedLimit).map((entry) => <button className={styles.readingLink} key={entry.id} onClick={() => onEntry(entry)}><span>{entry.title}</span><small>{entry.narrative === "planned" ? "Planned development" : entry.calendarSource?"Calendar context; World year unknown":"Date unknown"}</small></button>)}</div>{undated.length > undatedLimit && <button className="st-button is-secondary" onClick={() => setUndatedLimit(undatedLimit+24)}>Show more undated entries</button>}</section>}
  </section>;
}
