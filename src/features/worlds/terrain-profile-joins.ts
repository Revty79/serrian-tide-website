import type {TerrainGeometry} from "./terrain";

/** Project a one-way profile back toward its accepted heights until every
 * native neighbour retains its old step or a step of at most 45 degrees.
 * A maximum-first envelope gives the unique least withheld cut (and, with
 * sign -1, raise). Only admitted samples move; fixed supports never do.
 * Two Int32 buffers use eight reserved bytes per selected cell. Each node
 * enters/leaves the heap once; 26 sample steps per cell cover initialization,
 * eight fixed-support reads, settlement, eight relaxations and eight audits.
 * Heap comparisons are bounded O(log(cells)); existing timer/cancel yields apply.
 */
export function* preserveProfileJoins(
  base:Int16Array,grid:Int16Array,shape:TerrainGeometry,indices:Uint32Array,
  weights:Float32Array,eligibleIndex:(index:number)=>number,
  candidate:(local:number)=>number,sign:1|-1,sx:number,sy:number,
  checkpoint:()=>boolean,
):Generator<void,{adjusted:number;maximumWithheldM:number},void>{
  const cells=indices.length,heap=new Int32Array(cells),positions=new Int32Array(cells).fill(-1);
  let size=0;
  const height=(k:number)=>sign*grid[indices[k]];
  const greater=(a:number,b:number)=>height(a)>height(b)||height(a)===height(b)&&indices[a]<indices[b];
  const swap=(a:number,b:number)=>{const value=heap[a];heap[a]=heap[b];heap[b]=value;positions[heap[a]]=a;positions[heap[b]]=b;};
  const up=(start:number)=>{let at=start;while(at>0){const parent=(at-1)>>>1;if(!greater(heap[at],heap[parent]))break;swap(at,parent);at=parent;}};
  const push=(k:number)=>{positions[k]=size;heap[size]=k;up(size++);};
  const pop=()=>{const k=heap[0];positions[k]=-2;size--;if(size){heap[0]=heap[size];positions[heap[0]]=0;let at=0;for(;;){const left=at*2+1;if(left>=size)break;const right=left+1,best=right<size&&greater(heap[right],heap[left])?right:left;if(!greater(heap[best],heap[at]))break;swap(at,best);at=best;}}return k;};
  const neighbours:Array<{east:number;south:number;step:number}>=[];
  for(let south=-1;south<=1;south++)for(let east=-1;east<=1;east++)if(east||south)neighbours.push({east,south,step:Math.floor(Math.hypot(east*sx,south*sy))});
  const neighbour=(i:number,q:typeof neighbours[number])=>{
    let x=i%shape.width+q.east;const y=Math.floor(i/shape.width)+q.south;
    if(y<0||y>=shape.height||!shape.wrap&&(x<0||x>=shape.width))return -1;
    x=(x+shape.width)%shape.width;return y*shape.width+x;
  };
  // Fixed supports seed the envelope before active nodes are settled.
  for(let k=0;k<cells;k++){
    if(checkpoint())yield;
    if(!weights[k])continue;
    const i=indices[k];let value=sign*candidate(k);
    if(value>sign*base[i])throw Error("Gradual profile joins require a one-way elevation bound.");
    for(const q of neighbours){
      if(checkpoint())yield;
      const j=neighbour(i,q);if(j<0)continue;
      const other=eligibleIndex(j);
      if(other<0||!weights[other])value=Math.max(value,sign*base[j]-Math.max(Math.abs(base[i]-base[j]),q.step));
    }
    if(value>sign*base[i])throw Error("A fixed profile support conflicts with the accepted terrain.");
    grid[i]=sign*value;push(k);
  }
  while(size){
    if(checkpoint())yield;
    const k=pop(),i=indices[k],value=height(k);
    for(const q of neighbours){
      if(checkpoint())yield;
      const j=neighbour(i,q);if(j<0)continue;
      const other=eligibleIndex(j);if(other<0||!weights[other])continue;
      const floor=value-Math.max(Math.abs(base[i]-base[j]),q.step);
      if(floor<=height(other))continue;
      if(positions[other]<0||floor>sign*base[j])throw Error("The gradual profile join could not be completed safely.");
      grid[j]=sign*floor;up(positions[other]);
    }
  }
  let adjusted=0,maximumWithheldM=0;
  for(let k=0;k<cells;k++){
    if(!weights[k])continue;
    const i=indices[k],withheld=Math.abs(grid[i]-candidate(k));
    if(withheld){adjusted++;maximumWithheldM=Math.max(maximumWithheldM,withheld);}
    for(const q of neighbours){
      if(checkpoint())yield;
      const j=neighbour(i,q);if(j<0)continue;
      if(Math.abs(grid[i]-grid[j])>Math.max(Math.abs(base[i]-base[j]),q.step))
        throw Error("The gradual profile join did not retain every neighbouring support.");
    }
  }
  return {adjusted,maximumWithheldM};
}
