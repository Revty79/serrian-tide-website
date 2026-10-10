import { timeBounds, YEAR_LIMIT, type EntryRecord, type EraRecord } from "./history";

export type Viewport = { start: number; end: number };
export function normalizeViewport(start: number, end: number): Viewport {
  const span = Math.max(2, Math.min(YEAR_LIMIT * 2, end - start));
  const nextStart = Math.max(-YEAR_LIMIT, Math.min(YEAR_LIMIT - span, start));
  return { start: nextStart, end: nextStart + span };
}
export function fitHistory(eras: EraRecord[], entries: EntryRecord[]): Viewport {
  let min = Infinity, max = -Infinity;
  for (const era of eras) for (const year of [era.startYear, era.endYear]) if (year !== null) { min = Math.min(min, year); max = Math.max(max, year); }
  for (const entry of entries) { const range = timeBounds(entry.time); if (range) { min = Math.min(min, range[0]); max = Math.max(max, range[1]); } }
  if (!Number.isFinite(min)) return { start: -100, end: 100 };
  const padding = Math.max(10, (max - min) * .08);
  return normalizeViewport(min - padding, max + padding);
}
export function zoomViewport(view: Viewport, factor: number): Viewport {
  const center = (view.start + view.end) / 2, half = (view.end - view.start) * factor / 2;
  return normalizeViewport(center - half, center + half);
}
export function panViewport(view: Viewport, fraction: number): Viewport { const shift = (view.end - view.start) * fraction; return normalizeViewport(view.start + shift, view.end + shift); }
export function gotoYear(view: Viewport, year: number): Viewport { const half = (view.end - view.start) / 2; return normalizeViewport(year - half, year + half); }
export function timelineTicks(view: Viewport, count = 8): number[] {
  const target = (view.end - view.start) / count;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, target)));
  const step = [1,2,5,10].map((n) => n * magnitude).find((n) => n >= target) ?? magnitude * 10;
  const ticks: number[] = [];
  for (let year = Math.ceil(view.start / step) * step; year <= view.end && ticks.length < 16; year += step) ticks.push(Object.is(year, -0) ? 0 : year);
  return ticks;
}
export function position(year: number, view: Viewport) { return 100 * (year - view.start) / (view.end - view.start); }
export type TimelineGroup = { entries: EntryRecord[]; start: number; end: number; lane: number };
/** Pixel buckets and lane packing keep crowded history selectable without one node per year. */
export function groupTimelineEntries(entries: EntryRecord[], view: Viewport, width: number): TimelineGroup[] {
  const groups = new Map<string, TimelineGroup>();
  const bucketCount = Math.max(1, Math.floor(width / 54));
  for (const entry of entries) {
    const range = timeBounds(entry.time);
    if (!range || range[1] < view.start || range[0] > view.end) continue;
    const start = Math.max(view.start, range[0]), end = Math.min(view.end, range[1]);
    const key = `${Math.floor(position(start, view) * bucketCount / 100)}:${Math.floor(position(end, view) * bucketCount / 100)}:${entry.time.kind}:${entry.narrative}:${entry.accuracy}`;
    const existing = groups.get(key);
    if (existing) { existing.entries.push(entry); existing.start = Math.min(existing.start, start); existing.end = Math.max(existing.end, end); }
    else groups.set(key, { entries: [entry], start, end, lane: 0 });
  }
  const packed = [...groups.values()].sort((a,b) => a.start - b.start || a.end - b.end);
  const ends: number[] = [];
  for (const group of packed) {
    const anchor = position(group.start, view);
    const markerWidth = 100 * (width < 500 ? 110 : 140) / Math.max(1,width);
    const isSpan = group.entries[0].time.kind === "duration" || group.entries[0].time.kind === "window";
    const left = !isSpan && anchor > 75 ? Math.max(0,anchor-markerWidth) : anchor;
    const right = isSpan ? Math.max(position(group.end,view),left + 100 * 44 / Math.max(1,width)) : left + markerWidth;
    let lane = ends.findIndex((end) => end + 2 < left);
    if (lane < 0) lane = ends.length;
    group.lane = lane; ends[lane] = right;
  }
  return packed;
}
