import {MAP_WIDTH,MAP_HEIGHT,type MapDraft,type Point} from "./atlas";
import {surfaceBounds,wrapLongitude,type Coordinate,type GeographicBounds,type SpatialReference} from "./geographic";
import {geographicProjection,type ProjectionKind} from "./geographic-projection";

/** Version 1 display adapter. Stored Atlas positions and geographic originals never change. */
export function atlasGeographicFrame(reference:SpatialReference,bounds:GeographicBounds,kind:ProjectionKind){
 const domain=surfaceBounds(reference),projection=geographicProjection(reference,bounds,kind);
 projection.scale(projection.scale()*2).translate(projection.translate().map(n=>n*2) as Coordinate).clipExtent([[0,0],[MAP_WIDTH,MAP_HEIGHT]]);
 // Existing authored planar imports use Atlas x/y directly. Keep their original
 // canvas orientation; the shared north-up source scene is mirrored separately.
 if(reference.kind==="plane"){const [x,y]=projection.translate();projection.reflectY(false).translate([x,MAP_HEIGHT-y]);}
 const source=(p:Point):Coordinate=>[domain[0]+p.x/MAP_WIDTH*(domain[2]-domain[0]),reference.kind==="plane"?domain[1]+p.y/MAP_HEIGHT*(domain[3]-domain[1]):domain[3]-p.y/MAP_HEIGHT*(domain[3]-domain[1])];
 const atlas=([x,y]:Coordinate):Point=>({x:(x-domain[0])/(domain[2]-domain[0])*MAP_WIDTH,y:(reference.kind==="plane"?y-domain[1]:domain[3]-y)/(domain[3]-domain[1])*MAP_HEIGHT});
 const project=(p:Point):Point=>{const v=projection(source(p));return v&&v.every(Number.isFinite)?{x:v[0],y:v[1]}:{x:-1e7,y:-1e7};};
 function invert(p:Point):Point|null{
  const v=projection.invert?.([p.x,p.y]);if(!v||!v.every(Number.isFinite)||v[0]<domain[0]-1e-8||v[0]>domain[2]+1e-8||v[1]<domain[1]-1e-8||v[1]>domain[3]+1e-8)return null;
  const a=atlas(v),back=project(a);return Math.hypot(back.x-p.x,back.y-p.y)<.01?a:null;
 }
 // Atlas artwork is a planar drawing, even on a sphere. Keep its original
 // interior and curves, including areas wider than a hemisphere. Only derived
 // display paths repeat across the longitude seam; source points never wrap.
 function continuous(p:Point):Point{const [x,y]=source(p),v=projection([x,reference.kind==="sphere"?Math.max(-89.99999999,Math.min(89.99999999,y)):y]);if(!v)return {x:-1e7,y:-1e7};const span=bounds[0]>bounds[2]?360-bounds[0]+bounds[2]:bounds[2]-bounds[0],center=wrapLongitude(bounds[0]+span/2);return {x:reference.kind==="sphere"?MAP_WIDTH/2+(x-center)*Math.PI/180*projection.scale():v[0],y:v[1]};}
 function scaleAt(p:Point){const a=continuous(p),b=continuous({x:p.x+.01,y:p.y}),c=continuous({x:p.x,y:p.y+.01});return Math.max(.001,Math.min(10000,Math.sqrt(Math.hypot(b.x-a.x,b.y-a.y)*Math.hypot(c.x-a.x,c.y-a.y))/.01));}
 function path(points:Point[],closed=false,curve=0){
  if(points.length<2)return "";
  const sampled:Point[]=[];
  for(let i=0;i<points.length-(closed?0:1);i++){
   const a=points[i],b=points[(i+1)%points.length],before=points[Math.max(0,i-1)],after=points[Math.min(points.length-1,i+2)];
   const steps=curve?16:kind==="mercator"?Math.min(16,Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/25))):1;
   for(let j=0;j<steps;j++){const t=j/steps,u=1-t;sampled.push(curve?{x:u*u*u*a.x+3*u*u*t*(a.x+(b.x-before.x)*curve/6)+3*u*t*t*(b.x-(after.x-a.x)*curve/6)+t*t*t*b.x,y:u*u*u*a.y+3*u*u*t*(a.y+(b.y-before.y)*curve/6)+3*u*t*t*(b.y-(after.y-a.y)*curve/6)+t*t*t*b.y}:{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}
  }
  sampled.push(closed?points[0]:points.at(-1)!);
  return (reference.kind==="sphere"?[-1,0,1]:[0]).map(shift=>sampled.map((p,i)=>{const v=continuous({x:p.x+shift*MAP_WIDTH,y:p.y});return `${i?"L":"M"}${v.x.toFixed(3)},${v.y.toFixed(3)}`;}).join("")+(closed?"Z":"")).join("");
 }
 return {reference,bounds,kind,source,atlas,project,invert,scaleAt,path};
}
export type AtlasGeographicFrame=ReturnType<typeof atlasGeographicFrame>;

export function projectionExtent(bounds:GeographicBounds,kind:ProjectionKind):GeographicBounds{
 if(kind!=="mercator")return bounds;
 const limit=85.05112878,height=Math.min(2*limit,bounds[3]-bounds[1]);let south=Math.max(-limit,bounds[1]),north=Math.min(limit,bounds[3]);
 if(south>=north){if(bounds[1]>=limit){north=limit;south=limit-height;}else {south=-limit;north=-limit+height;}}
 return [bounds[0],south,bounds[2],north];
}

/** Only an ephemeral render draft; never validate/save this as authoring data. */
export function projectedAtlasDraft(draft:MapDraft,frame:AtlasGeographicFrame):MapDraft{
 const point=<T extends Point>(p:T):T=>({...p,...frame.project(p)});
 return {...draft,features:draft.features.map(f=>({...f,geometry:f.geometry.type==="point"?{...f.geometry,point:point(f.geometry.point)}:{...f.geometry,points:f.geometry.points.map(point)}})),drawings:draft.drawings?.map(d=>{
  const anchor=d.type==="path"||d.type==="terrain"?d.points[0]:d.point,scale=frame.scaleAt(anchor);
  return d.type==="terrain"?{...d,points:d.points.map(point),radius:d.radius*scale,spacing:d.spacing*scale}:d.type==="path"?{...d,points:d.points.map(point)}:{...d,point:point(d.point)};
 })};
}

export function moveGeographicExtent(reference:SpatialReference,b:GeographicBounds,dx=0,dy=0,factor=1):GeographicBounds{
 const domain=surfaceBounds(reference),span=b[0]>b[2]?360-b[0]+b[2]:b[2]-b[0],minimum=(domain[2]-domain[0])/1_000_000,w=Math.max(minimum,Math.min(domain[2]-domain[0],span*factor)),h=Math.max((domain[3]-domain[1])/1_000_000,Math.min(domain[3]-domain[1],(b[3]-b[1])*factor));
 let x=b[0]+span/2+dx*span;const y=Math.max(domain[1]+h/2,Math.min(domain[3]-h/2,(b[1]+b[3])/2+dy*(b[3]-b[1])));
 if(reference.kind==="sphere"&&w<360)return [wrapLongitude(x-w/2),y-h/2,wrapLongitude(x+w/2),y+h/2];
 x=Math.max(domain[0]+w/2,Math.min(domain[2]-w/2,x));return [x-w/2,y-h/2,x+w/2,y+h/2];
}
