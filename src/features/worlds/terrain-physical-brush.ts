import type {TerrainGeometry} from "./terrain";
import {terrainSampleSpacing} from "./terrain-measurement";
export type PhysicalSizeAdjustment="requested"|"minimum"|"maximum";
export function physicalSizeLimits(s:TerrainGeometry,sampleLimit=64){
 const spacing=terrainSampleSpacing(s),minimum=2*Math.max(spacing.x,spacing.y),maximum=2*Math.min(sampleLimit*spacing.x,sampleLimit*spacing.y,s.displayWidth/2);
 return {spacing,minimum,maximum,feasible:minimum<=maximum};
}
export function physicalSizeAssessment(s:TerrainGeometry,requestedDiameter:number,adjustment:PhysicalSizeAdjustment="requested",sampleLimit=64){
 const limits=physicalSizeLimits(s,sampleLimit),diameter=adjustment==="minimum"?limits.minimum:adjustment==="maximum"?limits.maximum:requestedDiameter,underResolved=!Number.isFinite(diameter)||diameter<limits.minimum,tooLarge=diameter>limits.maximum,valid=limits.feasible&&!underResolved&&!tooLarge;
 return {...limits,requestedDiameter,diameter,radius:diameter/2,underResolved,tooLarge,valid,adjusted:adjustment!=="requested"};
}
/** Physical mode never silently clamps an unsupported circle into an ellipse. */
export function physicalBrushGeometry(s:TerrainGeometry,radiusMetres:number,sampleLimit=64){
 const a=physicalSizeAssessment(s,radiusMetres*2,"requested",sampleLimit);return a.valid?{x:radiusMetres/a.spacing.x,y:radiusMetres/a.spacing.y,metres:radiusMetres,spacing:a.spacing}:null;
}
