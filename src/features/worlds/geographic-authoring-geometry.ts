import {geoInterpolate} from "d3-geo";
import {sourceGeometrySchema,type Coordinate,type SourceGeometry,type SpatialReference} from "./geographic";
import {pointInsideGeographicRing,validateSourceGeometry} from "./geographic-geometry";

// These are interaction limits, not import limits. Originals are never trimmed.
export const AUTHORING_LIMITS={vertices:256,components:8,rings:24,holesPerComponent:8} as const;
export type GeographicRingDraft={points:Coordinate[];complete:boolean;original:Coordinate[]|null};
export type GeographicDraft={kind:"island"|"landmass"|"river";type:"Polygon"|"MultiPolygon"|"LineString";components:{rings:GeographicRingDraft[]}[]};
export function newGeographicDraft(kind:GeographicDraft["kind"]):GeographicDraft{return {kind,type:kind==="river"?"LineString":"Polygon",components:[{rings:[{points:[],complete:false,original:null}]}]};}
export function geographicDraft(geometry:SourceGeometry):GeographicDraft{
 if(geometry.type!=="LineString"&&geometry.type!=="Polygon"&&geometry.type!=="MultiPolygon")throw new Error("This visual editor supports Polygon, MultiPolygon and open LineString sources. Points and multipart lines remain retained and read-only.");
 const polygons=geometry.type==="LineString"?[[geometry.coordinates]]:geometry.type==="Polygon"?[geometry.coordinates]:geometry.coordinates;
 return {kind:geometry.type==="LineString"?"river":"island",type:geometry.type,components:polygons.map(polygon=>({rings:polygon.map(ring=>{if(geometry.type!=="LineString"&&JSON.stringify(ring[0])!==JSON.stringify(ring.at(-1)))throw new Error("Close every geographic ring with its original first coordinate.");const points=structuredClone(geometry.type==="LineString"?ring:ring.slice(0,-1));return {points,complete:true,original:structuredClone(points)};})}))};
}
export const geographicVertexCount=(draft:GeographicDraft)=>draft.components.reduce((sum,c)=>sum+c.rings.reduce((n,r)=>n+r.points.length,0),0);
export const geographicRingCount=(draft:GeographicDraft)=>draft.components.reduce((n,c)=>n+c.rings.length,0);
export const unfinishedGeography=(draft:GeographicDraft)=>draft.components.some(c=>c.rings.some(r=>!r.complete));
export function selectedGeographicRing(draft:GeographicDraft,component:number,ring:number){return draft.components[component].rings[ring];}
export function changeGeographicRing<T extends GeographicDraft>(draft:T,component:number,ring:number,patch:Partial<GeographicRingDraft>):T{return {...draft,components:draft.components.map((c,i)=>i===component?{...c,rings:c.rings.map((r,j)=>j===ring?{...r,...patch}:r)}:c)};}

