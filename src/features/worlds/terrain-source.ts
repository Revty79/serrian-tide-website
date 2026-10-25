import {z} from "zod";

export const GENERATOR_VERSION="world-heightmap-v1" as const;
export const generationPresets={continent:"Single Continent",continents:"Multiple Continents",archipelago:"Archipelago",island:"Large Island",land:"Land-Dominant World",random:"Randomized World"} as const;
const percentage=z.number().min(0).max(100);
export const generationRecipeSchema=z.object({
 version:z.literal(GENERATOR_VERSION),preset:z.enum(["continent","continents","archipelago","island","land","random"]),seed:z.string().trim().min(1).max(80),
 landCoverage:z.number().min(5).max(90),landmasses:z.number().int().min(1).max(12),mountains:percentage,ruggedness:percentage,coastline:percentage,elevationVariation:percentage,
 islandSize:z.number().min(5).max(100),islandSpacing:percentage,islandDistribution:z.enum(["clusters","chains","scattered"]),
}).strict();
export type GenerationRecipe=z.infer<typeof generationRecipeSchema>;
export const defaultGeneration:GenerationRecipe={version:GENERATOR_VERSION,preset:"continent",seed:"Amber Shores",landCoverage:38,landmasses:1,mountains:65,ruggedness:40,coastline:55,elevationVariation:75,islandSize:45,islandSpacing:55,islandDistribution:"chains"};
export function presetRecipe(preset:GenerationRecipe["preset"],seed=defaultGeneration.seed):GenerationRecipe{
 return {...defaultGeneration,preset,seed,...({continent:{landCoverage:38,landmasses:1},continents:{landCoverage:42,landmasses:4},archipelago:{landCoverage:25,landmasses:5,islandSize:35},island:{landCoverage:22,landmasses:1},land:{landCoverage:78,landmasses:5},random:{landCoverage:48,landmasses:4}}[preset])};
}
export const terrainAreaSchema=z.object({x:z.number().int().min(0),y:z.number().int().min(0),width:z.number().int().positive(),height:z.number().int().positive()}).strict();
export type TerrainArea=z.infer<typeof terrainAreaSchema>;
export const importInterpretationSchema=z.object({
 low:z.number().int().min(-30000).max(30000),high:z.number().int().min(-30000).max(30000),
 crop:z.enum(["fit","crop"]),resampling:z.enum(["nearest","bilinear"]),noData:z.number().int().min(0).max(65535).nullable(),noDataMode:z.enum(["reject","fill"]),fillElevation:z.number().int().min(-30000).max(30000),
}).strict().refine(v=>v.low<v.high,{message:"The white height must be greater than the black height.",path:["high"]});
export type ImportInterpretation=z.infer<typeof importInterpretationSchema>;
export const terrainSourceSchema=z.discriminatedUnion("kind",[
 z.object({kind:z.literal("legacy")}).strict(),
 z.object({kind:z.literal("manual")}).strict(),
 z.object({kind:z.literal("blank"),surface:z.enum(["ocean","land"])}).strict(),
 z.object({kind:z.literal("generated"),recipe:generationRecipeSchema}).strict(),
 z.object({kind:z.literal("imported"),format:z.literal("grayscale-png"),fileName:z.string().max(180),sha256:z.string().regex(/^[a-f0-9]{64}$/),sourceWidth:z.number().int().positive().max(4096),sourceHeight:z.number().int().positive().max(4096),bitDepth:z.union([z.literal(8),z.literal(16)]),interpretation:importInterpretationSchema}).strict(),
 z.object({kind:z.literal("regenerated"),recipe:generationRecipeSchema,area:terrainAreaSchema,preserveManual:z.boolean(),feather:z.number().int().min(0).max(32)}).strict(),
]);
export type TerrainSource=z.infer<typeof terrainSourceSchema>;

export const EMPTY_PROTECTION="0".repeat(256),LEGACY_PROTECTION="f".repeat(256);
export type ProtectedTile={x:number;y:number;mask:string};
export function isProtected(mask:string,index:number){return mask==="legacy"||((parseInt(mask[index>>2]??"0",16)>>(index&3))&1)===1;}
export function protectSamples(previous:string,changed:number[]){const mask=(previous==="legacy"?LEGACY_PROTECTION:previous).split("");for(const index of changed)mask[index>>2]=(parseInt(mask[index>>2]??"0",16)|(1<<(index&3))).toString(16);return mask.join("");}
export function protectionGrid(tiles:ProtectedTile[],width:number,height:number){const grid=new Uint8Array(width*height);for(const tile of tiles)for(let n=0;n<1024;n++)if(isProtected(tile.mask,n))grid[(tile.y*32+(n>>5))*width+tile.x*32+(n&31)]=1;return grid;}
