import type {TownFeature,TownPoint} from "./town-map";

export const townRoadStyle=(road:Pick<TownFeature,"category">)=>road.category.replace(/^curve:/,"");
export const townRoadCurved=(road:Pick<TownFeature,"category">)=>road.category.startsWith("curve:");
export const townRoadCategory=(style:string,curved:boolean)=>(curved?"curve:":"")+style.replace(/^curve:/,"");
type Section={a:TownPoint;b:TownPoint;control?:TownPoint};
const mid=(a:TownPoint,b:TownPoint)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
/** Curves stay inside their control-point hull. Legacy paths remain exact straight segments. */
export function townRoadSections(road:Pick<TownFeature,"points"|"category">):Section[]{
 const ps=road.points;if(ps.length<2)return [];
 if(!townRoadCurved(road)||ps.length===2)return ps.slice(1).map((b,i)=>({a:ps[i],b}));
 const result:Section[]=[];let a=ps[0];
 for(let i=1;i<ps.length-1;i++){const b=mid(ps[i],ps[i+1]);result.push({a,b,control:ps[i]});a=b;}
 result.push({a,b:ps.at(-1)!});return result;
}
export function traceTownRoad(ctx:Pick<CanvasRenderingContext2D,"moveTo"|"lineTo"|"quadraticCurveTo">&{beginPath?:()=>void},road:Pick<TownFeature,"points"|"category">,project:(p:TownPoint)=>TownPoint){
 const sections=townRoadSections(road);ctx.beginPath?.();if(!sections.length)return;const a=project(sections[0].a);ctx.moveTo(a.x,a.y);
 for(const section of sections){const b=project(section.b);if(section.control){const c=project(section.control);ctx.quadraticCurveTo(c.x,c.y,b.x,b.y);}else ctx.lineTo(b.x,b.y);}
}
function segmentNear(p:TownPoint,a:TownPoint,b:TownPoint){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return {x:a.x+t*dx,y:a.y+t*dy};}
/** Bounding-box pruning keeps curved-road hit testing/snapping local, at centimetre accuracy. */
export function nearestTownRoad(p:TownPoint,road:Pick<TownFeature,"points"|"category">,maxDistance=Infinity,precision=.01){
 let distance=maxDistance,point:TownPoint|undefined,angle=0;
 const check=(a:TownPoint,b:TownPoint,c?:TownPoint,depth=0)=>{
  const ps=c?[a,b,c]:[a,b],xs=ps.map(q=>q.x),ys=ps.map(q=>q.y),dx=Math.max(0,Math.min(...xs)-p.x,p.x-Math.max(...xs)),dy=Math.max(0,Math.min(...ys)-p.y,p.y-Math.max(...ys));if(Math.hypot(dx,dy)>distance)return;
  if(c&&depth<12){const flat=segmentNear(c,a,b);if(Math.hypot(c.x-flat.x,c.y-flat.y)>Math.max(.001,precision)){const ac=mid(a,c),cb=mid(c,b),m=mid(ac,cb);check(a,m,ac,depth+1);check(m,b,cb,depth+1);return;}}
  const q=segmentNear(p,a,b),d=Math.hypot(p.x-q.x,p.y-q.y);if(d<=distance){distance=d;point=q;angle=Math.atan2(b.y-a.y,b.x-a.x);}
 };
 for(const s of townRoadSections(road))check(s.a,s.b,s.control);
 return point?{point,distance,angle}:undefined;
}
/** Bounded physical sampling for street-front parcels, never persisted in place of bend points. */
export function sampleTownRoad(road:Pick<TownFeature,"points"|"category">,tolerance=.15){
 const sections=townRoadSections(road),result:TownPoint[]=[];if(!sections.length)return result;result.push(sections[0].a);
 const cap=Math.max(1,Math.floor(2048/sections.length));
 for(const s of sections){const c=s.control,q=c?segmentNear(c,s.a,s.b):s.a,flat=c?Math.hypot(c.x-q.x,c.y-q.y):0,steps=c?Math.max(1,Math.min(cap,64,Math.ceil(Math.sqrt(flat/Math.max(.01,tolerance))))):1;
  for(let i=1;i<=steps;i++){const t=i/steps;result.push(c?{x:(1-t)**2*s.a.x+2*(1-t)*t*c.x+t*t*s.b.x,y:(1-t)**2*s.a.y+2*(1-t)*t*c.y+t*t*s.b.y}:s.b);}
 }return result;
}
export function townRoadAtDistance(points:TownPoint[],distance:number){
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.y-a.y);if(distance<=length||i===points.length-1){const t=Math.max(0,Math.min(1,distance/Math.max(.001,length)));return {point:{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t},angle:Math.atan2(b.y-a.y,b.x-a.x)};}distance-=length;}
 return {point:points[0]??{x:0,y:0},angle:0};
}
