import { boundedPoint, rounded, validateGeometry, type Geometry, type Point, type Vertex } from "./atlas";
type Polygon = Extract<Geometry,{type:"polygon"}>;
export function smoothCoastline(geometry:Polygon, strength=.4):Polygon {
  const points=geometry.points.map((p,i,all)=>{
    const before=all[(i+all.length-1)%all.length],after=all[(i+1)%all.length];
    return {...p,...boundedPoint({x:p.x*(1-strength)+(before.x+after.x)*strength/2,y:p.y*(1-strength)+(before.y+after.y)*strength/2})};
  });const next={...geometry,points};validateGeometry(next);return next;
}
export function detailCoastline(geometry:Polygon, amount:number, makeId:()=>string):Polygon {
  if(geometry.points.length>128)throw new Error("Coastal detail doubles the boundary points. Start with at most 128 points, or sculpt a small section instead.");
  const points=geometry.points.flatMap((a,i,all)=>{const b=all[(i+1)%all.length],length=Math.hypot(b.x-a.x,b.y-a.y),offset=Math.min(amount,length*.13)*Math.sin((i+1)*12.9898);return [a,{id:makeId(),...boundedPoint({x:(a.x+b.x)/2-(b.y-a.y)*offset/length,y:(a.y+b.y)/2+(b.x-a.x)*offset/length})}];});
  const next={...geometry,points};validateGeometry(next);return next;
}
export function prepareSculpt(geometry:Polygon, at:Point, radius:number, makeId:()=>string):Polygon {
  let nearest={index:-1,t:0,distance:Infinity};
  geometry.points.forEach((a,i,all)=>{const b=all[(i+1)%all.length],length2=(b.x-a.x)**2+(b.y-a.y)**2,t=Math.max(0,Math.min(1,((at.x-a.x)*(b.x-a.x)+(at.y-a.y)*(b.y-a.y))/length2)),distance=Math.hypot(at.x-a.x-(b.x-a.x)*t,at.y-a.y-(b.y-a.y)*t);if(distance<nearest.distance)nearest={index:i,t,distance};});
  if(nearest.distance>radius*.8)throw new Error("Start the sculpting brush near the selected coastline.");
  const points=[...geometry.points],a=points[nearest.index],b=points[(nearest.index+1)%points.length],length=Math.hypot(b.x-a.x,b.y-a.y),step=radius/length;
  const inserted=[-1,-.5,0,.5,1].map(s=>nearest.t+s*step).filter(t=>t>.005&&t<.995).map(t=>({id:makeId(),x:rounded(a.x+(b.x-a.x)*t),y:rounded(a.y+(b.y-a.y)*t)})).filter(p=>!points.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<.1));
  if(points.length+inserted.length>256)throw new Error("This coastline has reached its point limit. Remove some points before sculpting.");
  points.splice(nearest.index+1,0,...inserted);const next={...geometry,points};validateGeometry(next);return next;
}
export function sculptCoastline(geometry:Polygon, from:Point, to:Point, radius:number):Polygon {
  return {...geometry,points:geometry.points.map(p=>{const distance=Math.hypot(p.x-from.x,p.y-from.y),weight=distance>=radius?0:(1-distance/radius)**2;return {...p,...boundedPoint({x:p.x+(to.x-from.x)*weight,y:p.y+(to.y-from.y)*weight})};})};
}
export function simplifyTrace(points:Vertex[], tolerance=5):Vertex[] {
  if(points.length<=2)return points;
  const a=points[0],b=points.at(-1)!,length2=(b.x-a.x)**2+(b.y-a.y)**2;let furthest=0,index=0;
  for(let i=1;i<points.length-1;i++){const p=points[i],t=length2?Math.max(0,Math.min(1,((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/length2)):0,distance=Math.hypot(p.x-a.x-(b.x-a.x)*t,p.y-a.y-(b.y-a.y)*t);if(distance>furthest){furthest=distance;index=i;}}
  return furthest>tolerance?[...simplifyTrace(points.slice(0,index+1),tolerance).slice(0,-1),...simplifyTrace(points.slice(index),tolerance)]:[a,b];
}