const area=(points:Coordinate[])=>{const origin=points[0];return points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+(p[0]-origin[0])*(q[1]-origin[1])-(q[0]-origin[0])*(p[1]-origin[1]);},0);};
function closedRing(points:Coordinate[],hole:boolean){const result=structuredClone(points);if((area(result)<0)!==hole)result.splice(1,result.length-1,...result.slice(1).reverse());return [...result,result[0]];}
export function geographicDraftGeometry(draft:GeographicDraft):SourceGeometry{
 if(!draft.components.length||draft.components.some(c=>!c.rings.length)||draft.type!=="MultiPolygon"&&draft.components.length!==1||draft.type==="LineString"&&draft.components[0].rings.length!==1)throw new Error("Retain every source component and ring in its declared geometry structure.");
 if(unfinishedGeography(draft))throw new Error("Complete every geographic component and ring before saving, or remove the unfinished part.");
 if(draft.type==="LineString"){if(draft.components[0].rings[0].points.length<2)throw new Error("Add at least two vertices to the geographic line.");return sourceGeometrySchema.parse({type:"LineString",coordinates:draft.components[0].rings[0].points});}
 const coordinates=draft.components.map(c=>c.rings.map((ring,index)=>{
  if(ring.points.length<3)throw new Error("Each geographic ring needs at least three vertices.");
  // A selection or another island's edit must not reorder an untouched original.
  return ring.original&&JSON.stringify(ring.points)===JSON.stringify(ring.original)?[...structuredClone(ring.points),structuredClone(ring.points[0])]:closedRing(ring.points,index>0);
 }));
 return sourceGeometrySchema.parse(draft.type==="Polygon"?{type:"Polygon",coordinates:coordinates[0]}:{type:"MultiPolygon",coordinates});
}
/** Normalize only changed/new rings, retaining all untouched original coordinates/order. */
export function canonicalAuthoringGeometry(geometry:SourceGeometry,original?:SourceGeometry):SourceGeometry{
 const next=geographicDraft(geometry);if(next.type==="LineString")return structuredClone(geometry);
 const old=original?geographicDraft(original):null,retained=new Set(old?.components.flatMap(c=>c.rings.map((r,i)=>`${i===0}:${JSON.stringify(r.points)}`))??[]);
 for(const c of next.components)c.rings.forEach((r,i)=>{if(!retained.has(`${i===0}:${JSON.stringify(r.points)}`))r.original=null;});
 return geographicDraftGeometry(next);
}
/** A partial outline never hides the other completed components or holes. */
export function geographicDraftPreview(draft:GeographicDraft):SourceGeometry|null{
 if(draft.type==="LineString"){const points=draft.components[0].rings[0].points;return points.length>=2?{type:"LineString",coordinates:points}:null;}
 const coordinates=draft.components.filter(c=>c.rings[0].complete&&c.rings[0].points.length>=3).map(c=>c.rings.filter(r=>r.complete&&r.points.length>=3).map((r,i)=>closedRing(r.points,i>0)));
 return coordinates.length?{type:"MultiPolygon",coordinates}:null;
}
export function appendGeographicPart<T extends GeographicDraft>(draft:T,component:number,hole:boolean){
 if(draft.type==="LineString")throw new Error("An open river remains one line; polygon components and holes belong to land features.");
 if(unfinishedGeography(draft))throw new Error("Complete or remove the unfinished geographic ring before adding another part.");
 if(geographicVertexCount(draft)>AUTHORING_LIMITS.vertices-3)throw new Error("Leave room for at least three vertices within the 256-vertex feature limit.");
 if(geographicRingCount(draft)>=AUTHORING_LIMITS.rings)throw new Error("This visual editor supports at most 24 rings in one feature.");
 const ring:GeographicRingDraft={points:[],complete:false,original:null};
 if(hole){if(draft.components[component].rings.length>AUTHORING_LIMITS.holesPerComponent)throw new Error("This visual editor supports at most eight holes per component.");return {draft:{...draft,components:draft.components.map((c,i)=>i===component?{...c,rings:[...c.rings,ring]}:c)},component,ring:draft.components[component].rings.length};}
 if(draft.components.length>=AUTHORING_LIMITS.components)throw new Error("This visual editor supports at most eight polygon components.");
 return {draft:{...draft,type:"MultiPolygon" as const,components:[...draft.components,{rings:[ring]}]},component:draft.components.length,ring:0};
}
export function removeGeographicPart<T extends GeographicDraft>(draft:T,component:number,ring:number,wholeComponent:boolean):T{
 if(draft.type==="LineString")throw new Error("Keep the open geographic line.");
 if(wholeComponent){if(draft.components.length<=1)throw new Error("Keep at least one geographic component.");return {...draft,components:draft.components.filter((_,i)=>i!==component)};}
 if(ring===0)throw new Error("An exterior belongs to its whole component. Select a hole to remove only an interior ring.");
 return {...draft,components:draft.components.map((c,i)=>i===component?{...c,rings:c.rings.filter((_,j)=>j!==ring)}:c)};
}
export function insertGeographicVertex<T extends GeographicDraft>(draft:T,component:number,ring:number,index:number,reference:SpatialReference):T{
 const selected=selectedGeographicRing(draft,component,ring),next=index+1;
 if(draft.type==="LineString"&&next>=selected.points.length)throw new Error("Choose a vertex before the end of the line to insert a point between its vertices.");
 if(geographicVertexCount(draft)>=AUTHORING_LIMITS.vertices)throw new Error("This feature has reached its 256-vertex limit.");
 const a=selected.points[index],b=selected.points[next%selected.points.length],point:Coordinate=reference.kind==="sphere"?geoInterpolate(a,b)(.5) as Coordinate:[(a[0]+b[0])/2,(a[1]+b[1])/2];
 return changeGeographicRing(draft,component,ring,{points:[...selected.points.slice(0,next),point,...selected.points.slice(next)]});
}

