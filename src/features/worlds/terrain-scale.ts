import type {TerrainGeometry} from "./terrain";
import type {GenerationRecipeV2} from "./terrain-source";
import {physicalSeed} from "./terrain-physical-noise";
export const resolvePhysicalPreset=(r:GenerationRecipeV2)=>r.preset==="random"?(["continent","continents","archipelago","island","land"] as const)[physicalSeed(r.seed.trim())%5]:r.preset;

export const sampleSpacingKm=(shape:TerrainGeometry)=>({x:shape.displayWidth/shape.width/1000,y:shape.displayHeight/shape.height/1000});
export type ScaleAssessment={spacingXKm:number;spacingYKm:number;spanKm:number;spanSamplesX:number;spanSamplesY:number;estimatedCoverage:number;suggestedCount:number;warnings:string[];requiresAcknowledgement:boolean;coverageConflict:boolean};
export function assessGeographicScale(shape:TerrainGeometry,r:GenerationRecipeV2):ScaleAssessment{
 const preset=resolvePhysicalPreset(r),spacing=sampleSpacingKm(shape),width=shape.displayWidth/1000,height=shape.displayHeight/1000,islands=preset==="island"||preset==="archipelago",span=islands?r.islandWidthKm:r.continentWidthKm,count=["continent","island"].includes(preset)?1:r.landmasses,features=preset==="archipelago"?4:1,area=Math.PI*(span/2)*(span*.32),estimatedCoverage=Math.min(100,100*area*count*features/(width*height)),suggestedCount=Math.ceil(r.landCoverage/100*width*height/(area*features)),warnings:string[]=[];
 const sx=span/spacing.x,sy=span*.64/spacing.y;
 if(Math.min(sx,sy)<16)warnings.push(`A ${span.toLocaleString()} km ${islands?"island":"landmass"} is only ${sx.toFixed(1)} samples across east/west and ${sy.toFixed(1)} north/south. Its shape will be coarse or may disappear between samples.`);
 if(r.mountains>0&&r.mountainWidthKm/Math.max(spacing.x,spacing.y)<8)warnings.push(`The ${r.mountainWidthKm.toLocaleString()} km mountain width spans ${(r.mountainWidthKm/Math.max(spacing.x,spacing.y)).toFixed(2)} samples on the coarser axis. Narrow ranges cannot be resolved accurately.`);
 if(r.coastScaleKm/Math.max(spacing.x,spacing.y)<4)warnings.push(`Coastline detail at ${r.coastScaleKm.toLocaleString()} km is below four samples on the coarser axis. Zoom cannot add the missing height detail.`);
 if(span>Math.min(width,height))warnings.push(`The intended landform span exceeds the shorter World extent. Fixed edges crop it; wrapped edges can overlap the same feature. Its requested physical size is retained.`);
 const coverageConflict=Math.abs(estimatedCoverage-r.landCoverage)>Math.max(2,r.landCoverage*.3);
 return {spacingXKm:spacing.x,spacingYKm:spacing.y,spanKm:span,spanSamplesX:sx,spanSamplesY:sy,estimatedCoverage,suggestedCount,warnings,requiresAcknowledgement:warnings.length>0,coverageConflict};
}
export function validatePhysicalHeights(shape:TerrainGeometry,r:GenerationRecipeV2,sea:number){
 if(!Number.isInteger(sea)||sea<=shape.min||sea>=shape.max)throw Error("Choose a whole-metre sea level inside the saved elevation limits.");
 if(sea-r.oceanDepthM<shape.min||sea+Math.max(r.lowlandHeightM,r.highlandHeightM,r.mountains>0?r.mountainHeightM:0)>shape.max)throw Error(`The intended ocean/land heights exceed this map's ${shape.min} to ${shape.max} m bounds. Change the intended heights or explicitly edit the new map's limits; no limits or intended heights were changed.`);
}
