import type {TerrainGeometry} from "./terrain";
import type {TerrainSource} from "./terrain-source";
import {assessGeographicScale,validatePhysicalHeights} from "./terrain-scale";
import {intentWarnings} from "./terrain-intent";
import {validateIntentHeights} from "./terrain-generation-v3";
/** Shared admission rules. They never resize a feature or regenerate heights. */
export function validateGenerationAcceptance(shape:TerrainGeometry,source:TerrainSource,sea:number,frame={x:0,y:0,periodX:shape.wrap?shape.displayWidth:null as number|null}){
 if((source.kind==="generated"||source.kind==="regenerated")&&source.recipe.version==="world-heightmap-v3"){
  const r=source.recipe,p=r.plan;validateIntentHeights(shape,r,sea);
  if(!r.planConfirmed||r.interpretationIssues.some(i=>!i.resolved||!i.decision.trim()))throw Error("Confirm the geographic plan and explicitly resolve every uncertain or unsupported instruction before accepting.");
  if(p.space.x!==frame.x||p.space.y!==frame.y||p.space.width!==shape.displayWidth||p.space.height!==shape.displayHeight||p.space.periodX!==frame.periodX)throw Error("The geographic plan does not match this permanent terrain's physical World frame.");
  const a=source.kind==="regenerated"?source.area:{x:0,y:0,width:shape.width,height:shape.height},expected={x:frame.x+a.x/shape.width*shape.displayWidth,y:frame.y+a.y/shape.height*shape.displayHeight,width:a.width/shape.width*shape.displayWidth,height:a.height/shape.height*shape.displayHeight};
  if(Object.entries(expected).some(([key,value])=>Math.abs(p.area[key as keyof typeof expected]-value)>1e-5))throw Error("The geographic proposal must match the explicitly selected numerical area.");
  if(intentWarnings(shape,p).length&&source.scaleAcknowledged!==true)throw Error("Read and acknowledge the physical representation limits before accepting this geographic plan.");return;
 }
 if((source.kind!=="generated"&&source.kind!=="regenerated")||source.recipe.version!=="world-heightmap-v2")return;
 validatePhysicalHeights(shape,source.recipe,sea);
 if(assessGeographicScale(shape,source.recipe).requiresAcknowledgement&&source.scaleAcknowledged!==true)throw Error("Read and acknowledge the physical-scale representation limits before accepting this proposal. No terrain was accepted.");
}
