import { z } from "zod";
import { yearSchema, timeBounds, type HistoricalTime, type EntryRecord } from "./history";

export const historyFilterSchema = z.object({
  q:z.string().trim().max(300).default(""), category:z.string().max(160).default(""),
  eventType:z.string().max(160).default(""), era:z.union([z.literal(""),z.literal("none"),z.string().uuid()]).default(""),
  hiddenCategories:z.array(z.string().min(1).max(160)).max(100).default([]),
  from:yearSchema.optional(), to:yearSchema.optional(),
  dateKind:z.enum(["","known","approximate","window","duration","undated"]).default(""),
  accuracy:z.enum(["","established","disputed","unverified","disproven"]).default(""),
  narrative:z.enum(["","recorded","planned"]).default(""), archived:z.boolean().default(false),
}).strict().refine(f=>f.from===undefined||f.to===undefined||f.from<=f.to,"The ending filter year must be at or after the starting year.");
export type HistoryFilter = z.infer<typeof historyFilterSchema>;
export type HistoryIndex = { entries:EntryRecord[]; categories:string[]; eventTypes:string[] };
export function overlapsPeriod(time:HistoricalTime,from?:number,to?:number) {
  if(from===undefined&&to===undefined)return true;
  const bounds=timeBounds(time);
  return !!bounds&&(from===undefined||bounds[1]>=from)&&(to===undefined||bounds[0]<=to);
}
export function historyFiltersFromParams(q:URLSearchParams) {
  return historyFilterSchema.parse({q:q.get("q")??"",category:q.get("category")??"",eventType:q.get("eventType")??"",era:q.get("era")??"",hiddenCategories:q.getAll("hide"),dateKind:q.get("dateKind")??"",accuracy:q.get("accuracy")??"",narrative:q.get("narrative")??"",archived:q.get("archived")==="1",...(q.has("from")?{from:Number(q.get("from"))}:{}),...(q.has("to")?{to:Number(q.get("to"))}:{})});
}
