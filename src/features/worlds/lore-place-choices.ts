import {z} from "zod";

export const LORE_PLACE_PAGE_SIZE=40;
export const lorePlaceChoiceQuery=z.object({search:z.string().max(160).default(""),after:z.uuid().optional(),selected:z.array(z.uuid()).max(200).default([])}).strict();
export type LorePlaceChoice={id:string;name:string;archived:boolean};
export type LorePlaceChoices={records:LorePlaceChoice[];selected:LorePlaceChoice[];nextAfter:string|null};
