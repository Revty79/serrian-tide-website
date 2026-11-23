import type {TerrainGeometry,TerrainPatch} from "./terrain";
import type {TerrainRecovery} from "./terrain-recovery";

/** A same-baseline recovered draft is one ordinary native Undo step. An
 * already-accepted retry has no known prior grid and must not invent one. */
export function recoveredTerrainHistory(baseline:Int16Array,grid:Int16Array,shape:TerrainGeometry,beforeSea:number,recovery:TerrainRecovery,acceptedRevision:number,acceptedRequestId?:string){
 if(recovery.revision!==acceptedRevision||recovery.pending?.requestId===acceptedRequestId&&acceptedRequestId!==undefined)return;
 if(baseline.length!==shape.width*shape.height||grid.length!==baseline.length)throw Error("Complete matching terrain grids are required for recovered Undo.");
 let count=0;for(let i=0;i<grid.length;i++)if(grid[i]!==baseline[i])count++;
 if(!count&&beforeSea===recovery.seaLevel)return;
 const indices=new Uint32Array(count),before=new Int16Array(count),after=new Int16Array(count);let n=0;
 for(let i=0;i<grid.length;i++)if(grid[i]!==baseline[i]){indices[n]=i;before[n]=baseline[i];after[n++]=grid[i];}
 const patch:TerrainPatch|undefined=count?{indices,before,after}:undefined;
 return {patch,seaBefore:beforeSea,seaAfter:recovery.seaLevel};
}
