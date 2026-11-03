import type {FloorFeature} from "./building-floor";
import {undergroundAttribute,type UndergroundDesign} from "./underground";
import type {TownPoint} from "./town-map";

type Wall=Extract<FloorFeature,{variant:"wall"}>;
type Opening=Extract<FloorFeature,{variant:"opening"}>;
type Portal={point:TownPoint;tangent:TownPoint;width:number;opening:Opening};
const round=(n:number)=>Math.round(n*100)/100;
const distance=(a:TownPoint,b:TownPoint)=>Math.hypot(a.x-b.x,a.y-b.y);
function near(p:TownPoint,a:TownPoint,b:TownPoint){const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(length*length||1))),point={x:a.x+t*dx,y:a.y+t*dy};return {t,point,length,distance:distance(p,point)};}
function crossing(a:TownPoint,b:TownPoint,c:TownPoint,e:TownPoint){const dx=b.x-a.x,dy=b.y-a.y,ex=e.x-c.x,ey=e.y-c.y,den=dx*ey-dy*ex;if(Math.abs(den)<1e-8)return;const t=((c.x-a.x)*ey-(c.y-a.y)*ex)/den,u=((c.x-a.x)*dy-(c.y-a.y)*dx)/den;const tolerance=.015/Math.hypot(dx,dy);if(t< -tolerance||t>1+tolerance||u<0||u>1)return;return {t,u,point:{x:a.x+dx*t,y:a.y+dy*t},sine:Math.abs(den)/(Math.hypot(dx,dy)*Math.hypot(ex,ey))};}
function portals(d:UndergroundDesign){const walls=new Map(d.features.filter((f):f is Wall=>f.variant==="wall"&&!f.archived).map(f=>[f.id,f]));return d.features.flatMap(f=>{
 if(f.variant!=="opening"||f.archived||!d.layers.openings.visible)return [];const wall=walls.get(f.wallId);if(!wall||!d.layers.walls.visible)return [];const a=wall.points.find(p=>p.id===f.startId),b=wall.points.find(p=>p.id===f.endId);if(!a||!b)return [];const length=distance(a,b);if(!length)return [];return [{point:{x:a.x+(b.x-a.x)*f.at,y:a.y+(b.y-a.y)*f.at},tangent:{x:(b.x-a.x)/length,y:(b.y-a.y)/length},width:f.width,opening:f}];
 });}

/** Only a newly finished path is adjusted. Existing rooms, openings and IDs remain exact. */
export function joinUndergroundPassage(d:UndergroundDesign,pathId:string,newId:()=>string):UndergroundDesign{
 const original=d.features.find(f=>f.id===pathId);if(original?.variant!=="wall"||!["passage","tunnel","secret"].includes(d.attributes[pathId].category))return d;
 const width=d.attributes[pathId].width,points=original.points.map(p=>({...p})),walls=d.features.filter((f):f is Wall=>f.variant==="wall"&&!f.archived&&d.attributes[f.id].category==="wall"&&d.layers.walls.visible),existing=portals(d),added:Opening[]=[],attributes={...d.attributes};
 // A deliberate click close to a doorway uses its actual centre, even with grid snapping on.
 for(const index of [0,points.length-1]){const p=points[index],limit=Math.min(1.25,Math.max(.35,width/3));let best:TownPoint|undefined,bestDistance=limit;
  for(const portal of existing){const dist=distance(p,portal.point);if(dist<bestDistance){best=portal.point;bestDistance=dist;}}
  if(!best)for(const wall of walls)for(let j=1;j<wall.points.length;j++){const a=wall.points[j-1],b=wall.points[j],n=near(p,a,b);if(!n.length)continue;const half=Math.min(width,n.length*.9)/(2*n.length),t=Math.max(half,Math.min(1-half,n.t)),point={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t},dist=distance(p,point);if(dist<bestDistance){best=point;bestDistance=dist;}}
  if(best)points[index]={...p,x:round(best.x),y:round(best.y)};
 }
 const path={...original,points};
 for(let i=1;i<points.length;i++)for(const wall of walls)for(let j=1;j<wall.points.length;j++){
  const a=wall.points[j-1],b=wall.points[j],hit=crossing(points[i-1],points[i],a,b),length=distance(a,b);if(!hit||length<.25||hit.sine<.15)continue;
  const attached=[...d.features,...added].filter((f):f is Opening=>f.variant==="opening"&&!f.archived&&f.wallId===wall.id&&f.startId===a.id&&f.endId===b.id);
  // A pre-existing narrow door keeps its exact width and style; artwork tapers to it.
  if(attached.some(f=>Math.abs(f.at-hit.u)*length<=f.width/2+.05))continue;
  const openingWidth=round(Math.min(20,width/hit.sine,length*.9)),half=openingWidth/(2*length),at=Math.max(half,Math.min(1-half,hit.u));
  // Do not cover or silently resize a nearby independently authored opening.
  if(attached.some(f=>Math.abs(f.at-at)*length<(f.width+openingWidth)/2))throw Error("This passage meets the wall beside an existing opening. Finish it at that opening's centre, or move the path away from it.");
  const id=newId(),visibility=[d.attributes[path.id].visibility,d.attributes[wall.id].visibility,wall.roomId?d.attributes[wall.roomId]?.visibility:"ordinary"].includes("god-only")?"god-only":[d.attributes[path.id].visibility,d.attributes[wall.id].visibility,wall.roomId?d.attributes[wall.roomId]?.visibility:"ordinary"].includes("secret")?"secret":"ordinary";
  added.push({version:1,id,entityId:id,name:"Passage opening",kind:"opening",variant:"opening",archived:false,wallId:wall.id,startId:a.id,endId:b.id,at,width:openingWidth,style:"passage"});attributes[id]={...undergroundAttribute("opening"),visibility};
 }
 return {...d,features:[...d.features.map(f=>f.id===path.id?path:f),...added],attributes};
}

