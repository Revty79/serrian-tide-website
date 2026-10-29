import {z} from "zod";

/** Versioned presentation vocabulary. Never stores or generates geographic data. */
export const engravingSchema=z.object({
 version:z.literal(1),palette:z.enum(["ink","sepia","colored","monochrome"]),detail:z.enum(["low","medium","high","elaborate"]),
 stroke:z.number().finite().min(0).max(2),hatching:z.number().finite().min(0).max(2),forests:z.number().finite().min(0).max(2),environment:z.number().finite().min(0).max(2),coast:z.number().finite().min(0).max(2),water:z.number().finite().min(0).max(2),parchment:z.number().finite().min(0).max(1),
 border:z.enum(["none","neatline","double","ornamental","botanical"]),cartouche:z.enum(["none","scroll","plaque","ornate","illuminated"]),compass:z.enum(["simple","rose","mariner"]),ornaments:z.boolean(),
}).strict();
export type EngravingStyle=z.infer<typeof engravingSchema>;
export const DEFAULT_ENGRAVING:EngravingStyle={version:1,palette:"sepia",detail:"high",stroke:1,hatching:1,forests:1,environment:1,coast:1,water:.7,parchment:.55,border:"ornamental",cartouche:"scroll",compass:"rose",ornaments:true};
export const ENGRAVING_VERSION="geographic-engraving-1";
export const ENGRAVING_LIMITS={tilePixels:192,halo:24,bitmapBytes:24*1048576,tiles:160,fieldCells:48,cacheCells:8192,mainBatchMs:4,pathsPerTile:5000,ornamentCache:8} as const;
export const engravingStyle=(value?:EngravingStyle)=>value??DEFAULT_ENGRAVING;
export function engravingPalette(value:EngravingStyle){
 if(value.palette==="monochrome")return {paper:"#ffffff",ink:"#252525",faint:"#727272",water:"#f5f5f5",green:"#777777",sand:"#aaaaaa"};
 if(value.palette==="ink")return {paper:"#f4eedc",ink:"#292b27",faint:"#8a887c",water:"#e8e5d5",green:"#8b927e",sand:"#b9a88a"};
 if(value.palette==="colored")return {paper:"#eee5ca",ink:"#3a423b",faint:"#92907b",water:"#cdd7d0",green:"#819076",sand:"#c4ac7d"};
 return {paper:"#ede1c3",ink:"#514332",faint:"#a09478",water:"#ded6bf",green:"#a19e80",sand:"#c1a77f"};
}
export function engravingHash(x:number,y:number,seed=0){let n=Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^seed;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
export const engravingDetail=(s:EngravingStyle)=>({low:0,medium:1,high:2,elaborate:3})[s.detail];
