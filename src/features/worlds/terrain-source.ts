import {z} from "zod";

export const GENERATOR_V1_VERSION="world-heightmap-v1" as const;
export const GENERATOR_VERSION="world-heightmap-v2" as const;
export const generationPresets={continent:"Single Continent",continents:"Multiple Continents",archipelago:"Archipelago",island:"Large Island",land:"Land-Dominant World",random:"Randomized World"} as const;
const percentage=z.number().min(0).max(100);
export const generationRecipeV1Schema=z.object({
 version:z.literal(GENERATOR_V1_VERSION),preset:z.enum(["continent","continents","archipelago","island","land","random"]),seed:z.string().trim().min(1).max(80),
 landCoverage:z.number().min(5).max(90),landmasses:z.number().int().min(1).max(12),mountains:percentage,ruggedness:percentage,coastline:percentage,elevationVariation:percentage,
 islandSize:z.number().min(5).max(100),islandSpacing:percentage,islandDistribution:z.enum(["clusters","chains","scattered"]),
}).strict();
export const geographicScales={familiar:"Familiar Geography",grand:"Grand Fantasy Geography",colossal:"Colossal Geography",custom:"Custom"} as const;
const kilometres=z.number().finite().min(.01).max(2000000),height=z.number().int().min(1).max(30000);
export const generationRecipeV2Schema=generationRecipeV1Schema.extend({version:z.literal(GENERATOR_VERSION),landCoverage:percentage,landmasses:z.number().int().min(1).max(64),geographicScale:z.enum(["familiar","grand","colossal","custom"]),continentWidthKm:kilometres,islandWidthKm:kilometres,landmassSpacingKm:kilometres,clusterSpacingKm:kilometres,coastScaleKm:kilometres,mountainLengthKm:kilometres,mountainWidthKm:kilometres,mountainSpacingKm:kilometres,mountainHeightM:height,oceanDepthM:height,lowlandHeightM:height,highlandHeightM:height,highlandCoverage:percentage,plateauStrength:percentage,coastalPlainKm:kilometres}).strict();
export const generationRecipeSchema=z.discriminatedUnion("version",[generationRecipeV1Schema,generationRecipeV2Schema]);
export type GenerationRecipeV1=z.infer<typeof generationRecipeV1Schema>;
export type GenerationRecipeV2=z.infer<typeof generationRecipeV2Schema>;
export type GenerationRecipe=z.infer<typeof generationRecipeSchema>;
export const defaultGenerationV1:GenerationRecipeV1={version:GENERATOR_V1_VERSION,preset:"continent",seed:"Amber Shores",landCoverage:38,landmasses:1,mountains:65,ruggedness:40,coastline:55,elevationVariation:75,islandSize:45,islandSpacing:55,islandDistribution:"chains"};
export function presetRecipeV1(preset:GenerationRecipe["preset"],seed=defaultGenerationV1.seed):GenerationRecipeV1{return {...defaultGenerationV1,preset,seed,...({continent:{landCoverage:38,landmasses:1},continents:{landCoverage:42,landmasses:4},archipelago:{landCoverage:25,landmasses:5,islandSize:35},island:{landCoverage:22,landmasses:1},land:{landCoverage:78,landmasses:5},random:{landCoverage:48,landmasses:4}}[preset])};}
export const physicalDefaults={
 familiar:{continentWidthKm:5000,islandWidthKm:600,landmassSpacingKm:1500,clusterSpacingKm:800,coastScaleKm:80,mountainLengthKm:1500,mountainWidthKm:150,mountainSpacingKm:900,mountainHeightM:3500,oceanDepthM:4500,lowlandHeightM:200,highlandHeightM:1000,highlandCoverage:25,plateauStrength:30,coastalPlainKm:120},
 grand:{continentWidthKm:20000,islandWidthKm:1800,landmassSpacingKm:6000,clusterSpacingKm:4000,coastScaleKm:400,mountainLengthKm:5000,mountainWidthKm:700,mountainSpacingKm:3500,mountainHeightM:6000,oceanDepthM:6000,lowlandHeightM:250,highlandHeightM:1600,highlandCoverage:35,plateauStrength:40,coastalPlainKm:500},
 colossal:{continentWidthKm:200000,islandWidthKm:12000,landmassSpacingKm:70000,clusterSpacingKm:20000,coastScaleKm:4000,mountainLengthKm:80000,mountainWidthKm:10000,mountainSpacingKm:50000,mountainHeightM:10000,oceanDepthM:10000,lowlandHeightM:350,highlandHeightM:3500,highlandCoverage:45,plateauStrength:50,coastalPlainKm:4000},
} as const;
export const defaultGeneration:GenerationRecipeV2={...defaultGenerationV1,version:GENERATOR_VERSION,geographicScale:"familiar",islandDistribution:"scattered",...physicalDefaults.familiar};
export function presetRecipe(preset:GenerationRecipe["preset"],seed=defaultGeneration.seed):GenerationRecipeV2{return {...defaultGeneration,...presetRecipeV1(preset,seed),version:GENERATOR_VERSION,islandDistribution:preset==="archipelago"?"chains":"scattered",...preset==="land"?{landmasses:16}:{}};}
export function applyGeographyPreset(recipe:GenerationRecipe,preset:GenerationRecipe["preset"]):GenerationRecipe{return recipe.version===GENERATOR_V1_VERSION?presetRecipeV1(preset,recipe.seed):{...recipe,preset,landCoverage:presetRecipe(preset).landCoverage,landmasses:presetRecipe(preset).landmasses};}
export function applyGeographicScale(recipe:GenerationRecipeV2,scale:GenerationRecipeV2["geographicScale"]):GenerationRecipeV2{return {...recipe,geographicScale:scale,...scale==="custom"?{}:physicalDefaults[scale]};}
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
 z.object({kind:z.literal("generated"),recipe:generationRecipeSchema,scaleAcknowledged:z.boolean().optional()}).strict(),
 z.object({kind:z.literal("imported"),format:z.literal("grayscale-png"),fileName:z.string().max(180),sha256:z.string().regex(/^[a-f0-9]{64}$/),sourceWidth:z.number().int().positive().max(4096),sourceHeight:z.number().int().positive().max(4096),bitDepth:z.union([z.literal(8),z.literal(16)]),interpretation:importInterpretationSchema,transparentSample:z.number().int().min(0).max(65535).nullable().optional(),sourceNoDataCount:z.number().int().min(0).max(4194304).optional()}).strict(),
 z.object({kind:z.literal("regenerated"),recipe:generationRecipeSchema,scaleAcknowledged:z.boolean().optional(),area:terrainAreaSchema,preserveManual:z.boolean(),feather:z.number().int().min(0).max(32)}).strict(),
]);
export type TerrainSource=z.infer<typeof terrainSourceSchema>;

export const EMPTY_PROTECTION="0".repeat(256),LEGACY_PROTECTION="f".repeat(256);
export type ProtectedTile={x:number;y:number;mask:string};
export function isProtected(mask:string,index:number){return mask==="legacy"||((parseInt(mask[index>>2]??"0",16)>>(index&3))&1)===1;}
export function protectSamples(previous:string,changed:number[]){const mask=(previous==="legacy"?LEGACY_PROTECTION:previous).split("");for(const index of changed)mask[index>>2]=(parseInt(mask[index>>2]??"0",16)|(1<<(index&3))).toString(16);return mask.join("");}
export function protectionGrid(tiles:ProtectedTile[],width:number,height:number){const grid=new Uint8Array(width*height);for(const tile of tiles)for(let n=0;n<1024;n++)if(isProtected(tile.mask,n))grid[(tile.y*32+(n>>5))*width+tile.x*32+(n&31)]=1;return grid;}
