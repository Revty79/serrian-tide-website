import {HYDROLOGY_LIMITS,type HydroGeometry,type HydroPoint,type HydroSource} from "./terrain-hydrology";
import type {TerrainFrame} from "./terrain-refinement";

export type HydroPatch={source:HydroSource;lod:number;width:number;height:number;grid:Int16Array};
type Rect={x0:number;y0:number;x1:number;y1:number};
type Patch=HydroPatch&{cells:Int32Array;parts:Map<number,number[]>;children:number[];parent:number};
const mod=(x:number,w:number)=>((x%w)+w)%w;
const contains=(r:Rect,x:number,y:number)=>x>=r.x0&&x<r.x1&&y>=r.y0&&y<r.y1;

function canonical(frame:TerrainFrame,world:HydroGeometry):Rect[]{
  const x=world.wrap?mod(frame.x,world.width):frame.x,end=x+frame.width;
  return end>world.width+1e-7?[{x0:x,x1:world.width,y0:frame.y,y1:frame.y+frame.height},{x0:0,x1:end-world.width,y0:frame.y,y1:frame.y+frame.height}]:[{x0:x,x1:Math.min(end,world.width),y0:frame.y,y1:frame.y+frame.height}];
}
function subtract(rect:Rect,cut:Rect){
  const x0=Math.max(rect.x0,cut.x0),x1=Math.min(rect.x1,cut.x1),y0=Math.max(rect.y0,cut.y0),y1=Math.min(rect.y1,cut.y1);
  if(x0>=x1||y0>=y1)return [rect];
  return [{x0:rect.x0,x1:x0,y0:rect.y0,y1:rect.y1},{x0:x1,x1:rect.x1,y0:rect.y0,y1:rect.y1},{x0,x1,y0:rect.y0,y1:y0},{x0,x1,y0:y1,y1:rect.y1}].filter(r=>r.x1-r.x0>1e-8&&r.y1-r.y0>1e-8);
}
function sourceLocal(point:HydroPoint,source:HydroSource,world:HydroGeometry){return {x:world.wrap?mod(point.x-source.frame.x,world.width):point.x-source.frame.x,y:point.y-source.frame.y};}
function inSource(point:HydroPoint,source:HydroSource,world:HydroGeometry){const p=sourceLocal(point,source,world);return p.x>=0&&p.x<source.frame.width&&p.y>=0&&p.y<source.frame.height;}
function sample(patch:Patch,point:HydroPoint,world:HydroGeometry){
  const p=sourceLocal(point,patch.source,world),gx=Math.max(0,Math.min(patch.width-1,p.x/patch.source.frame.width*patch.width)),gy=Math.max(0,Math.min(patch.height-1,p.y/patch.source.frame.height*patch.height)),x=Math.floor(gx),y=Math.floor(gy),fx=gx-x,fy=gy-y;
  const at=(xx:number,yy:number)=>patch.grid[Math.min(patch.height-1,yy)*patch.width+(patch.source.level===0&&world.wrap?xx%patch.width:Math.min(patch.width-1,xx))];
  // Root wrapping interpolates through the real next longitudinal sample.
  const ux=p.x/patch.source.frame.width*patch.width,wrapFraction=patch.source.level===0&&world.wrap?ux-Math.floor(ux):fx;
  return (at(x,y)*(1-wrapFraction)+at(x+1,y)*wrapFraction)*(1-fy)+(at(x,y+1)*(1-wrapFraction)+at(x+1,y+1)*wrapFraction)*fy;
}

/** Non-overlapping rectangles preserve contributing area at arbitrary child
 * boundaries. Bidirectional interface adjacency keeps fine/coarse water connected. */
