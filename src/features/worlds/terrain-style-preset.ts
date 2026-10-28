import {z} from "zod";
import {mapAppearanceSchema} from "./terrain-appearance";
export const stylePresetSaveSchema=z.object({requestId:z.string().uuid(),mapId:z.string().uuid(),appearanceRevision:z.number().int().min(0),name:z.string().trim().min(1).max(80),spec:mapAppearanceSchema}).strict();
export type StylePreset={id:string;version:1;name:string;spec:z.infer<typeof mapAppearanceSchema>;sourceMapId:string;sourceAppearanceRevision:number;createdAt:string;createdBy:string};
