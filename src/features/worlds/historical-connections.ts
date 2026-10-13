import { z } from "zod";
import type { AtlasBundle, AtlasConnection } from "./atlas";
import { yearSchema } from "./world-year";

const id=z.string().uuid(),revision=z.number().int().positive();
export const connectionStatuses={available:"Available",unavailable:"Unavailable",obsolete:"Obsolete",unknown:"Explicitly unknown"} as const;
export const historicalConnectionDraftSchema=z.object({
  name:z.string().trim().min(1).max(160),startYear:yearSchema,endYear:yearSchema,
  status:z.enum(["available","unavailable","obsolete","unknown"]),
  destinationMapId:id.nullable(),destinationGeographyId:id.nullable(),
  account:z.string().trim().min(1,"Explain this connection's source or uncertainty.").max(12000),
  accountYear:yearSchema.nullable(),originalNotation:z.string().max(4000),protected:z.boolean(),
}).strict().superRefine((d,ctx)=>{
  if(d.endYear<d.startYear)ctx.addIssue({code:"custom",message:"The ending year must be at or after the beginning.",path:["endYear"]});
  if((d.status==="available")!==!!d.destinationMapId||d.status!=="available"&&d.destinationGeographyId)ctx.addIssue({code:"custom",message:"Only an available connection chooses a destination; other coverage keeps its original source separately.",path:["destinationMapId"]});
});
export type HistoricalConnectionDraft=z.infer<typeof historicalConnectionDraftSchema>;
export const emptyHistoricalConnection=():HistoricalConnectionDraft=>({name:"New historical connection",startYear:0,endYear:0,status:"unknown",destinationMapId:null,destinationGeographyId:null,account:"",accountYear:null,originalNotation:"",protected:false});
export const historicalConnectionCommandSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("create"),requestId:id,mapId:id,timelineId:id,geographyId:id,sourceVersionId:id.nullable().optional(),draft:historicalConnectionDraftSchema}).strict(),
  z.object({action:z.literal("save"),id,mapId:id,timelineId:id,revision,draft:historicalConnectionDraftSchema}).strict(),
  z.object({action:z.enum(["archive","restore"]),id,mapId:id,timelineId:id,revision}).strict(),
  z.object({action:z.literal("retain"),id,mapId:id,timelineId:id,sourceVersionId:id,sourceRevision:revision}).strict(),
]);
export type ConnectionBaselineSource={id:string;revision:number;sourceMapId:string;geographyId:string;destinationMapId:string;destinationGeographyId:string|null};
export type HistoricalConnectionSource={placeName:string;destinationName:string|null;arrivalName:string|null;baseline:ConnectionBaselineSource|null;ordinary:boolean};
export type HistoricalConnection={id:string;mapId:string;geographyId:string;versionId:string;revision:number;mode:"authored"|"retained"|"interpretation";timelineId:string;sourceTimelineId:string;sourceVersionId:string|null;previousVersionId:string|null;authorId:string;authoredAt:string;archived:boolean;draft:HistoricalConnectionDraft;source:HistoricalConnectionSource};
export type HistoricalConnectionBundle={records:HistoricalConnection[];parentRecords:HistoricalConnection[];revisions:HistoricalConnection[];selected:HistoricalConnection|null;canEdit:boolean;timelineName:string;parentTimelineName:string|null;choices:Pick<AtlasBundle,"maps"|"geographies"|"connections">};
export type HistoricalConnectionPolicy={geographyId:string;status:HistoricalConnectionDraft["status"]|"reference";basis:HistoricalConnection["mode"]|"baseline-reference"|"unknown";connection:AtlasConnection|null;name?:string;versionId?:string;message:string};
export type CoordinationFinding={code:"unknown-appearance"|"unavailable-destination"|"unavailable-arrival"|"branch-coverage"|"different-place"|"different-politics";message:string;geographyId:string;destinationMapId?:string};
export function resolveHistoricalConnections(records:HistoricalConnection[],year:number){
  yearSchema.parse(year);const byPlace=new Map<string,HistoricalConnection>();
  for(const r of records.filter(r=>!r.archived&&r.draft.startYear<=year&&r.draft.endYear>=year)){if(byPlace.has(r.geographyId))throw new Error("Historical connection periods overlap for this place. Review the saved sources.");byPlace.set(r.geographyId,r);}
  return byPlace;
}
export function connectionPeriod(d:Pick<HistoricalConnectionDraft,"startYear"|"endYear">){return d.startYear===d.endYear?`Year ${d.startYear}`:`Years ${d.startYear} to ${d.endYear}`;}
