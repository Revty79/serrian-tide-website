import {sourceGeometrySchema,surfaceBounds,wrapLongitude,type Coordinate,type GeographicBounds,type SourceGeometry,type SpatialReference} from "./geographic";

/** Source-sized storage, small interaction windows. No simplification is authored. */
export const SOURCE_VERTEX_WINDOW=64;
export type SourceVertex={component:number;ring:number;vertex:number};
export function sourceComponentCount(g:SourceGeometry){return g.type==='MultiPolygon'||g.type==='MultiLineString'?g.coordinates.length:1;}
export function sourceRingCount(g:SourceGeometry,c:number){return g.type==='MultiPolygon'?g.coordinates[c]?.length??0:g.type==='Polygon'?g.coordinates.length:1;}
export function sourceRing(g:SourceGeometry,c:number,r:number):{points:Coordinate[];closed:boolean}{
 if(!Number.isInteger(c)||!Number.isInteger(r)||c<0||c>=sourceComponentCount(g)||r<0||r>=sourceRingCount(g,c))throw Error('Choose an existing source component and ring.');
 const closed=g.type==='Polygon'||g.type==='MultiPolygon',raw=g.type==='Point'?[g.coordinates]:g.type==='LineString'?g.coordinates:g.type==='MultiLineString'?g.coordinates[c]:g.type==='Polygon'?g.coordinates[r]:g.coordinates[c][r];
 if(closed&&(raw[0][0]!==raw.at(-1)![0]||raw[0][1]!==raw.at(-1)![1]))throw Error('Close each source ring in the coordinate text before visual editing.');
 return {points:closed?raw.slice(0,-1):raw,closed};
}
export function sourceSelection(g:SourceGeometry,s:SourceVertex):SourceVertex{const component=Math.max(0,Math.min(sourceComponentCount(g)-1,Math.trunc(s.component)||0)),ring=Math.max(0,Math.min(sourceRingCount(g,component)-1,Math.trunc(s.ring)||0)),vertex=Math.max(0,Math.min(sourceRing(g,component,ring).points.length-1,Math.trunc(s.vertex)||0));return {component,ring,vertex};}
export function editSourceVertex(g:SourceGeometry,s:SourceVertex,action:'move'|'insert'|'remove',point?:Coordinate):SourceGeometry{
 const {points,closed}=sourceRing(g,s.component,s.ring);if(!Number.isInteger(s.vertex)||!points[s.vertex])throw Error('Choose an existing source vertex.');
 if(action!=='move'&&g.type==='Point')throw Error('A point remains one coordinate.');
 if(action==='remove'&&points.length<=(closed?3:2))throw Error('Keep at least three polygon vertices or two line vertices.');
 if(action!=='remove'&&(!point||!point.every(Number.isFinite)))throw Error('Enter two finite source coordinates.');
 const next=points.slice();if(action==='move')next[s.vertex]=point!;else if(action==='insert')next.splice(s.vertex+1,0,point!);else next.splice(s.vertex,1);
 const raw=closed?[...next,next[0]]:next;
 // Only the selected ring is copied. Untouched coordinates keep their exact
 // values and ordering, including all distant islands, holes and seam vertices.
 const result:SourceGeometry=g.type==='Point'?{...g,coordinates:next[0]}:g.type==='LineString'?{...g,coordinates:raw}:g.type==='MultiLineString'?{...g,coordinates:g.coordinates.map((v,i)=>i===s.component?raw:v)}:g.type==='Polygon'?{...g,coordinates:g.coordinates.map((v,i)=>i===s.ring?raw:v)}:{...g,coordinates:g.coordinates.map((p,i)=>i===s.component?p.map((r,j)=>j===s.ring?raw:r):p)};
 return sourceGeometrySchema.parse(result);
}
export function moveSourceExtent(b:GeographicBounds,reference:SpatialReference,dx:number,dy:number,factor=1):GeographicBounds{
 const d=surfaceBounds(reference),span=b[0]>b[2]?360-b[0]+b[2]:b[2]-b[0],minimum=(d[2]-d[0])*1e-10,w=Math.max(minimum,Math.min(d[2]-d[0],span*factor)),h=Math.max(minimum,Math.min(d[3]-d[1],(b[3]-b[1])*factor));let x=b[0]+span*(.5+dx);const y=Math.max(d[1]+h/2,Math.min(d[3]-h/2,(b[1]+b[3])/2+dy*(b[3]-b[1])));
 if(reference.kind==='sphere'&&w<360)return [wrapLongitude(x-w/2),y-h/2,wrapLongitude(x+w/2),y+h/2];x=Math.max(d[0]+w/2,Math.min(d[2]-w/2,x));return [x-w/2,y-h/2,x+w/2,y+h/2];
}
