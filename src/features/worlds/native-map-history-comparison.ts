import {z} from "zod";
import {mapSourceSelectionSchema} from "./map-source-comparison";
import {nativeMapTargetSchema} from "./native-map-history";
export const nativeCompareSelectionSchema=z.union([mapSourceSelectionSchema,z.object({timelineId:z.uuid(),baseline:z.literal(true)}).strict()]);
export const nativeCompareSchema=z.object({target:nativeMapTargetSchema,left:nativeCompareSelectionSchema,right:nativeCompareSelectionSchema}).strict();
export type NativeCompareSelection=z.infer<typeof nativeCompareSelectionSchema>;
export type NativeComparedSource={label:string;timelineName:string;year?:number;coverage:"established"|"unknown"|"current-reference";versionId?:string;geographyVersionId?:string;baselinePin?:string;href?:string;reason?:string;condition?:string;retainedDesignReference?:boolean};
export type NativeComparedComponent={key:string;left?:{hash:string;revision:number};right?:{hash:string;revision:number};status:"same retained component"|"different retained component"|"not retained on one side"|"unknown coverage"};
export type NativeMapComparison={left:NativeComparedSource;right:NativeComparedSource;components:NativeComparedComponent[];totalComponents:number;truncated:boolean;numeric:{reason?:string;points:{x:number;y:number;left:number;right:number;difference:number}[]};readOnly:true};
