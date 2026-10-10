import { z } from "zod";
import type { DatingSystem, SourceDating } from "./chronology";
import { calendarEntryDraftSchema, type CalendarSource } from "./calendar-dates";
import { yearSchema } from "./world-year";
export { YEAR_LIMIT, yearSchema } from "./world-year";

const base = { version: z.literal(1), scale: z.literal("world-year") };
export const historicalTimeSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("known"), year: yearSchema }).strict(),
  z.object({ ...base, kind: z.literal("approximate"), year: yearSchema }).strict(),
  z.object({ ...base, kind: z.literal("window"), startYear: yearSchema, endYear: yearSchema }).strict(),
  z.object({ ...base, kind: z.literal("duration"), startYear: yearSchema, endYear: yearSchema }).strict(),
  z.object({ ...base, kind: z.literal("undated") }).strict(),
]).refine((time) => !("startYear" in time) || time.startYear <= time.endYear, "The ending year must be at or after the starting year.");
export type HistoricalTime = z.infer<typeof historicalTimeSchema>;
export const accuracyLabels = { established: "Established", disputed: "Disputed", unverified: "Unverified", disproven: "Disproven" } as const;
export const narrativeLabels = { recorded: "Recorded history", planned: "Planned development" } as const;
export const dateLabels = { known: "Known year", approximate: "Approximate year", window: "Uncertain occurrence window", duration: "Known duration", undated: "Undated / unknown" } as const;
export const tones = ["primary", "secondary", "info", "muted"] as const;
export type Tone = typeof tones[number];
const name = z.string().trim().min(1, "Enter a name.").max(160);
const account = z.string().max(50_000);
export const worldDraftSchema = z.object({ name, description: z.string().max(4000).default(""), introduction: account.default(""), historicalOverview: account.default(""), tone: z.enum(tones).default("primary"), tagIds: z.array(z.number().int().positive()).max(40).default([]) }).strict();
const sourceFields = { datingSystemId: z.string().uuid().nullable().optional(), datingSystemRevision: z.number().int().positive().optional() };
export const eraDraftSchema = z.object({ name, description: account.default(""), startYear: yearSchema.nullable(), endYear: yearSchema.nullable(), tone: z.enum(tones).default("primary"), ...sourceFields }).strict().refine((era) => era.startYear === null || era.endYear === null || era.startYear <= era.endYear, "The ending year must be at or after the starting year.");
export const entryDraftSchema = z.object({ title: name, account: account.trim().min(1, "Write a historical account."), notes: account.default(""), time: historicalTimeSchema, accuracy: z.enum(["established", "disputed", "unverified", "disproven"]), narrative: z.enum(["recorded", "planned"]), eraIds: z.array(z.string().uuid()).max(100).default([]), calendarDate:calendarEntryDraftSchema.nullable().optional(), ...sourceFields }).strict();
export type WorldDraft = z.infer<typeof worldDraftSchema>;
export type EraDraft = z.infer<typeof eraDraftSchema>;
export type EntryDraft = z.infer<typeof entryDraftSchema>;
export type WorldRecord = WorldDraft & { id: string; ownerId: string; ownerName: string; revision: number; archived: boolean; updatedAt: string; eraCount: number; entryCount: number };
export type EraRecord = EraDraft & { id: string; worldId: string; revision: number; archived: boolean; sourceDating?: SourceDating|null };
export type EntryRecord = EntryDraft & { id: string; worldId: string; revision: number; archived: boolean; updatedAt: string; sourceDating?: SourceDating|null; calendarSource?:CalendarSource|null };
export type TagReference = { id: number; name: string; tagGroup: string; description: string };
export type WorldBundle = { world: WorldRecord; eras: EraRecord[]; entries: EntryRecord[]; canEdit: boolean; datingSystems:DatingSystem[]; defaultDatingSystemId:string|null };
export function yearLabel(year: number) { return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(year); }
export function timeBounds(time: HistoricalTime): [number, number] | null {
  if (time.kind === "undated") return null;
  return "year" in time ? [time.year, time.year] : [time.startYear, time.endYear];
}
export function timeLabel(time: HistoricalTime): string {
  if (time.kind === "undated") return "Date unknown";
  if (time.kind === "known") return `Year ${yearLabel(time.year)}`;
  if (time.kind === "approximate") return `Around Year ${yearLabel(time.year)}`;
  if (time.kind === "window") return `Sometime between ${yearLabel(time.startYear)} and ${yearLabel(time.endYear)}`;
  return `Years ${yearLabel(time.startYear)}–${yearLabel(time.endYear)}`;
}
export function eraLabel(era: Pick<EraDraft, "startYear" | "endYear">) {
  return `${era.startYear === null ? "Unknown beginning" : yearLabel(era.startYear)} → ${era.endYear === null ? "Unknown ending" : yearLabel(era.endYear)}`;
}
export function chronologicalEntries(entries: EntryRecord[]) {
  return [...entries].sort((a,b) => {
    const first = timeBounds(a.time), second = timeBounds(b.time);
    if (!first) return second ? 1 : a.title.localeCompare(b.title);
    if (!second) return -1;
    return first[0] - second[0] || first[1] - second[1] || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
  });
}
