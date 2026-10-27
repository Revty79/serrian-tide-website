import type {HydroPoint} from "./terrain-hydrology";
import type {HydroMesh} from "./terrain-hydrology-mesh";
import {insideWaterRings,waterBounds,waterDx,waterPoint,waterRingArea} from "./terrain-water-geometry";

export const WATER_CONTOUR_MAX_BYTES=513*513*13;
let scratchValues=new Float64Array(0),scratchSeen=new Uint8Array(0),scratchQueue=new Int32Array(0);

/** Marching-square intersections share lattice-edge identities, including at
 * ambiguous saddle cells. The mesh's accepted numerical sampling sets detail. */
export function waterContours(mesh:HydroMesh,ids:number[],level:number|null,seed:HydroPoint){
  if(!ids.length)throw Error("No contributing coverage was found.");
  const points=ids.map(id=>mesh.point(id)),spacing=Math.min(...mesh.patches.map(p=>Math.min(p.source.frame.width/p.width,p.source.frame.height/p.height))),coverageMargin=ids.reduce((m,id)=>Math.max(m,mesh.bounds[id*4+2]-mesh.bounds[id*4],mesh.bounds[id*4+3]-mesh.bounds[id*4+1]),spacing)*2,rawFrame=waterBounds(points,mesh.world,coverageMargin+spacing*3),canonicalCut=level===null&&mesh.world.wrap&&rawFrame.width>=mesh.world.width*.999999,frame=canonicalCut?{...rawFrame,x:0,width:mesh.world.width}:rawFrame;
  if(!canonicalCut&&frame.width>mesh.world.width*.999999&&mesh.world.wrap)throw Error("This drainage wraps around the entire World. Choose a smaller tributary catchment.");
  const nx=Math.min(512,Math.max(8,Math.ceil(frame.width/spacing))),ny=Math.min(512,Math.max(8,Math.ceil(frame.height/spacing))),w=nx+1,length=w*(ny+1),mask=new Set(ids),at=(x:number,y:number,geometry=false)=>{const p={x:frame.x+x*frame.width/nx,y:Math.min(mesh.world.height-1e-6,frame.y+y*frame.height/ny)};return geometry&&canonicalCut?p:waterPoint(p,mesh.world);};
  if(scratchValues.length<length){scratchValues=new Float64Array(length);scratchSeen=new Uint8Array(length);scratchQueue=new Int32Array(length);}const values=scratchValues.subarray(0,length);
  for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++){const p=at(x,y),id=mesh.locate(p);values[y*w+x]=level===null?mask.has(id)?-1:1:mesh.sampleAt(p)-level;}
  if(level!==null){
    const sx=Math.max(0,Math.min(nx,Math.round(waterDx(frame.x,seed.x,mesh.world)/frame.width*nx))),sy=Math.max(0,Math.min(ny,Math.round((seed.y-frame.y)/frame.height*ny))),seen=scratchSeen.subarray(0,length).fill(0),queue=scratchQueue.subarray(0,length);let head=0,tail=0,start=sy*w+sx;
    if(values[start]>=0){let best=Infinity;for(let i=0;i<values.length;i++)if(values[i]<0){const d=(i%w-sx)**2+(Math.floor(i/w)-sy)**2;if(d<best){best=d;start=i;}}if(!Number.isFinite(best))throw Error("This water level does not cover a resolved basin. Choose a higher level or draw its shoreline.");}
    queue[tail++]=start;seen[start]=1;while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);for(const j of [x?i-1:-1,x<nx?i+1:-1,y?i-w:-1,y<ny?i+w:-1])if(j>=0&&!seen[j]&&values[j]<0){seen[j]=1;queue[tail++]=j;}}
    for(let i=0;i<values.length;i++)if(!seen[i]&&values[i]<0)values[i]=Math.max(1,.001);
    for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++)if((x===0||y===0||x===nx||y===ny)&&values[y*w+x]<0)throw Error("The proposed water reaches the analysis boundary. Keep this draft and review a broader geography.");
  }else{
    // Watersheds touching a fixed edge use a half-cell contour margin within
    // the World. The area remains the exact sum of contributing mesh cells.
    for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++)if(x===0||y===0||x===nx||y===ny)values[y*w+x]=1;
  }
  const vertices=new Map<string,HydroPoint>(),adjacent=new Map<string,string[]>();
  const vertex=(x:number,y:number,edge:number)=>{
    const a=edge===0?[x,y]:edge===1?[x+1,y]:edge===2?[x,y+1]:[x,y],b=edge===0?[x+1,y]:edge===1?[x+1,y+1]:edge===2?[x+1,y+1]:[x,y+1],key=edge===0?`h:${x}:${y}`:edge===1?`v:${x+1}:${y}`:edge===2?`h:${x}:${y+1}`:`v:${x}:${y}`;
    if(!vertices.has(key)){const va=values[a[1]*w+a[0]],vb=values[b[1]*w+b[0]],t=Math.max(0,Math.min(1,va/(va-vb||1)));const p=at(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,true);if(canonicalCut){if(a[0]===0&&b[0]===1)p.x=0;if(a[0]===nx-1&&b[0]===nx)p.x=mesh.world.width;if(a[1]===0&&b[1]===1&&frame.y===0)p.y=0;}vertices.set(key,p);}return key;
  };
  const join=(a:string,b:string)=>{adjacent.set(a,[...(adjacent.get(a)??[]),b]);adjacent.set(b,[...(adjacent.get(b)??[]),a]);};
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
    const v=[values[y*w+x],values[y*w+x+1],values[(y+1)*w+x+1],values[(y+1)*w+x]],edges:number[]=[];for(let e=0;e<4;e++)if((v[e]<0)!==(v[(e+1)%4]<0))edges.push(e);
    if(edges.length===2)join(vertex(x,y,edges[0]),vertex(x,y,edges[1]));
    else if(edges.length===4){const center=v.reduce((a,b)=>a+b,0)/4,pairs=(v[0]<0)===(center<0)?[[0,1],[2,3]]:[[0,3],[1,2]];for(const [a,b] of pairs)join(vertex(x,y,a),vertex(x,y,b));}
  }
  const used=new Set<string>(),rings:HydroPoint[][]=[];
  for(const key of adjacent.keys())if(!used.has(key)){const ring:HydroPoint[]=[];let current=key,previous="";while(!used.has(current)){used.add(current);ring.push(vertices.get(current)!);const choices=adjacent.get(current)!;if(choices.length!==2)throw Error("A shoreline is unresolved at this numerical boundary; try another water level.");const next=choices[0]===previous?choices[1]:choices[0];previous=current;current=next;}if(current!==key)throw Error("A shoreline could not be closed without discarding coverage.");if(ring.length>=3)rings.push(ring);}
  if(!rings.length)throw Error("No closed shoreline is resolved at this level.");
  const sorted=rings.sort((a,b)=>waterRingArea(b,canonicalCut?{...mesh.world,wrap:false}:mesh.world)-waterRingArea(a,canonicalCut?{...mesh.world,wrap:false}:mesh.world)),chosen=level===null?sorted:sorted.filter((r,i)=>i===0||insideWaterRings(r[0],[sorted[0]],mesh.world));
  if(chosen.reduce((n,r)=>n+r.length,0)>8192)throw Error("This boundary exceeds the 8,192-point contour budget. Review a smaller basin.");
  return {rings:chosen,...canonicalCut?{frameMode:"canonical-cut" as const}:{},samplingM:Math.max(frame.width/nx,frame.height/ny),cells:ids.length};
}
