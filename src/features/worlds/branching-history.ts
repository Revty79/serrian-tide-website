import { z } from "zod";
import { timeBounds, type EntryRecord, type EraRecord } from "./history";
import { yearSchema } from "./world-year";

export const HISTORY_LIMIT = 5000;
export const TIMELINE_LIMIT = 256;
export const timelineDraftSchema = z.object({
  name: z.string().trim().min(1, "Name this history.").max(160),
  description: z.string().max(50_000).default(""),
  explanation: z.string().max(50_000).default(""),
}).strict();
export const branchDraftSchema = timelineDraftSchema.extend({ parentId: z.string().uuid(), divergenceYear: yearSchema }).strict();
export type TimelineDraft = z.infer<typeof timelineDraftSchema>;
export type WorldTimeline = TimelineDraft & { id: string; worldId: string; primary: boolean; parentId: string | null; divergenceYear: number | null; revision: number; archived: boolean };
export type InheritanceMode = "authored" | "inherited" | "partial" | "pending" | "excluded" | "interpretation";
export type HistoricalSnapshot = EntryRecord | EraRecord;
export type HistoryContext = {
  mode: InheritanceMode; timelineId: string; versionId: string; sourceTimelineId: string | null;
  sourceVersionId: string | null; sourceRevision: number | null; newerParent: boolean;
  parentRevision: number | null; parentVersionId: string | null; coveredUntil: number | null;
};
export type InheritanceReview = { entity: "entry" | "era"; record: HistoricalSnapshot; context: HistoryContext };
export function inheritanceMode(entity: "entry" | "era", record: HistoricalSnapshot, year: number): "inherited" | "partial" | "pending" | "excluded" {
  if (record.archived) return "excluded";
  if (entity === "era") {
    const era = record as EraRecord;
    if (era.startYear === null) return "pending";
    if (era.startYear >= year) return "excluded";
    return era.endYear === null || era.endYear >= year ? "partial" : "inherited";
  }
  const entry = record as EntryRecord, bounds = timeBounds(entry.time);
  if (!bounds) return "pending";
  if (bounds[0] >= year) return "excluded";
  // Approximation has no authored tolerance. A center point cannot prove an event predates divergence.
  if (entry.time.kind === "approximate" || bounds[1] >= year || entry.narrative === "planned") return "pending";
  return "inherited";
}
export function inheritedProjection(record: HistoricalSnapshot, context: HistoryContext): HistoricalSnapshot {
  // Retain the complete original source in immutable storage; the branch knows only its pre-boundary existence.
  return context.mode === "partial" && "startYear" in record ? { ...record, endYear: null, historyContext: context } : { ...record, historyContext: context };
}
export function historyContextLabel(context?: HistoryContext) {
  if (!context) return "Authored history";
  return { authored: "Authored in this timeline", inherited: "Inherited source", partial: "Pre-divergence era; continuation unknown", pending: "Unresolved inheritance", excluded: "Not inherited / excluded", interpretation: "Branch interpretation" }[context.mode];
}
