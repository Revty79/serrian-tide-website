import { MAP_WIDTH, MAP_HEIGHT, rounded } from "./atlas-coordinates";
import type { Point, Geometry } from "./atlas";
export function signedArea(points: Point[]) {return points.reduce((sum, p, i) => {const next = points[(i + 1) % points.length]; return sum + p.x * next.y - next.x * p.y;}, 0) / 2;}
const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function intersects(a: Point, b: Point, c: Point, d: Point) {
  const on = (p: Point, q: Point, r: Point) => Math.abs(cross(p,q,r)) < 1e-8 && r.x >= Math.min(p.x,q.x) && r.x <= Math.max(p.x,q.x) && r.y >= Math.min(p.y,q.y) && r.y <= Math.max(p.y,q.y);
  return (cross(a,b,c) * cross(a,b,d) < 0 && cross(c,d,a) * cross(c,d,b) < 0) || on(a,b,c) || on(a,b,d) || on(c,d,a) || on(c,d,b);
}
export function validateGeometry(geometry: Geometry, width = MAP_WIDTH, height = MAP_HEIGHT) {
  const points = geometry.type === "polygon" ? geometry.points : [geometry.point];
  if (points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > width || p.y > height || Math.abs(p.x-rounded(p.x)) > 1e-8 || Math.abs(p.y-rounded(p.y)) > 1e-8)) throw new Error("Points must be inside the map, with at most two decimal places.");
  if (geometry.type === "point") return;
  if (points.length < 3 || points.length > 256 || Math.abs(signedArea(points)) < 1) throw new Error("An outline needs 3 to 256 points and a visible area of at least one square map unit.");
  if (new Set(geometry.points.map(p => p.id)).size !== points.length || new Set(points.map(p => `${p.x}:${p.y}`)).size !== points.length) throw new Error("Every boundary point must have a distinct identity and position.");
  for (let i=0; i<points.length; i++) {
    const a=points[i], b=points[(i+1)%points.length], prev=points[(i+points.length-1)%points.length];
    if (Math.abs(cross(prev,a,b)) < 1e-8 && (a.x-prev.x)*(b.x-a.x)+(a.y-prev.y)*(b.y-a.y) <= 0) throw new Error("The outline must not double back along an edge.");
    for (let j=i+1; j<points.length; j++) {if (j === i+1 || (i === 0 && j === points.length-1)) continue; if (intersects(a,b,points[j],points[(j+1)%points.length])) throw new Error("The outline must not cross or touch itself. Move the conflicting points before saving.");}
  }
}
