import {z} from "zod";
import {geoInterpolate} from "d3-geo";
import {geoId,sourceGeometrySchema,spatialReferenceSchema,type SourceGeometry,type SpatialReference,type Coordinate} from "./geographic";
import {validateSourceGeometry} from "./geographic-geometry";

const name=z.string().trim().min(1).max(160),account=z.string().trim().min(1).max(4000);
const base={mapId:geoId,timelineId:geoId,requestId:geoId};
export const geographicAuthoringCommand=z.discriminatedUnion("action",[
 z.object({...base,action:z.literal("setup"),name,reference:spatialReferenceSchema,realmId:geoId.nullable(),protected:z.boolean()}).strict(),
 z.object({...base,action:z.literal("attach"),surfaceId:geoId}).strict(),
 z.object({...base,action:z.literal("create"),name,kind:z.enum(["island","landmass","river"]),geometry:sourceGeometrySchema,note:account,parentId:geoId.nullable(),protected:z.boolean()}).strict(),
 z.object({...base,action:z.literal("revise"),featureId:geoId,revision:z.number().int().positive(),geometry:sourceGeometrySchema,note:account,acknowledgeImported:z.boolean()}).strict(),
]);
export type GeographicAuthoringCommand=z.infer<typeof geographicAuthoringCommand>;
export type SimpleDraft={points:Coordinate[];kind:"island"|"landmass"|"river";complete:boolean};
export function simpleDraft(geometry:SourceGeometry):SimpleDraft{
 if(geometry.type==="LineString")return {kind:"river",complete:true,points:structuredClone(geometry.coordinates)};
 if(geometry.type==="Polygon"&&geometry.coordinates.length===1){const ring=geometry.coordinates[0];if(JSON.stringify(ring[0])!==JSON.stringify(ring.at(-1)))throw new Error("Close the polygon with its original first coordinate.");return {kind:"island",complete:true,points:structuredClone(ring.slice(0,-1))};}
 throw new Error("This core editor supports single-ring polygons and open lines. Points, holes and multipart sources remain retained and read-only here.");
}
export function simpleGeometry(draft:SimpleDraft):SourceGeometry{
 if(!draft.complete)throw new Error("Complete the geographic outline before saving.");
 const points=structuredClone(draft.points);if(points.length<(draft.kind==="river"?2:3))throw new Error(draft.kind==="river"?"Add at least two vertices to the geographic line.":"Add at least three vertices to the geographic polygon.");
 if(draft.kind==="river")return sourceGeometrySchema.parse({type:"LineString",coordinates:points});
 const origin=points[0],area=points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+(p[0]-origin[0])*(q[1]-origin[1])-(q[0]-origin[0])*(p[1]-origin[1]);},0);if(area<0)points.reverse();
 return sourceGeometrySchema.parse({type:"Polygon",coordinates:[[...points,points[0]]]});
}
export function validateVisualGeometry(geometry:SourceGeometry,reference:SpatialReference){
 const draft=simpleDraft(geometry),points=draft.points;if(points.length>256)throw new Error("This visual increment supports at most 256 original vertices. Larger sources remain read-only.");
 if(new Set(points.map(p=>JSON.stringify(p))).size!==points.length)throw new Error("Use distinct vertices; repeated points can create a self-intersection.");
 if(reference.kind==="sphere"){
  if(points.some(p=>Math.abs(p[1])>85)||Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0]))>=180)throw new Error("Basic spherical editing needs a local shape within one longitude band and between 85° south and north. Polar and antimeridian geometry remains read-only; no components are discarded.");
 }
 // Great-circle arcs become straight segments in this common open hemisphere.
 // Testing raw longitude/latitude segments can miss a spherical crossing.
 const center=(Math.min(...points.map(p=>p[0]))+Math.max(...points.map(p=>p[0])))/2;
 const topology=reference.kind==="sphere"?points.map(([lon,lat])=>{const delta=(lon-center)*Math.PI/180;return [Math.tan(delta),Math.tan(lat*Math.PI/180)/Math.cos(delta)] as Coordinate;}):points;
 const edges=topology.slice(0,draft.kind==="river"?-1:undefined).map((p,i)=>[p,topology[(i+1)%topology.length]]);
 const cross=(a:Coordinate,b:Coordinate,p:Coordinate)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
 for(let i=draft.kind==="river"?1:0;i<(draft.kind==="river"?topology.length-1:topology.length);i++){const a=topology[(i+topology.length-1)%topology.length],b=topology[i],c=topology[(i+1)%topology.length],scale=Math.abs((b[0]-a[0])*(c[1]-a[1]))+Math.abs((b[1]-a[1])*(c[0]-a[0]));if(Math.abs(cross(a,b,c))<=Number.EPSILON*16*scale&&(b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1])<0)throw new Error("Geographic edges must not retrace themselves.");}
 const touches=(a:Coordinate,b:Coordinate,p:Coordinate)=>cross(a,b,p)===0&&p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])&&p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1]);
 for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++){if(j===i+1||draft.kind!=="river"&&i===0&&j===edges.length-1)continue;const [a,b]=edges[i],[c,d]=edges[j];if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0||touches(a,b,c)||touches(a,b,d)||touches(c,d,a)||touches(c,d,b))throw new Error("Geographic edges must not cross or touch themselves.");}
 validateSourceGeometry(geometry,reference);
}
export function visualGeometryIssue(geometry:SourceGeometry,reference:SpatialReference){try{validateVisualGeometry(geometry,reference);return "";}catch(error){return (error as Error).message;}}
export function insertVisualVertex(draft:SimpleDraft,index:number,reference:SpatialReference){
 const next=index+1;if(draft.kind==="river"&&next>=draft.points.length)throw new Error("Choose a vertex before the end of the line to insert a point between its vertices.");
 if(draft.points.length>=256)throw new Error("This draft has reached its 256-vertex limit.");
 const a=draft.points[index],b=draft.points[next%draft.points.length],point=reference.kind==="sphere"?geoInterpolate(a,b)(.5) as Coordinate:[(a[0]+b[0])/2,(a[1]+b[1])/2] as Coordinate;
 return {...draft,points:[...draft.points.slice(0,next),point,...draft.points.slice(next)]};
}