const cross=(a:Coordinate,b:Coordinate,p:Coordinate)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
function touches(a:Coordinate,b:Coordinate,p:Coordinate){const scale=Math.abs((b[0]-a[0])*(p[1]-a[1]))+Math.abs((b[1]-a[1])*(p[0]-a[0]));return Math.abs(cross(a,b,p))<=Number.EPSILON*16*scale&&p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])&&p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1]);}
const intersects=(a:Coordinate,b:Coordinate,c:Coordinate,d:Coordinate)=>cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0||touches(a,b,c)||touches(a,b,d)||touches(c,d,a)||touches(c,d,b);
function sharedEdge(a:Coordinate,b:Coordinate,c:Coordinate,d:Coordinate){const onLine=(p:Coordinate)=>Math.abs(cross(a,b,p))<=Number.EPSILON*16*(Math.abs((b[0]-a[0])*(p[1]-a[1]))+Math.abs((b[1]-a[1])*(p[0]-a[0])));if(!onLine(c)||!onLine(d))return false;const axis=Math.abs(b[0]-a[0])>=Math.abs(b[1]-a[1])?0:1;return Math.min(Math.max(a[axis],b[axis]),Math.max(c[axis],d[axis]))>Math.max(Math.min(a[axis],b[axis]),Math.min(c[axis],d[axis]));}
function filledInterior(point:Coordinate,rings:Coordinate[][]){return pointInsideGeographicRing(point,rings[0])&&!rings.slice(1).some(r=>pointInsideGeographicRing(point,r)||r.some((a,i)=>touches(a,r[(i+1)%r.length],point)));}
// Contacts must not conceal a crossing through polygon vertices. Split edges at
// all contacting vertices and check the interior of every resulting interval.
function boundaryEnters(a:Coordinate[],other:Coordinate[][]){const vertices=other.flat();for(let i=0;i<a.length;i++){const p=a[i],q=a[(i+1)%a.length],axis=Math.abs(q[0]-p[0])>=Math.abs(q[1]-p[1])?0:1,stops=[0,1];for(const v of vertices)if(touches(p,q,v))stops.push((v[axis]-p[axis])/(q[axis]-p[axis]));stops.sort((a,b)=>a-b);for(let j=1;j<stops.length;j++){if(stops[j]-stops[j-1]<=Number.EPSILON*32)continue;const t=(stops[j]+stops[j-1])/2;if(filledInterior([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])],other))return true;}}return false;}
export function validateAuthoringGeometry(geometry:SourceGeometry,reference:SpatialReference){
 const draft=geographicDraft(geometry),allRings=draft.components.flatMap(c=>c.rings),points=allRings.flatMap(r=>r.points),line=draft.type==="LineString";
 if(points.length>AUTHORING_LIMITS.vertices||draft.components.length>AUTHORING_LIMITS.components||allRings.length>AUTHORING_LIMITS.rings||draft.components.some(c=>c.rings.length>1+AUTHORING_LIMITS.holesPerComponent))throw new Error("This visual editor supports 256 total vertices, eight components, 24 total rings and eight holes per component. Larger original sources remain intact and read-only.");
 for(const r of allRings)if(new Set(r.points.map(p=>JSON.stringify(p))).size!==r.points.length)throw new Error("Use distinct vertices within each ring or line; repeated points can create a self-intersection.");
 const west=Math.min(...points.map(p=>p[0])),east=Math.max(...points.map(p=>p[0])),complex=draft.components.length>1||allRings.length>1;
 if(reference.kind==="sphere"){
  if(points.some(p=>Math.abs(p[1])>85)||east-west>=180)throw new Error("Basic spherical editing needs a local shape within one longitude band and vertices between 85 degrees south and north. Polar and antimeridian sources remain intact and read-only.");
  if(complex&&(points.some(p=>Math.abs(p[1])>75)||east-west>=120))throw new Error("Multipart spherical editing supports local sources with vertices between 75 degrees south and north and a longitude span below 120 degrees. Wider, polar and antimeridian originals remain read-only.");
 }
 validateSourceGeometry(geometry,reference);
 // A common gnomonic plane makes every supported great-circle edge straight.
 // Use the existing polygon validator there as well as on original coordinates.
 const center=(west+east)/2,project=(p:Coordinate):Coordinate=>reference.kind==="plane"?p:[Math.tan((p[0]-center)*Math.PI/180),Math.tan(p[1]*Math.PI/180)/Math.cos((p[0]-center)*Math.PI/180)];
 const rings=allRings.map(r=>r.points.map(project)),owners=draft.components.flatMap((c,component)=>c.rings.map((_,ring)=>({component,ring}))),contacts=new Set<string>(),components=draft.components.map(c=>c.rings.map(r=>r.points.map(project))),edges=rings.map(r=>r.slice(0,line?-1:undefined).map((p,i)=>[p,r[(i+1)%r.length]]));
 for(let k=0;k<rings.length;k++){
  const r=rings[k];for(let i=line?1:0;i<(line?r.length-1:r.length);i++){const a=r[(i+r.length-1)%r.length],b=r[i],c=r[(i+1)%r.length],scale=Math.abs((b[0]-a[0])*(c[1]-a[1]))+Math.abs((b[1]-a[1])*(c[0]-a[0]));if(Math.abs(cross(a,b,c))<=Number.EPSILON*16*scale&&(b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1])<0)throw new Error("Geographic edges must not retrace themselves.");}
  for(let i=0;i<edges[k].length;i++)for(let j=i+1;j<edges[k].length;j++){if(j===i+1||!line&&i===0&&j===edges[k].length-1)continue;if(intersects(edges[k][i][0],edges[k][i][1],edges[k][j][0],edges[k][j][1]))throw new Error("Geographic edges must not cross or touch themselves.");}
  for(let j=0;j<k;j++)for(const [a,b] of edges[k])for(const [c,d] of edges[j])if(intersects(a,b,c,d)){
   if(owners[k].component===owners[j].component||owners[k].ring>0||owners[j].ring>0||cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0||sharedEdge(a,b,c,d))throw new Error("Geographic rings must not cross or touch; separate components may meet only at isolated exterior points, without shared edges or overlapping land.");
   contacts.add(`${owners[j].component}:${owners[k].component}`);
  }
 }
 for(const pair of contacts){const [i,j]=pair.split(":").map(Number);if(boundaryEnters(components[i][0],components[j])||boundaryEnters(components[j][0],components[i]))throw new Error("Contacting geographic components must not overlap or cross through their vertices.");}
 if(reference.kind==="sphere"){
  const transformed=structuredClone(geometry);if(transformed.type==="LineString")transformed.coordinates=transformed.coordinates.map(project);else if(transformed.type==="Polygon")transformed.coordinates=transformed.coordinates.map(r=>r.map(project));else if(transformed.type==="MultiPolygon")transformed.coordinates=transformed.coordinates.map(p=>p.map(r=>r.map(project)));
  const flat=rings.flat(),xs=flat.map(p=>p[0]),ys=flat.map(p=>p[1]),pad=Math.max(1,...xs.map(Math.abs),...ys.map(Math.abs))*1e-6;
  validateSourceGeometry(transformed,{version:1,kind:"plane",crs:"VALIDATION:common-hemisphere",units:"projection units",bounds:[Math.min(...xs)-pad,Math.min(...ys)-pad,Math.max(...xs)+pad,Math.max(...ys)+pad]});
 }
}
