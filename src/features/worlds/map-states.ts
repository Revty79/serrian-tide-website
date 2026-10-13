import { z } from "zod";
import { atlasId, mapDraftSchema, type AtlasBundle, type MapDraft } from "./atlas";
import { yearSchema } from "./world-year";
import type { CoordinationFinding } from "./historical-connections";

export const mapStateDetailsSchema = z.object({
  name: z.string().trim().min(1, "Name this historical appearance.").max(160),
  startYear: yearSchema, endYear: yearSchema,
  account: z.string().max(12000), protected: z.boolean(),
}).strict().refine(value => value.endYear >= value.startYear, {message:"The ending year must be at or after the beginning.",path:["endYear"]});
export type MapStateDetails = z.infer<typeof mapStateDetailsSchema>;
const revision = z.number().int().positive();
export const mapStateCommandSchema = z.discriminatedUnion("action", [
  z.object({action:z.literal("create"),mapId:atlasId,timelineId:atlasId,sourceVersionId:atlasId.nullable(),baselineRevision:revision,details:mapStateDetailsSchema}).strict(),
  z.object({action:z.literal("save"),mapId:atlasId,timelineId:atlasId,id:atlasId,revision,details:mapStateDetailsSchema,draft:mapDraftSchema}).strict(),
  z.object({action:z.enum(["archive","restore"]),mapId:atlasId,timelineId:atlasId,id:atlasId,revision}).strict(),
  z.object({action:z.literal("retain"),mapId:atlasId,timelineId:atlasId,id:atlasId,sourceVersionId:atlasId,sourceRevision:revision}).strict(),
]);
export type MapStateChoice = MapStateDetails & {id:string;versionId:string;revision:number;archived:boolean;mode:"authored"|"retained"|"interpretation";authorId:string;authoredAt:string;sourceVersionId:string|null;baselineRevision:number};
export type MapStateBundle = {bundle:AtlasBundle;states:MapStateChoice[];parentStates:MapStateChoice[];revisions:MapStateChoice[];selected:MapStateChoice|null;coverage:"baseline"|"established"|"unknown";canEdit:boolean;timelineId:string;timelineName:string;parentTimelineName:string|null;coordinationFindings?:CoordinationFinding[]};
export function resolveMapState<T extends Pick<MapStateChoice,"startYear"|"endYear"|"archived">>(states:T[],year:number):T|null {
  yearSchema.parse(year);
  const matching=states.filter(state=>!state.archived&&state.startYear<=year&&state.endYear>=year);
  if(matching.length>1)throw new Error("Historical map coverage overlaps. Review the authored periods.");
  return matching[0]??null;
}
export function mapStatePeriod(state:Pick<MapStateDetails,"startYear"|"endYear">){return state.startYear===state.endYear?`Year ${state.startYear}`:`Years ${state.startYear} to ${state.endYear}`;}
export function mapStateDraft(payload:MapDraft):MapDraft{return structuredClone(payload);}
