import {terrainGeometry} from "./terrain";
import {generateTerrain,regenerateArea} from "./terrain-generation";
import {decodeNumericalPng,interpretHeightmap} from "./terrain-png";
import type {TerrainPreviewJob,TerrainPreviewReply,TerrainPreviewMetrics} from "./terrain-preview-job";
import {generationRecipeSchema,type TerrainSource} from "./terrain-source";

const scope=self as unknown as {onmessage:(event:MessageEvent<TerrainPreviewJob>)=>void;postMessage:(message:TerrainPreviewReply,transfer?:Transferable[])=>void};
scope.onmessage=async({data})=>{
 try{
  const started=performance.now(),shape=terrainGeometry(data.settings),recipe=data.mode==="generated"||data.regeneration?generationRecipeSchema.parse(data.recipe):data.recipe;let grid:Int16Array,source:TerrainSource;
  const details:Partial<TerrainPreviewMetrics>={};
  if(data.mode==="imported"){
   if(!data.file||!data.interpretation)throw new Error("Choose a numerical PNG and confirm how its heights should be interpreted.");
   const png=await decodeNumericalPng(data.file),imported=interpretHeightmap(png,shape,data.interpretation);grid=imported.grid;
   source={kind:"imported",format:"grayscale-png",fileName:data.fileName??"Heightmap.png",sha256:png.sha256,sourceWidth:png.width,sourceHeight:png.height,bitDepth:png.bitDepth,interpretation:data.interpretation,transparentSample:png.transparent,sourceNoDataCount:imported.sourceNoData};
   Object.assign(details,{sourceDepth:png.bitDepth,sourceWidth:png.width,sourceHeight:png.height,sourceStepMetres:imported.sourceStepMetres,sourceNoData:imported.sourceNoData,aspectChanged:imported.aspectChanged,crop:imported.crop});
  }else if(data.mode==="generated"){
   const generated=generateTerrain(shape,recipe,data.seaLevel,progress=>scope.postMessage({type:"progress",progress}));grid=generated.grid;source={kind:"generated",recipe};details.resolvedPreset=generated.resolvedPreset;if("layoutWarnings" in generated)Object.assign(details,{layoutWarnings:generated.layoutWarnings,featureCount:generated.featureCount,rangeCount:generated.rangeCount});
  }else{grid=new Int16Array(shape.width*shape.height).fill(data.mode==="ocean"?Math.max(shape.min,data.seaLevel-500):Math.min(shape.max,data.seaLevel+500));source={kind:"blank",surface:data.mode};}
  let changed=grid.length,protectedCount=0;
  if(data.regeneration){const r=data.regeneration,result=regenerateArea(new Int16Array(r.base),grid,shape,r.area,new Uint8Array(r.protection),r.preserveManual,r.feather);grid=result.grid;changed=result.changed;protectedCount=result.protectedCount;source={kind:"regenerated",recipe,area:r.area,preserveManual:r.preserveManual,feather:r.feather};}
  let minimum=Infinity,maximum=-Infinity,land=0;for(const value of grid){minimum=Math.min(minimum,value);maximum=Math.max(maximum,value);if(value>data.seaLevel)land++;}
  scope.postMessage({type:"ready",grid:grid.buffer as ArrayBuffer,source,metrics:{elapsedMs:performance.now()-started,minimum,maximum,landCoverage:land/grid.length*100,changed,protectedCount,...details}},[grid.buffer as ArrayBuffer]);
 }catch(error){scope.postMessage({type:"error",message:error instanceof Error?error.message:"The terrain preview could not be prepared."});}
};