export class HydroMesh{
  bounds:Float64Array;
  heights:Float64Array;
  sourceIds:Uint16Array;
  readonly offsets:Int32Array;
  readonly neighbors:Int32Array;
  readonly patches:Patch[];
  count=0;area=0;
  constructor(readonly world:HydroGeometry,input:HydroPatch[],progress:(stage:string,value:number)=>void=()=>{}){
    if(input.reduce((n,p)=>n+p.width*p.height,0)>HYDROLOGY_LIMITS.cells)throw Error("Drainage exceeds its analysis-cell budget.");
    const capacity=Math.min(HYDROLOGY_LIMITS.meshNodes,Math.max(1024,Math.ceil(input.reduce((n,p)=>n+p.width*p.height,0)*1.1+input.length*32)));
    this.bounds=new Float64Array(capacity*4);this.heights=new Float64Array(capacity);this.sourceIds=new Uint16Array(capacity);
    this.patches=[...input].sort((a,b)=>a.source.level-b.source.level||(a.source.id<b.source.id?-1:a.source.id>b.source.id?1:0)).map(p=>({...p,cells:new Int32Array(p.width*p.height).fill(-1),parts:new Map(),children:[],parent:-1}));
    if(!this.patches.length||this.patches[0].source.level!==0)throw Error("Drainage needs its accepted World base.");
    for(let i=1;i<this.patches.length;i++){const patch=this.patches[i];patch.parent=this.patches.findIndex(p=>p.source.id===(patch.source.parentId??this.patches[0].source.id));if(patch.parent<0)throw Error("A drainage refinement is missing its parent.");this.patches[patch.parent].children.push(i);}
    let completed=0;const total=input.reduce((n,p)=>n+p.width*p.height,0);
    for(let pi=0;pi<this.patches.length;pi++){
      const patch=this.patches[pi],frame=patch.source.frame,cuts=patch.children.flatMap(id=>canonical(this.patches[id].source.frame,world));
      // Bins are only an acceleration structure; exact rectangles decide overlap.
      const bins=new Map<number,Rect[]>(),bin=(v:number,extent:number)=>Math.max(0,Math.min(31,Math.floor(v/extent*32)));
      for(const cut of cuts)for(let y=bin(cut.y0,world.height);y<=bin(cut.y1,world.height);y++)for(let x=bin(cut.x0,world.width);x<=bin(cut.x1,world.width);x++){const key=y*32+x;bins.set(key,[...(bins.get(key)??[]),cut]);}
      for(let y=0;y<patch.height;y++)for(let x=0;x<patch.width;x++){
        const key=y*patch.width+x,cell={x:frame.x+x*frame.width/patch.width,y:frame.y+y*frame.height/patch.height,width:frame.width/patch.width,height:frame.height/patch.height};
        const parts=canonical(cell,world).flatMap(rect=>{
          const relevant=new Set<Rect>();for(let yy=bin(rect.y0,world.height);yy<=bin(rect.y1,world.height);yy++)for(let xx=bin(rect.x0,world.width);xx<=bin(rect.x1,world.width);xx++)for(const cut of bins.get(yy*32+xx)??[])relevant.add(cut);
          let pieces=[rect];for(const cut of relevant)pieces=pieces.flatMap(piece=>subtract(piece,cut));return pieces;
        });
        const ids:number[]=[];
        for(const r of parts){if(this.count>=HYDROLOGY_LIMITS.meshNodes)throw Error("Coverage interfaces exceed the bounded drainage mesh. Existing waterways are retained; this coverage needs broader analysis sampling.");this.reserve(this.count+1);const id=this.count++;this.bounds.set([r.x0,r.y0,r.x1,r.y1],id*4);this.sourceIds[id]=pi;this.heights[id]=sample(patch,{x:(r.x0+r.x1)/2,y:(r.y0+r.y1)/2},world);this.area+=(r.x1-r.x0)*(r.y1-r.y0);ids.push(id);}
        if(ids.length===1)patch.cells[key]=ids[0];else if(ids.length)patch.parts.set(key,ids);
        if(++completed%16384===0)progress("Preparing connected terrain",completed/total*.35);
      }
    }
    if(Math.abs(this.area-world.width*world.height)>world.width*world.height*1e-7)throw Error("Drainage coverage does not preserve the World's physical area.");
    const degrees=new Int32Array(this.count);
    this.forInterfaces((a,b)=>{degrees[a]++;degrees[b]++;},progress,.35,.2);
    this.offsets=new Int32Array(this.count+1);for(let i=0;i<this.count;i++)this.offsets[i+1]=this.offsets[i]+degrees[i];
    this.neighbors=new Int32Array(this.offsets[this.count]);degrees.set(this.offsets.subarray(0,this.count));
    this.forInterfaces((a,b)=>{this.neighbors[degrees[a]++]=b;this.neighbors[degrees[b]++]=a;},progress,.55,.2);
  }
  point(id:number):HydroPoint{const i=id*4;return {x:(this.bounds[i]+this.bounds[i+2])/2,y:(this.bounds[i+1]+this.bounds[i+3])/2};}
  private reserve(size:number){if(size<=this.heights.length)return;const capacity=Math.min(HYDROLOGY_LIMITS.meshNodes,Math.ceil(this.heights.length*1.5)),bounds=new Float64Array(capacity*4),heights=new Float64Array(capacity),sources=new Uint16Array(capacity);bounds.set(this.bounds);heights.set(this.heights);sources.set(this.sourceIds);this.bounds=bounds;this.heights=heights;this.sourceIds=sources;}
  cellArea(id:number){const i=id*4;return (this.bounds[i+2]-this.bounds[i])*(this.bounds[i+3]-this.bounds[i+1]);}
  boundary(id:number){const i=id*4;return this.bounds[i+1]<=1e-7||this.bounds[i+3]>=this.world.height-1e-7||!this.world.wrap&&(this.bounds[i]<=1e-7||this.bounds[i+2]>=this.world.width-1e-7);}
  locate(point:HydroPoint,start=0):number{
    if(this.world.wrap)point={...point,x:mod(point.x,this.world.width)};
    if(point.x<0||point.x>=this.world.width||point.y<0||point.y>=this.world.height)return -1;
    let patch=this.patches[start];while(patch.parent>=0&&!inSource(point,patch.source,this.world))patch=this.patches[patch.parent];
    while(true){const next=patch.children.find(id=>inSource(point,this.patches[id].source,this.world));if(next===undefined)break;patch=this.patches[next];}
    const p=sourceLocal(point,patch.source,this.world),x=Math.min(patch.width-1,Math.floor(p.x/patch.source.frame.width*patch.width)),y=Math.min(patch.height-1,Math.floor(p.y/patch.source.frame.height*patch.height)),key=y*patch.width+x,whole=patch.cells[key];
    if(whole>=0)return whole;
    return patch.parts.get(key)?.find(id=>{const i=id*4;return contains({x0:this.bounds[i],y0:this.bounds[i+1],x1:this.bounds[i+2],y1:this.bounds[i+3]},point.x,point.y);})??-1;
  }
  private forInterfaces(visit:(a:number,b:number)=>void,progress:(s:string,p:number)=>void,start:number,span:number){
    for(let id=0;id<this.count;id++){
      const i=id*4,x0=this.bounds[i],y0=this.bounds[i+1],x1=this.bounds[i+2],y1=this.bounds[i+3],x=(x0+x1)/2,y=(y0+y1)/2,e=Math.max(1e-6,Math.min(x1-x0,y1-y0)*1e-6),seen:number[]=[];
      for(const [xx,yy] of [[x0-e,y],[x1+e,y],[x,y0-e],[x,y1+e],[x0-e,y0-e],[x1+e,y0-e],[x0-e,y1+e],[x1+e,y1+e]]){const other=this.locate({x:xx,y:yy},this.sourceIds[id]);if(other>=0&&other!==id&&!seen.includes(other)){seen.push(other);visit(id,other);}}
      if(id%16384===0)progress("Joining terrain coverage",start+id/this.count*span);
    }
  }
  get bytes(){return this.bounds.byteLength+this.heights.byteLength+this.sourceIds.byteLength+this.offsets.byteLength+this.neighbors.byteLength+this.patches.reduce((n,p)=>n+p.grid.byteLength+p.cells.byteLength,0);}
}

export function averageHydroGrid(grid:Int16Array,width:number,height:number,lod:number){
  if(lod===0)return grid;const factor=2**lod,w=width/factor,h=height/factor,out=new Int16Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sum=0;for(let yy=0;yy<factor;yy++)for(let xx=0;xx<factor;xx++)sum+=grid[(y*factor+yy)*width+x*factor+xx];out[y*w+x]=Math.round(sum/(factor*factor));}
  return out;
}
