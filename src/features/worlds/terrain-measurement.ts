import type {TerrainGeometry,TerrainView} from "./terrain";
import {wrappedDistance} from "./terrain-physical-noise";
import {convenientUnit,distanceUnits,type DistancePreference,type DistanceUnit,type MeasurementPreferences} from "./terrain-units";
export type PhysicalPoint={x:number;y:number};
export type TerrainMeasurement={kind:"line"|"path"|"area";points:PhysicalPoint[];finished:boolean;route:"shortest"|"direct";selected:number};
export const emptyMeasurement=():TerrainMeasurement=>({kind:"line",points:[],finished:false,route:"shortest",selected:0});
export const terrainSampleSpacing=(s:TerrainGeometry)=>({x:s.displayWidth/s.width,y:s.displayHeight/s.height});
export const sampleToPhysical=(p:PhysicalPoint,s:TerrainGeometry)=>({x:p.x/s.width*s.displayWidth,y:p.y/s.height*s.displayHeight});
export const physicalToSample=(p:PhysicalPoint,s:TerrainGeometry)=>({x:p.x/s.displayWidth*s.width,y:p.y/s.displayHeight*s.height});
export function snapPhysicalPoint(p:PhysicalPoint,spacing:number,s:TerrainGeometry){return {x:Math.max(0,Math.min(Math.floor(s.displayWidth/spacing),Math.round(p.x/spacing))*spacing),y:Math.max(0,Math.min(Math.floor(s.displayHeight/spacing),Math.round(p.y/spacing))*spacing)};}
export function unwrapPhysicalPath(points:PhysicalPoint[],width:number){return points.reduce<PhysicalPoint[]>((all,p)=>{const last=all.at(-1);all.push({x:width&&last?last.x+wrappedDistance(p.x,last.x,width):p.x,y:p.y});return all;},[]);}
function sum(values:number[]){let result=0,error=0;for(const v of values){const next=v-error,t=result+next;error=(t-result)-next;result=t;}return result;}
const cross=(a:PhysicalPoint,b:PhysicalPoint,c:PhysicalPoint)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function intersects(a:PhysicalPoint,b:PhysicalPoint,c:PhysicalPoint,d:PhysicalPoint){
 if(Math.max(a.x,b.x)<Math.min(c.x,d.x)-1e-7||Math.max(c.x,d.x)<Math.min(a.x,b.x)-1e-7||Math.max(a.y,b.y)<Math.min(c.y,d.y)-1e-7||Math.max(c.y,d.y)<Math.min(a.y,b.y)-1e-7)return false;
 const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b),on=(a:PhysicalPoint,b:PhysicalPoint,p:PhysicalPoint,v:number)=>Math.abs(v)<=Number.EPSILON*32*(Math.abs((b.x-a.x)*(p.y-a.y))+Math.abs((b.y-a.y)*(p.x-a.x))+1)&&p.x>=Math.min(a.x,b.x)-1e-7&&p.x<=Math.max(a.x,b.x)+1e-7&&p.y>=Math.min(a.y,b.y)-1e-7&&p.y<=Math.max(a.y,b.y)+1e-7;
 return (abC>0&&abD<0||abC<0&&abD>0)&&(cdA>0&&cdB<0||cdA<0&&cdB>0)||on(a,b,c,abC)||on(a,b,d,abD)||on(c,d,a,cdA)||on(c,d,b,cdB);
}
export function measurementStats(m:TerrainMeasurement,s:TerrainGeometry){
 const valid=m.points.length<=256&&m.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=s.displayWidth&&p.y>=0&&p.y<=s.displayHeight),width=s.wrap&&m.route==="shortest"?s.displayWidth:0,points=valid?unwrapPhysicalPath(m.points,width):[],segments=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y)),length=sum(segments),lastSegment=segments.at(-1)??0,x=points.map(p=>p.x),y=points.map(p=>p.y),spanX=points.length?Math.max(...x)-Math.min(...x):0,spanY=points.length?Math.max(...y)-Math.min(...y):0;
 let issue=valid?"":"Keep up to 256 finite points inside this World.",area:number|null=null,perimeter=length;
 if(m.kind==="area"&&points.length>=3){const first=points[0],last=points.at(-1)!,closingX=width?last.x+wrappedDistance(first.x,last.x,width):first.x;perimeter+=Math.hypot(closingX-last.x,first.y-last.y);
  if(Math.abs(closingX-first.x)>s.displayWidth*.5)issue="This outline winds around the World and does not define one bounded area. Split it, add waypoints or choose the direct route.";
  if(!issue&&width&&spanX>=width)issue="This outline overlaps itself around the wrapped World. Split the area or choose the direct route.";
  for(let i=0;!issue&&i<points.length;i++)for(let j=i+1;!issue&&j<points.length;j++){if(j===i+1||i===0&&j===points.length-1)continue;if(intersects(points[i],points[(i+1)%points.length],points[j],points[(j+1)%points.length]))issue="The outline crosses or touches itself. Move or remove a point before measuring its area.";}
  if(!issue){area=Math.abs(sum(points.map((p,i)=>{const next=points[(i+1)%points.length];return (p.x-first.x)*(next.y-first.y)-(next.x-first.x)*(p.y-first.y);}))/2);if(area===0){area=null;issue="Use at least three non-collinear points to enclose an area.";}}
 }
 return {points,length,lastSegment,area,perimeter,width:spanX,height:spanY,issue};
}
export function visibleTerrainBounds(view:TerrainView,width:number,height:number,s:TerrainGeometry){const left=-view.x/view.scale,right=(width-view.x)/view.scale,wrapped=s.wrap&&right-left<s.displayWidth*2;return {left:wrapped?left:Math.max(0,left),right:wrapped?right:Math.min(s.displayWidth,right),top:Math.max(0,-view.y/view.scale),bottom:Math.min(s.displayHeight,(height-view.y)/view.scale)};}
export function niceDistance(metres:number,preference:DistancePreference){const unit=convenientUnit(metres,preference),factor=distanceUnits[unit].metres,value=metres/factor,power=10**Math.floor(Math.log10(value)),mantissa=value/power,step=mantissa<1.5?1:mantissa<3.5?2:mantissa<7.5?5:10;return {metres:step*power*factor,unit};}
export function gridInterval(scale:number,p:MeasurementPreferences,previous=0):{metres:number;unit:DistanceUnit}{
 if(p.gridMode==="manual")return {metres:p.manualSpacingM,unit:convenientUnit(p.manualSpacingM,p.distance)};
 return previous>0&&previous*scale>=60&&previous*scale<=160?{metres:previous,unit:convenientUnit(previous,p.distance)}:niceDistance(100/scale,p.distance);
}
/** At most ~120 major intervals per axis even for a tiny manual request. */
export function boundedGridPlan(view:TerrainView,width:number,height:number,s:TerrainGeometry,interval:number){const bounds=visibleTerrainBounds(view,width,height,s),span=Math.max(0,bounds.right-bounds.left,bounds.bottom-bounds.top),stride=Math.max(1,Math.ceil(span/Math.max(.001,interval)/120),Math.ceil(50/(interval*view.scale))),step=interval*stride;return {bounds,requested:interval,step,stride,minor:stride===1&&step*view.scale/5>=12&&span/(step/5)<=140?step/5:0};}
export function scaleBar(scale:number,p:DistancePreference){const step=niceDistance(100/scale,p);return {...step,pixels:step.metres*scale};}

/** Stable aligned references, with no new origin and no accumulated pan offsets. */
export function gridLabelReference(bounds:{left:number;right:number;top:number;bottom:number},step:number){
 const local=Math.max(Math.abs(bounds.left),Math.abs(bounds.right),Math.abs(bounds.top),Math.abs(bounds.bottom))/step>10000;
 const xIndex=Math.floor(((bounds.left+bounds.right)/2)/step/1000)*1000,yIndex=Math.floor(((bounds.top+bounds.bottom)/2)/step/1000)*1000;
 return {local,xIndex,yIndex,x:xIndex*step,y:yIndex*step};
}
