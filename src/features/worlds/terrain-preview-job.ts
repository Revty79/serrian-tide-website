import type {TerrainSettings} from "./terrain";
import type {GenerationRecipe,ImportInterpretation,TerrainArea,TerrainSource} from "./terrain-source";

export type TerrainPreviewJob={
 settings:TerrainSettings;seaLevel:number;
 mode:"generated"|"imported"|"ocean"|"land";
 recipe:GenerationRecipe;
 file?:ArrayBuffer;fileName?:string;interpretation?:ImportInterpretation;
 regeneration?:{base:ArrayBuffer;protection:ArrayBuffer;area:TerrainArea;preserveManual:boolean;feather:number};
};
export type TerrainPreviewMetrics={elapsedMs:number;minimum:number;maximum:number;landCoverage:number;changed:number;protectedCount:number;layoutWarnings?:string[];featureCount?:number;rangeCount?:number;sourceDepth?:number;sourceWidth?:number;sourceHeight?:number;sourceStepMetres?:number;sourceNoData?:number;aspectChanged?:boolean;crop?:{left:number;top:number;width:number;height:number};resolvedPreset?:string};
export type TerrainPreviewReply={type:"progress";progress:number}|{type:"ready";grid:ArrayBuffer;source:TerrainSource;metrics:TerrainPreviewMetrics}|{type:"error";message:string};
