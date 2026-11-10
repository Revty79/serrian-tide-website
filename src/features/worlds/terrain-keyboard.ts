import type {TerrainGeometry} from "./terrain";
import {frameLocalPoint,normalizeTerrainX,type TerrainFrame} from "./terrain-refinement";

export type PrecisionPoint={x:number;y:number};
export type TerrainKeyboardSettings={enabled:boolean;fine:number;coarse:number;movement:"single"|"fine"|"coarse"};
export type TerrainKeyboardStatus={point:PrecisionPoint;world:PrecisionPoint;spacing:PrecisionPoint;focused:boolean;stroking:boolean;editable:boolean;vertex:number;vertices:number;target:string;message:string};
export const DEFAULT_TERRAIN_KEYBOARD:TerrainKeyboardSettings={enabled:false,fine:1,coarse:10,movement:"single"};
export const keyboardSculptTools=new Set(["raise","lower","smooth","level","coast-land","coast-water","coast-smooth"]);
export function keyboardIncrement(value:number){return Number.isInteger(value)&&value>=1&&value<=256;}
/** Positions use the existing node-based sample convention, independent of display zoom/LOD. */
export function boundedKeyboardPoint(point:PrecisionPoint,source:TerrainGeometry,boundary=false):PrecisionPoint{
 const right=boundary?source.width:source.width-1,bottom=boundary?source.height:source.height-1;
 return {x:source.wrap?normalizeTerrainX(point.x,source.width):Math.max(0,Math.min(right,point.x)),y:Math.max(0,Math.min(bottom,point.y))};
}
export function keyboardWorldPoint(point:PrecisionPoint,source:TerrainGeometry,frame:TerrainFrame|undefined,world:TerrainGeometry):PrecisionPoint{
 const x=(frame?.x??0)+point.x/source.width*source.displayWidth;
 return {x:world.wrap?normalizeTerrainX(x,world.displayWidth):x,y:(frame?.y??0)+point.y/source.height*source.displayHeight};
}
/** Coordinate entry is validated, never silently clamped into a different location. */
export function keyboardPosition(point:PrecisionPoint,units:"samples"|"world",source:TerrainGeometry,frame:TerrainFrame|undefined,world:TerrainGeometry,boundary=false):PrecisionPoint{
 if(!Number.isFinite(point.x)||!Number.isFinite(point.y))throw Error("Enter finite coordinates on both axes.");
 let p={...point};
 if(units==="world"){
  const local=frame?frameLocalPoint(point,frame,world.displayWidth,world.wrap):{x:world.wrap?normalizeTerrainX(point.x,world.displayWidth):point.x,y:point.y};
  p={x:local.x/source.displayWidth*source.width,y:local.y/source.displayHeight*source.height};
 }
 if(source.wrap)p.x=normalizeTerrainX(p.x,source.width);
 if(p.x<0||p.x>(boundary?source.width:source.width-1)||p.y<0||p.y>(boundary?source.height:source.height-1))throw Error("That position is outside the selected numerical source. Choose a contained position or another editing source.");
 return p;
}
export type TerrainKeyboardAction="left"|"right"|"up"|"down"|"stamp"|"stroke"|"cancel"|"next"|"previous"|"center";
/** Called only for the focused canvas. Modifiers and IME input retain browser/application meaning. */
export function terrainKeyboardAction(e:{key:string;ctrlKey:boolean;metaKey:boolean;altKey:boolean;shiftKey:boolean;repeat:boolean;isComposing?:boolean},focused:boolean):TerrainKeyboardAction|null{
 if(!focused||e.isComposing||e.ctrlKey||e.metaKey||e.altKey)return null;
 const arrows:Record<string,TerrainKeyboardAction>={ArrowLeft:"left",ArrowRight:"right",ArrowUp:"up",ArrowDown:"down"};
 if(arrows[e.key])return arrows[e.key];
 if(e.repeat)return null;
 if(e.key==="Enter")return e.shiftKey?"stroke":"stamp";
 if(e.key==="Escape")return "cancel";
 if(e.key.toLowerCase()==="v")return e.shiftKey?"previous":"next";
 if(e.key.toLowerCase()==="c")return "center";
 return null;
}
export function stepKeyboardPoint(point:PrecisionPoint,direction:"left"|"right"|"up"|"down",amount:number,source:TerrainGeometry,boundary=false){
 if(!keyboardIncrement(amount))throw Error("Movement must be a whole number of source samples from 1 to 256.");
 return boundedKeyboardPoint({x:point.x+(direction==="left"?-amount:direction==="right"?amount:0),y:point.y+(direction==="up"?-amount:direction==="down"?amount:0)},source,boundary);
}