type Section={point:TownPoint;normal:TownPoint;width:number;t:number;portal?:boolean};
export type PassageBand={sections:Section[];roundStart:boolean;roundEnd:boolean};
type Tree={minX:number;minY:number;maxX:number;maxY:number;items?:Portal[];left?:Tree;right?:Tree};
function tree(items:Portal[]):Tree|undefined{if(!items.length)return;const xs=items.map(p=>p.point.x),ys=items.map(p=>p.point.y),bounds={minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};if(items.length<=8)return {...bounds,items};const axis=bounds.maxX-bounds.minX>bounds.maxY-bounds.minY?"x":"y",sorted=[...items].sort((a,b)=>a.point[axis]-b.point[axis]),middle=sorted.length>>1;return {...bounds,left:tree(sorted.slice(0,middle)),right:tree(sorted.slice(middle))};}
function query(node:Tree|undefined,a:TownPoint,b:TownPoint,pad:number,out:Portal[]){if(!node||node.maxX<Math.min(a.x,b.x)-pad||node.minX>Math.max(a.x,b.x)+pad||node.maxY<Math.min(a.y,b.y)-pad||node.minY>Math.max(a.y,b.y)+pad)return;if(node.items)out.push(...node.items);else{query(node.left,a,b,pad,out);query(node.right,a,b,pad,out);}}
const cache=new WeakMap<UndergroundDesign,Map<string,PassageBand[]>>();
/** Derived presentation only. The saved path and attached opening geometry are never rewritten. */
export function undergroundPassageBands(d:UndergroundDesign){const previous=cache.get(d);if(previous)return previous;const index=tree(portals(d)),result=new Map<string,PassageBand[]>();
 for(const path of d.features){if(path.variant!=="wall"||path.archived||!["passage","tunnel","secret","water"].includes(d.attributes[path.id].category))continue;const width=d.attributes[path.id].width,bands:PassageBand[]=[];
  for(let i=1;i<path.points.length;i++){const a=path.points[i-1],b=path.points[i],length=distance(a,b);if(length<.001)continue;const direction={x:(b.x-a.x)/length,y:(b.y-a.y)/length},normal={x:-direction.y,y:direction.x},candidates:Portal[]=[];query(index,a,b,Math.min(2,width/2),candidates);const hits=candidates.flatMap(p=>{const n=near(p.point,a,b);return n.distance<=Math.min(2,width/2)&&Math.abs(direction.x*p.tangent.y-direction.y*p.tangent.x)>.15?[{...p,t:n.t}]:[];}).sort((x,y)=>x.t-y.t);
   const at=(t:number):Section=>({t,point:{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t},normal,width}),sections:Section[]=[at(0)];
   for(let j=0;j<hits.length;j++){const h=hits[j];if(j&&h.t-hits[j-1].t<.00001)continue;const span=Math.min(Math.max(width,h.width)*1.25/length,(h.t-(hits[j-1]?.t??0))/2,((hits[j+1]?.t??1)-h.t)/2),sign=h.tangent.x*normal.x+h.tangent.y*normal.y<0?-1:1;
    if(h.t-span>0)sections.push(at(h.t-span));sections.push({t:h.t,point:h.point,normal:{x:h.tangent.x*sign,y:h.tangent.y*sign},width:h.width,portal:true});if(h.t+span<1)sections.push(at(h.t+span));
   }
   sections.push(at(1));sections.sort((x,y)=>x.t-y.t||Number(!!y.portal)-Number(!!x.portal));const unique=sections.filter((s,j)=>!j||s.t-sections[j-1].t>.000001);
   bands.push({sections:unique,roundStart:!hits.some(h=>h.t<.00001),roundEnd:!hits.some(h=>h.t>1-.00001)});
  }result.set(path.id,bands);
 }cache.set(d,result);return result;
}
