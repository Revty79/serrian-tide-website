import { z } from "zod";
import { dayIndex, dateAtIndex, dateLabel, type CalendarDate, type CalendarRules } from "./calendar";
import { yearSchema } from "./world-year";
// Canonical decimal integers across JSON; calculations never pass through Number.
export const elapsedDaySchema=z.string().regex(/^(0|-?[1-9]\d{0,19})$/, "Use a signed whole elapsed-day number with at most twenty digits, without leading zeros.");
export const calendarDateSchema=z.object({year:yearSchema,month:z.number().int().min(1).max(40),day:z.number().int().min(0).max(400),intercalaryId:z.string().uuid().optional()}).strict();
export const endpointSchema=z.object({versionId:z.string().uuid(),revision:z.number().int().positive(),date:calendarDateSchema}).strict();
export const calendarEntryDraftSchema=z.discriminatedUnion("kind",[
  z.object({kind:z.enum(["known","approximate"]),start:endpointSchema}).strict(),
  z.object({kind:z.enum(["window","duration"]),start:endpointSchema,end:endpointSchema}).strict(),
]);
export type CalendarEntryDraft=z.infer<typeof calendarEntryDraftSchema>;
export type CalendarAnchor={versionId:string;date:CalendarDate;elapsedDay:string};
export type CalendarEndpoint={versionId:string;revision:number;calendarId:string;calendarName:string;versionTitle:string;date:CalendarDate;elapsedDay:string;notation:string};
export type CalendarSource={version:1;kind:CalendarEntryDraft["kind"];start:CalendarEndpoint;end?:CalendarEndpoint};
export function toElapsed(rules:CalendarRules,anchor:CalendarAnchor|undefined,date:CalendarDate):string {
  if(!anchor)throw new Error("This version has no authored day anchor. Exact conversion is unavailable.");
  return elapsedDaySchema.parse((BigInt(anchor.elapsedDay)+dayIndex(rules,date)-dayIndex(rules,anchor.date)).toString());
}
export function fromElapsed(rules:CalendarRules,anchor:CalendarAnchor|undefined,elapsed:string):CalendarDate {
  if(!anchor)throw new Error("This version has no authored day anchor. Exact conversion is unavailable.");
  return dateAtIndex(rules,dayIndex(rules,anchor.date)+BigInt(elapsedDaySchema.parse(elapsed))-BigInt(anchor.elapsedDay));
}
export function convertDate(from:{rules:CalendarRules;anchor?:CalendarAnchor},to:{rules:CalendarRules;anchor?:CalendarAnchor},date:CalendarDate){return fromElapsed(to.rules,to.anchor,toElapsed(from.rules,from.anchor,date));}
export function sourceLabel(source:CalendarSource){const prefix=source.kind==="approximate"?"Around ":source.kind==="window"?"Sometime between ":"";return `${prefix}${source.start.notation}${source.end?` ${source.kind==="duration"?"through":"and"} ${source.end.notation}`:""}`;}
export function endpointNotation(rules:CalendarRules,date:CalendarDate){return dateLabel(rules,date);}
export function validateCutover(before:string,after:string){if(BigInt(after)!==BigInt(before)+BigInt("1"))throw new Error("The successor's first day must immediately follow the predecessor's last day on the shared elapsed-day reference.");}
