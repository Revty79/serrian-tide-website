import { z } from "zod";
export const townDraftSchema = z.object({
  name: z.string().trim().min(1,"Give this settlement a name.").max(160), category: z.string().trim().max(120).default("settlement"),
  locationNotes:z.string().max(1000).default(""), description: z.string().max(12000).default(""), background: z.string().max(12000).default(""), population: z.string().max(1200).default(""),
  cultureId: z.uuid().nullable().default(null), governmentId: z.uuid().nullable().default(null), historyIds: z.array(z.uuid()).max(100).default([]), godNotes: z.string().max(12000).default(""),
}).strict().refine(d=>new Set(d.historyIds).size===d.historyIds.length,"Choose each historical account once.");
export type TownDraft = z.infer<typeof townDraftSchema>;
export const emptyTown: TownDraft = {name:"",category:"settlement",description:"",locationNotes:"",background:"",population:"",cultureId:null,governmentId:null,historyIds:[],godNotes:""};
export type TownSummary = {id:string;name:string;category:string;description?:string;locationNotes?:string;revision:number;geographyRevision:number;archived:boolean};
export type TownRecord = TownSummary & {draft:TownDraft;archiveReason?:string};
export type TownReferences = {cultures:{id:string;name:string;archived:boolean}[];governments:{id:string;name:string;archived:boolean}[];history:{id:string;name:string;archived:boolean}[];timelineId:string};
export type MapPlace = {id:string;mapId:string;townId:string;name:string;category:string;revision:number;x:number;y:number;removed:boolean;archived:boolean;mapName:string};
export type TownBundle = {towns:TownSummary[];town:TownRecord|null;placements:MapPlace[];references:TownReferences;canEdit:boolean};
export type PlaceOverlay = {markers:MapPlace[];selectedId:string|null;point:{x:number;y:number}|null};
const rev=z.number().int().positive(), point={x:z.number().finite(),y:z.number().finite()};
export const townCommandSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("save"),requestId:z.uuid(),id:z.uuid().nullable(),revision:rev.nullable(),geographyRevision:rev.nullable(),draft:townDraftSchema}).strict(),
  z.object({action:z.literal("archive"),requestId:z.uuid(),id:z.uuid(),revision:rev,geographyRevision:rev,reason:z.string().max(1000).default("")}).strict(),
  z.object({action:z.literal("restore"),requestId:z.uuid(),id:z.uuid(),revision:rev,geographyRevision:rev}).strict(),
  z.object({action:z.literal("place-new"),requestId:z.uuid(),mapId:z.uuid(),draft:townDraftSchema,...point}).strict(),
  z.object({action:z.literal("place"),requestId:z.uuid(),mapId:z.uuid(),townId:z.uuid(),revision:rev.nullable(),...point}).strict(),
  z.object({action:z.literal("remove"),requestId:z.uuid(),mapId:z.uuid(),townId:z.uuid(),revision:rev}).strict(),
]);
export type TownResult={townId:string;revision?:number;placementId?:string;placementRevision?:number};
export function normalizePlacePoint(x:number,y:number,frame:{widthMetres:number;heightMetres:number;wrap:boolean}){
  if(!Number.isFinite(x)||!Number.isFinite(y)||y<0||y>frame.heightMetres||(!frame.wrap&&(x<0||x>frame.widthMetres)))throw new Error("Choose a point inside this map.");
  return {x:frame.wrap?(x%frame.widthMetres+frame.widthMetres)%frame.widthMetres:x,y};
}
export function matchingTowns(towns:TownSummary[],name:string){const key=name.trim().toLocaleLowerCase();return key?towns.filter(t=>!t.archived&&t.name.trim().toLocaleLowerCase()===key):[];}
