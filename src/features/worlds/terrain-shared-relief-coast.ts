import type {TerrainGeometry} from "./terrain";
import {frameLocalPoint,normalizeTerrainX,framesOverlap,REFINEMENT_COLLAR,type TerrainFrame} from "./terrain-refinement";
import {profileWindowFrame} from "./terrain-profile-window";
import type {SharedReliefPlan} from "./terrain-shared-relief";
import {ADVANCED_TERRAIN_LIMITS} from "./terrain-advanced-spec";

export type SharedCoastSource={id:string|null;revision:number;level:number;shape:TerrainGeometry;frame:TerrainFrame};
type Point={x:number;y:number};
/** The usual local eight-neighbour sea guard cannot see water outside a finer
 * source. Retain those supports and every lower lattice used by its visible
 * collar. The sampler is the original accepted, pinned World, never a proposal.
 * Work and cancellation are bounded independently of the numerical kernel. */
export async function sharedReliefCoastGuards(plans:SharedReliefPlan[],sources:SharedCoastSource[],world:TerrainGeometry,seaLevel:number,
 sample:(point:Point,source:SharedCoastSource,outside:boolean)=>Promise<number>,signal?:AbortSignal){
 if(signal?.aborted)throw new DOMException("Numerical preview canceled before acceptance.","AbortError");
 const masks=new Map(plans.map(p=>[p.source.id,new Uint8Array(p.window.width*p.window.height)])),byId=new Map(sources.map(s=>[s.id,s]));
 let visited=0,lastYield=performance.now();
 const check=async()=>{if(++visited>ADVANCED_TERRAIN_LIMITS.work)throw Error("Choose a smaller work area. Its original shoreline-support audit exceeds 8,388,608 steps.");if(signal?.aborted)throw new DOMException("Numerical preview canceled before acceptance.","AbortError");if(performance.now()-lastYield>4){await new Promise<void>(r=>setTimeout(r,0));lastYield=performance.now();}};
 const position=(s:SharedCoastSource,x:number,y:number):Point=>({x:world.wrap?normalizeTerrainX(s.frame.x+x/s.shape.width*s.frame.width,world.displayWidth):Math.max(0,Math.min(world.displayWidth,s.frame.x+x/s.shape.width*s.frame.width)),y:Math.max(0,Math.min(world.displayHeight,s.frame.y+y/s.shape.height*s.frame.height))});
 const local=(p:SharedReliefPlan,point:Point)=>{const a=frameLocalPoint(point,p.source.frame,world.displayWidth,world.wrap);return {x:a.x/p.source.frame.width*p.source.shape.width,y:a.y/p.source.frame.height*p.source.shape.height};};
 const relevant=(p:SharedReliefPlan,point:Point)=>{const a=local(p,point),w=p.window;return a.x>=w.x-2&&a.x<=w.x+w.width+2&&a.y>=w.y-2&&a.y<=w.y+w.height+2;};
 const protect=(p:SharedReliefPlan,point:Point)=>{
  if(!relevant(p,point))return;
  const a=local(p,point),w=p.window,mask=masks.get(p.source.id)!;
  for(let ey=0;ey<=1;ey++)for(let ex=0;ex<=1;ex++){
   let x=Math.floor(a.x)+ex;const y=Math.floor(a.y)+ey;
   if(p.source.shape.wrap)x=(x%p.source.shape.width+p.source.shape.width)%p.source.shape.width;
   else x=Math.max(0,Math.min(p.source.shape.width-1,x));
   const yy=Math.max(0,Math.min(p.source.shape.height-1,y));
   if(x>=w.x&&x<w.x+w.width&&yy>=w.y&&yy<w.y+w.height)mask[(yy-w.y)*w.width+x-w.x]=1;
  }
 };
 // Once every possible support from this fine sea node is protected, its
 // read-only height cannot add any mask bit. Keep counting/yielding the audit,
 // but avoid repeating fine tile reads for already complete coarser supports.
 const missingProtection=(p:SharedReliefPlan,point:Point)=>{
  if(!relevant(p,point))return false;
  const a=local(p,point),w=p.window,mask=masks.get(p.source.id)!;
  for(let ey=0;ey<=1;ey++)for(let ex=0;ex<=1;ex++){
   let x=Math.floor(a.x)+ex;const y=Math.floor(a.y)+ey;
   if(p.source.shape.wrap)x=(x%p.source.shape.width+p.source.shape.width)%p.source.shape.width;
   else x=Math.max(0,Math.min(p.source.shape.width-1,x));
   const yy=Math.max(0,Math.min(p.source.shape.height-1,y));
   if(x>=w.x&&x<w.x+w.width&&yy>=w.y&&yy<w.y+w.height&&!mask[(yy-w.y)*w.width+x-w.x])return true;
  }
  return false;
 };
 for(const s of sources){
  if(signal?.aborted)throw new DOMException("Numerical preview canceled before acceptance.","AbortError");
  if(s.id===null)continue;
  const width=s.shape.width,height=s.shape.height,c=REFINEMENT_COLLAR,sx=s.frame.width/width,sy=s.frame.height/height,f=s.frame,
   edges=[{x:f.x-2*sx,y:f.y-2*sy,width:(c+4)*sx,height:f.height+4*sy},{x:f.x+f.width-(c+2)*sx,y:f.y-2*sy,width:(c+4)*sx,height:f.height+4*sy},
    {x:f.x-2*sx,y:f.y-2*sy,width:f.width+4*sx,height:(c+4)*sy},{x:f.x-2*sx,y:f.y+f.height-(c+2)*sy,width:f.width+4*sx,height:(c+4)*sy}],
   targets=plans.filter(p=>byId.get(p.source.id)!.level<=s.level&&edges.some(edge=>framesOverlap(edge,profileWindowFrame(p.window),world.displayWidth,world.wrap,2*Math.max(p.source.frame.width/p.source.shape.width,p.source.frame.height/p.source.shape.height))));
  if(!targets.length)continue;
  // A fine interior completely hides its parent. Only the original perimeter,
  // including one outside ring, can contribute through presentation/fallback.
  for(let y=-1;y<=height;y++){
   if(signal?.aborted)throw new DOMException("Numerical preview canceled before acceptance.","AbortError");
   if(performance.now()-lastYield>4){await new Promise<void>(r=>setTimeout(r,0));lastYield=performance.now();}
   const all=y<c||y>=height-c;
   const spans=all?[[-1,width]]:[[-1,c-1],[width-c,width]];
   for(const [left,right] of spans)for(let x=left;x<=right;x++){
    const point=position(s,x,y);if(!targets.some(p=>relevant(p,point)))continue;
    await check();
    let needed=false;
    for(let ey=-1;ey<=1&&!needed;ey++)for(let ex=-1;ex<=1&&!needed;ex++){
     const support=position(s,x+ex,y+ey);needed=targets.some(p=>missingProtection(p,support));
    }
    if(!needed)continue;
    const outside=x<0||x>=width||y<0||y>=height;
    if(await sample(point,s,outside)>seaLevel)continue;
    for(let ey=-1;ey<=1;ey++)for(let ex=-1;ex<=1;ex++){
     const support=position(s,x+ex,y+ey);
     for(const p of targets)protect(p,support);
    }
   }
  }
 }
 return {masks,visited};
}
