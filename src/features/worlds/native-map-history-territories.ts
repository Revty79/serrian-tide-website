import {z} from "zod";
import {territorySchema,validateTerritoryContents,type TerritoryReferences} from "./historical-territories";
import {atlasId} from "./atlas";
import {yearSchema} from "./world-year";
export const nativeTerritorySchema=territorySchema.extend({coordinateSpace:z.literal("terrain-metres-v1")});
export const nativeTerritoriesSchema=z.array(nativeTerritorySchema).max(128);
export type NativeTerritory=z.infer<typeof nativeTerritorySchema>;
export const nativeTerritorySourceSchema=z.object({mapId:atlasId,mapVersionId:atlasId,timelineId:atlasId,year:yearSchema,terrainId:atlasId,fingerprint:z.string().regex(/^[a-f0-9]{64}$/),width:z.number().finite().positive(),height:z.number().finite().positive(),wrap:z.boolean()}).strict();
export type NativeTerritorySource=z.infer<typeof nativeTerritorySourceSchema>;
export const nativeTerritorySavedSchema=z.object({version:z.literal(1),revision:z.number().int().positive(),source:nativeTerritorySourceSchema,territories:nativeTerritoriesSchema}).strict();
export type NativeTerritorySaved=z.infer<typeof nativeTerritorySavedSchema>;
export type NativeTerritoryBundle={coverage:"authored-layer"|"unknown";canEdit:boolean;reason:string;source:NativeTerritorySource;sourceChanged:boolean;saved:NativeTerritorySaved|null;references:TerritoryReferences;legacySourceCount:number};
export const nativeTerritoryCommandSchema=z.object({action:z.literal("territories"),requestId:atlasId,revision:z.number().int().nonnegative(),sourceMapVersionId:atlasId,sourceFingerprint:z.string().regex(/^[a-f0-9]{64}$/),territories:nativeTerritoriesSchema}).strict();
export function validateNativeTerritories(territories:NativeTerritory[],source:Pick<NativeTerritorySource,"width"|"height"|"wrap">,period?:{startYear:number;endYear:number}){
  nativeTerritoriesSchema.parse(territories);validateTerritoryContents(territories,period,source);
  if(source.wrap)for(const territory of territories)for(const boundary of territory.boundaries)for(let i=0;i<boundary.points.length;i++)if(Math.abs(boundary.points[i].x-boundary.points[(i+1)%boundary.points.length].x)>source.width/2)throw Error("Draw a separate outer boundary on each side of the wrapped World seam. Both parts can keep this same territory identity; no coordinate conversion is inferred.");
}
