import {z} from "zod";
import {refinementFrameSchema,refinementGridSize,REFINEMENT_LIMIT,REFINEMENT_DEPTH} from "./terrain-refinement";

/** Written only by checked native detail creation, never accepted from a save. */
export const refinementInheritanceSchema=z.object({
 version:z.literal(1),rootRevision:z.number().int().positive(),sourceState:z.string().min(1).max(8192),
 sources:z.array(z.object({id:z.uuid(),revision:z.number().int().positive(),parentId:z.uuid().nullable(),parentRevision:z.number().int().positive(),level:z.number().int().min(1).max(REFINEMENT_DEPTH),frame:refinementFrameSchema,gridWidth:refinementGridSize,gridHeight:refinementGridSize}).strict()).min(1).max(REFINEMENT_LIMIT).refine(rows=>new Set(rows.map(row=>row.id)).size===rows.length,"Each inherited source is pinned once."),
}).strict();
export type RefinementInheritance= z.infer<typeof refinementInheritanceSchema>;
