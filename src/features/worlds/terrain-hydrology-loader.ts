import {worldApi} from "./client-api";
import {createGrid,terrainGeometry,type TerrainDocument} from "./terrain";
import {hydrologyPlan,type HydroSources} from "./terrain-hydrology";
import type {HydroPatch} from "./terrain-hydrology-mesh";
import {TerrainDetailCache,type DetailBatch} from "./terrain-refinement-cache";
import type {RefinementIndex} from "./terrain-refinement-client";

export function hydrologyUrl(api:string,mapId:string,child="hydrology"){
  const [base,query]=api.split("?"),q=new URLSearchParams(query);q.set("terrainMap",mapId);return `${base}${child?"/"+child:""}?${q}`;
}

/** Loads only a bounded camera-independent analysis plan, through the existing
 * guarded immutable terrain APIs. These fresh buffers never alias editor grids. */
export async function loadHydrologyPatches(api:string,mapId:string,sources:HydroSources,signal:AbortSignal,progress:(value:number)=>void){
  const [root,index]=await Promise.all([worldApi<{document:TerrainDocument|null}>(hydrologyUrl(api,mapId,""),"GET",undefined,signal),worldApi<RefinementIndex>(hydrologyUrl(api,mapId,"refinements"),"GET",undefined,signal)]);
  if(!root.document||root.document.revision!==sources.rootRevision||index.rootRevision!==sources.rootRevision||index.seaLevel!==sources.seaLevel)throw Error("The accepted World changed while preparing drainage. Suggest rivers again; saved waterways are retained.");
  const shape=terrainGeometry(root.document.settings),plan=hydrologyPlan(sources),patches:HydroPatch[]=[];
  if(shape.displayWidth!==sources.world.width||shape.displayHeight!==sources.world.height||shape.wrap!==sources.world.wrap)throw Error("The drainage source does not match its World coordinates.");
  patches.push({...plan[0],grid:createGrid(root.document.baseElevation,root.document.tiles,shape)});
  let done=0,offset=0;const jobs=plan.slice(1),total=jobs.reduce((n,p)=>n+p.width*p.height/1024,0),cache=new TerrainDetailCache(async()=>{throw Error("Drainage uses explicitly pinned batches.");},1024);
  try{
    const load=async()=>{while(offset<jobs.length){const p=jobs[offset++],meta=index.refinements.find(m=>m.id===p.source.id);
      if(!meta||meta.revision!==p.source.revision||meta.gridWidth!==p.source.gridWidth||meta.gridHeight!==p.source.gridHeight||JSON.stringify(meta.frame)!==JSON.stringify(p.source.frame))throw Error("Accepted numerical coverage changed. Refresh drainage before accepting new rivers.");
      const grid=new Int16Array(p.width*p.height);
      for(let key=0;key<grid.length/1024;key+=64){if(signal.aborted)throw new DOMException("Drainage loading cancelled.","AbortError");const keys=Array.from({length:Math.min(64,grid.length/1024-key)},(_,i)=>key+i),q=new URLSearchParams(hydrologyUrl(api,mapId,"refinements").split("?")[1]);q.set("refinement",meta.id);q.set("revision",String(meta.revision));q.set("lod",String(p.lod));q.set("keys",keys.join(","));const batch=await worldApi<DetailBatch>(api.split("?")[0]+"/refinements?"+q,"GET",undefined,signal);
        if(batch.headRevision!==meta.revision||batch.rootRevision!==sources.rootRevision||batch.seaLevel!==sources.seaLevel)throw Error("Accepted terrain changed during drainage loading. Keep the network and retry the analysis.");
        await cache.accept({meta,lod:p.lod,keys},batch);
        for(const tile of batch.tiles){const cached=cache.peek(meta.id,meta.revision,p.lod,tile.y*(p.width/32)+tile.x)!;for(let y=0;y<32;y++)grid.set(cached.samples.subarray(y*32,y*32+32),(tile.y*32+y)*p.width+tile.x*32);}
        done+=keys.length;progress(total?done/total:1);
      }
      patches.push({...p,grid});
    }};
    await Promise.all([load(),load()]);progress(1);return patches;
  }finally{cache.dispose();}
}
