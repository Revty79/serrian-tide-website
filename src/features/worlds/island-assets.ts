import {z} from "zod";
import {ISLAND_ASSETS} from "./island-assets.generated";

const key=z.string().min(1).max(80).regex(/^[a-z][a-z0-9-]*$/);
const revision=z.number().int().positive().max(2147483647);
export const assetReferenceSchema=z.object({libraryId:key,libraryRevision:revision,assetId:key,assetRevision:revision}).strict();
export type AssetReference=z.infer<typeof assetReferenceSchema>;
export const styleReferenceSchema=z.object({id:key,revision}).strict();
export const ISLAND_STYLE_REFERENCE={id:"island-ink-wash",revision:1} as const;
export type IslandAsset=typeof ISLAND_ASSETS[number];
export const islandAssets:readonly IslandAsset[]=ISLAND_ASSETS;
export const assetReference=(asset:IslandAsset):AssetReference=>({libraryId:asset.libraryId,libraryRevision:asset.libraryRevision,assetId:asset.id,assetRevision:asset.revision});
export function islandAsset(reference:AssetReference):IslandAsset{
 const found=islandAssets.find(a=>a.libraryId===reference.libraryId&&a.libraryRevision===reference.libraryRevision&&a.id===reference.assetId&&a.revision===reference.assetRevision);
 if(!found)throw new Error("This exact artwork revision is unavailable. Its reference is retained; restore the matching release library.");
 return found;
}
export function validateIslandStyle(reference:z.infer<typeof styleReferenceSchema>){
 if(reference.id!==ISLAND_STYLE_REFERENCE.id||reference.revision!==ISLAND_STYLE_REFERENCE.revision)throw new Error("This exact map style revision is unavailable. Keep its source and restore the matching release library.");
}
export function isIslandStyle(presentation:{version:number;styleRef?:z.infer<typeof styleReferenceSchema>}|undefined){return presentation?.version===2&&presentation.styleRef?.id===ISLAND_STYLE_REFERENCE.id&&presentation.styleRef.revision===1;}
