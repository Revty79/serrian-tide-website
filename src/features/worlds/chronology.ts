import { z } from "zod";
import { YEAR_LIMIT, yearSchema, yearLabel, timeLabel, eraLabel, type HistoricalTime } from "./history";

export const numberingRules = ["year-zero", "no-year-zero"] as const;
export const datingDraftSchema = z.object({
  name: z.string().trim().min(1,"Name this dating system.").max(160),
  description: z.string().max(4000).default(""),
  origin: z.string().trim().min(1,"Describe the historical origin.").max(1000),
  epochYear: yearSchema,
  numbering: z.enum(numberingRules),
  beforeLabel: z.string().trim().min(1,"Enter a label for years before the origin.").max(80),
  afterLabel: z.string().trim().min(1,"Enter a label for years after the origin.").max(80),
  notes: z.string().max(50000).default(""),
}).strict();
export type DatingDraft = z.infer<typeof datingDraftSchema>;
export type Reckoning = Pick<DatingDraft,"epochYear"|"numbering"|"beforeLabel"|"afterLabel">;
export type DatingSystem = DatingDraft & {id:string;worldId:string;revision:number;archived:boolean;referenced:boolean};
export type SourceDating = Reckoning & {version:1;kind:"year-reckoning";systemId:string;revision:number;name:string;origin:string;years:(number|null)[]};
export const DISPLAY_YEAR_LIMIT = YEAR_LIMIT * 2 + 1;
export function toReckoning(canonical: number, system?: Reckoning | null): number {
  yearSchema.parse(canonical);
  if (!system) return canonical;
  yearSchema.parse(system.epochYear);
  z.enum(numberingRules).parse(system.numbering);
  const delta = canonical - system.epochYear;
  return system.numbering === "no-year-zero" && delta >= 0 ? delta + 1 : delta;
}
export function fromReckoning(display: number, system?: Reckoning | null): number {
  if (!Number.isSafeInteger(display)) throw new Error("Enter a whole year.");
  if (system) yearSchema.parse(system.epochYear);
  if (system) z.enum(numberingRules).parse(system.numbering);
  if (system?.numbering === "no-year-zero" && display === 0) throw new Error("This reckoning has no Year 0. Use -1 for Year 1 Before or 1 for Year 1 After.");
  const canonical = system ? system.epochYear + (system.numbering === "no-year-zero" && display > 0 ? display - 1 : display) : display;
  if (!Number.isSafeInteger(canonical) || Math.abs(canonical) > YEAR_LIMIT) throw new Error("This year falls outside the world's canonical range of minus one trillion through one trillion.");
  return canonical;
}
export function formatYear(canonical:number, system?:Reckoning|null) {
  const value = toReckoning(canonical,system);
  return !system ? `Year ${yearLabel(value)}` : value === 0 ? "Year 0" : `Year ${yearLabel(Math.abs(value))} ${value < 0 ? system.beforeLabel : system.afterLabel}`;
}
export function formatTime(time:HistoricalTime, system?:Reckoning|null):string {
  if (!system || time.kind === "undated") return timeLabel(time);
  if (time.kind === "known") return formatYear(time.year,system);
  if (time.kind === "approximate") return `Around ${formatYear(time.year,system)}`;
  const range = `${formatYear(time.startYear,system)} → ${formatYear(time.endYear,system)}`;
  return time.kind === "window" ? `Sometime between ${range}` : range;
}
export function formatEra(era:{startYear:number|null;endYear:number|null}, system?:Reckoning|null) {
  if (!system) return eraLabel(era);
  return `${era.startYear === null ? "Unknown beginning" : formatYear(era.startYear,system)} → ${era.endYear === null ? "Unknown ending" : formatYear(era.endYear,system)}`;
}
export function datingDraftOf(system?:DatingSystem):DatingDraft {
  return system ? {name:system.name,description:system.description,origin:system.origin,epochYear:system.epochYear,numbering:system.numbering,beforeLabel:system.beforeLabel,afterLabel:system.afterLabel,notes:system.notes}
    : {name:"",description:"",origin:"",epochYear:0,numbering:"no-year-zero",beforeLabel:"Before origin",afterLabel:"After origin",notes:""};
}
