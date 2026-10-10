import { z } from "zod";
import { historicalTimeSchema, type HistoricalTime } from "./history";
import { endpointSchema, type CalendarAnchor, type CalendarEndpoint } from "./calendar-dates";
const name=z.string().trim().min(1).max(160),notes=z.string().max(4000),id=z.string().uuid();
export const calendarPeriodSchema=z.object({time:historicalTimeSchema,notes,continues:z.boolean().default(false)}).strict().refine(value=>!value.continues||value.time.kind!=="duration","A known duration has a recorded end; choose a beginning or uncertain starting window for an open-ended period.");
export const adoptionSchema=z.object({label:name,versionId:id,period:calendarPeriodSchema}).strict();
export const reformSchema=z.object({name,predecessorId:id,successorId:id,time:historicalTimeSchema,reason:z.string().trim().min(1).max(4000),details:notes,entryId:id.nullable(),cutover:z.object({before:endpointSchema,after:endpointSchema}).strict().nullable()}).strict().refine(value=>value.predecessorId!==value.successorId,"Choose two different rule versions.");
export type CalendarPeriod=z.infer<typeof calendarPeriodSchema>;
export type AdoptionDraft=z.infer<typeof adoptionSchema>;
export type ReformDraft=z.infer<typeof reformSchema>;
export type VersionHistory={versionId:string;period:CalendarPeriod;revision:number};
export type CalendarAdoption=AdoptionDraft & {id:string;revision:number;archived:boolean};
export type CalendarReform=Omit<ReformDraft,"cutover"> & {id:string;revision:number;archived:boolean;cutover:{before:CalendarEndpoint;after:CalendarEndpoint}|null};
export type CalendarEvolution={reference:{label:string;description:string}|null;anchors:CalendarAnchor[];histories:VersionHistory[];adoptions:CalendarAdoption[];reforms:CalendarReform[]};
export const emptyPeriod=():CalendarPeriod=>({time:{version:1,scale:"world-year",kind:"undated"},notes:"",continues:false});
export function historicalPeriod(kind:HistoricalTime["kind"],first=0,last=first):HistoricalTime{return kind==="undated"?{version:1,scale:"world-year",kind}:kind==="known"||kind==="approximate"?{version:1,scale:"world-year",kind,year:first}:{version:1,scale:"world-year",kind,startYear:first,endYear:last};}
