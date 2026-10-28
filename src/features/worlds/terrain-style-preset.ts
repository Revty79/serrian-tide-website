import {z} from "zod";
import {mapAppearanceSchema} from "./terrain-appearance";
import {terrainStyle} from "./terrain-style";
export const stylePresetSaveSchema=z.object({requestId:z.string().uuid(),mapId:z.string().uuid(),appearanceRevision:z.number().int().min(0),name:z.string().trim().min(1).max(80),spec:mapAppearanceSchema}).strict();
export type StylePreset={id:string;version:1;name:string;spec:z.infer<typeof mapAppearanceSchema>;sourceMapId:string;sourceAppearanceRevision:number;createdAt:string;createdBy:string};
/** Snapshot format 1 pins algorithm-1 defaults, even for a legacy appearance. */
export function captureStyleSpec(spec:z.infer<typeof mapAppearanceSchema>){return {...spec,art:{...terrainStyle(spec.art)}};}
