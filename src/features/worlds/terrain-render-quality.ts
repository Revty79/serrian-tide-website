/** Browser preparation preferences. Never part of an authored appearance or command. */
export const renderQualityNames={fast:"Fast",balanced:"Balanced",detailed:"Detailed",maximum:"Maximum"} as const;
export type TerrainRenderQuality=keyof typeof renderQualityNames;
export const RENDER_QUALITY_KEY="serrian-atlas-device-quality-v1";
export function renderQuality(value:unknown):TerrainRenderQuality{return typeof value==="string"&&Object.hasOwn(renderQualityNames,value)?value as TerrainRenderQuality:"balanced";}
// A high-DPR screen must not silently multiply the default CPU artwork work.
// Labels/UI keep their normal backing DPR; extra artwork density is explicit.
export function qualityPixelRatio(dpr:number,quality:TerrainRenderQuality="balanced"){return Math.max(.5,Math.min(({fast:.75,balanced:1,detailed:1.5,maximum:2}[quality]),(Number.isFinite(dpr)&&dpr>0?dpr:1)*({fast:.75,balanced:1,detailed:1.25,maximum:1.5}[quality])));}
export function environmentPixelTarget(scale:number,quality:TerrainRenderQuality="balanced"){
 const close=scale>=.02;
 return ({fast:128,balanced:128,detailed:close?64:96,maximum:close?32:64})[quality];
}
