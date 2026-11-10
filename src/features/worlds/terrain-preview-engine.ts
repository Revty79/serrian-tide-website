import {terrainGeometry} from "./terrain";
import {generateTerrainAsync,regenerateArea} from "./terrain-generation";
import {decodeNumericalPng,interpretHeightmap} from "./terrain-png";
import type {TerrainPreviewJob,TerrainPreviewReply,TerrainPreviewMetrics} from "./terrain-preview-job";
import {generationRecipeSchema,type TerrainSource} from "./terrain-source";

export async function prepareTerrainPreview(data:TerrainPreviewJob,progress:(n:number)=>void=()=>{},signal?:AbortSignal):Promise<Extract<TerrainPreviewReply,{type:"ready"}>>{
  const started=performance.now(),shape=terrainGeometry(data.settings),recipe=data.mode==="generated"||data.regeneration?generationRecipeSchema.parse(data.recipe):data.recipe;let grid:Int16Array,source:TerrainSource;
  const details:Partial<TerrainPreviewMetrics>={};
  if(data.mode==="imported"){
   if(!data.file||!data.interpretation)throw new Error("Choose a numerical PNG and confirm how its heights should be interpreted.");
   const png=await decodeNumericalPng(data.file),imported=interpretHeightmap(png,shape,data.interpretation);grid=imported.grid;
   source={kind:"imported",format:"grayscale-png",fileName:data.fileName??"Heightmap.png",sha256:png.sha256,sourceWidth:png.width,sourceHeight:png.height,bitDepth:png.bitDepth,interpretation:data.interpretation,transparentSample:png.transparent,sourceNoDataCount:imported.sourceNoData};
   Object.assign(details,{sourceDepth:png.bitDepth,sourceWidth:png.width,sourceHeight:png.height,sourceStepMetres:imported.sourceStepMetres,sourceNoData:imported.sourceNoData,aspectChanged:imported.aspectChanged,crop:imported.crop});
  }else if(data.mode==="generated"){
   const generated=await generateTerrainAsync(shape,recipe,data.seaLevel,progress,signal);grid=generated.grid;source={kind:"generated",recipe};details.resolvedPreset=generated.resolvedPreset;if("layoutWarnings" in generated)Object.assign(details,{layoutWarnings:generated.layoutWarnings,featureCount:generated.featureCount,rangeCount:generated.rangeCount});
  }else{grid=new Int16Array(shape.width*shape.height).fill(data.mode==="ocean"?Math.max(shape.min,data.seaLevel-500):Math.min(shape.max,data.seaLevel+500));source={kind:"blank",surface:data.mode};}
  let changed=grid.length,protectedCount=0;
  if(data.regeneration){const r=data.regeneration,result=regenerateArea(new Int16Array(r.base),grid,shape,r.area,new Uint8Array(r.protection),r.preserveManual,r.feather);grid=result.grid;changed=result.changed;protectedCount=result.protectedCount;if(r.blocked){const blocked=new Uint8Array(r.blocked),base=new Int16Array(r.base);for(let i=0;i<grid.length;i++)if(blocked[i]&&grid[i]!==base[i]){grid[i]=base[i];changed--;protectedCount++;}}source={kind:"regenerated",recipe,area:r.area,preserveManual:r.preserveManual,feather:r.feather};}
  let minimum=Infinity,maximum=-Infinity,land=0;for(let offset=0;offset<grid.length;offset+=32768){if(signal?.aborted)throw new DOMException("Numerical preview cancelled before acceptance.","AbortError");for(let i=offset;i<Math.min(grid.length,offset+32768);i++){const value=grid[i];minimum=Math.min(minimum,value);maximum=Math.max(maximum,value);if(value>data.seaLevel)land++;}if(offset%262144===0)await new Promise<void>(resolve=>setTimeout(resolve,0));}
  return {type:"ready",grid:grid.buffer as ArrayBuffer,source,metrics:{elapsedMs:performance.now()-started,minimum,maximum,landCoverage:land/grid.length*100,changed,protectedCount,...details}};

}
