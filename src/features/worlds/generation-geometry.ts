import type { Point, Vertex } from "./atlas";
import { rounded } from "./atlas-coordinates";

export function seededRandom(seed: string) {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619);
  return () => {state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296;};
}
export function inside(p: Point, polygon: Point[]) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) result = !result;
  }
  return result;
}
export function edgeDistance(p: Point, polygon: Point[]) {
  let nearest = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i+1)%polygon.length], length = (b.x-a.x)**2+(b.y-a.y)**2;
    const t = Math.max(0, Math.min(1, ((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/length));
    nearest = Math.min(nearest, Math.hypot(p.x-a.x-(b.x-a.x)*t,p.y-a.y-(b.y-a.y)*t));
  }
  return nearest;
}
export function bounds(points: Point[]) {
  const x = Math.min(...points.map(p=>p.x)), y = Math.min(...points.map(p=>p.y));
  return {x, y, width: Math.max(...points.map(p=>p.x))-x, height: Math.max(...points.map(p=>p.y))-y};
}
export function separated(a: Point[], b: Point[], gap = 14) {
  const cross = (p:Point,q:Point,r:Point)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++){
    const p=a[i],q=a[(i+1)%a.length],r=b[j],s=b[(j+1)%b.length];
    if(cross(p,q,r)*cross(p,q,s)<0&&cross(r,s,p)*cross(r,s,q)<0)return false;
  }
  // Generated silhouettes are radial; sample edges as well as vertices for separation.
  for (const [one, other] of [[a,b],[b,a]]) for (let i = 0; i < one.length; i++) {
    const p = one[i], q = one[(i+1)%one.length];
    for (const t of [0,.5]) {const at = {x: p.x+(q.x-p.x)*t, y: p.y+(q.y-p.y)*t}; if (inside(at,other)||edgeDistance(at,other)<gap) return false;}
  }
  return true;
}
export const position = (x: number, y: number): Point => ({x: rounded(x), y: rounded(y)});

export function bezierSamples(points: Vertex[], curve: number) {
  const result: Point[] = [];
  for (let i=0; i<points.length-1; i++) {
    const prev=points[Math.max(0,i-1)], a=points[i], b=points[i+1], next=points[Math.min(points.length-1,i+2)];
    const c={x:a.x+(b.x-prev.x)*curve/6,y:a.y+(b.y-prev.y)*curve/6},d={x:b.x-(next.x-a.x)*curve/6,y:b.y-(next.y-a.y)*curve/6};
    for (let j=0;j<16;j++){const t=j/16,u=1-t;result.push({x:u**3*a.x+3*u*u*t*c.x+3*u*t*t*d.x+t**3*b.x,y:u**3*a.y+3*u*u*t*c.y+3*u*t*t*d.y+t**3*b.y});}
  }
  return result;
}
