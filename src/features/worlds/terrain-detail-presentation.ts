import type {TerrainGeometry} from "./terrain";
import {chooseTerrainLod,frameGeometry,framesOverlap,lodGeometry,tileKeysForView,type TerrainViewport,type RefinementMeta} from "./terrain-refinement";
import type {TerrainDetailScene} from "./terrain-detail-renderer";
import type {DetailPlan,CachedDetailTile} from "./terrain-refinement-cache";
import type {CartographicWindow} from "./terrain-cartography-window";

/** Existing native viewport plan, with opt-in device density. Numerical tile
 * budget, source pins, frames and the original density-1 behavior stay exact. */
export function detailViewPlan(metas:RefinementMeta[],view:TerrainViewport,world:TerrainGeometry,previous:Map<string,number>=new Map(),budget=1024,density=1){
 const bounds={x:view.left,y:view.top,width:view.right-view.left,height:view.bottom-view.top},samplingScale=view.scale*(Number.isFinite(density)?Math.max(1,Math.min(2,density)):1);
 const plans:DetailPlan[]=metas.filter(m=>Math.min(m.frame.width,m.frame.height)*view.scale>=2&&framesOverlap(m.frame,bounds,world.displayWidth,world.wrap)).sort((a,b)=>b.level-a.level).map(meta=>{const shape=frameGeometry(meta,world),lod=chooseTerrainLod(shape,samplingScale,previous.get(meta.id));return {meta,lod,keys:[...tileKeysForView(meta.frame,lodGeometry(shape,lod),view,world)]};}).filter(p=>p.keys.length);
 while(plans.reduce((n,p)=>n+p.keys.length,0)>budget){const candidate=plans.filter(p=>p.lod<p.meta.overviewLevels).sort((a,b)=>b.keys.length-a.keys.length)[0];if(!candidate)break;candidate.lod++;candidate.keys=[...tileKeysForView(candidate.meta.frame,lodGeometry(frameGeometry(candidate.meta,world),candidate.lod),view,world)];}
 for(const p of plans)previous.set(p.meta.id,p.lod);return plans;
}

/** Presentation work only. Keep parents until a finer pinned source is complete
 * across the view AND its reconstruction collar, including wrapped copies. */
export function visibleTerrainDetail(scene:TerrainDetailScene|undefined,view:TerrainViewport,world:TerrainGeometry){
 const plans=scene?.plans??[];
 const covering=[...plans].sort((a,b)=>b.meta.level-a.meta.level).find(plan=>{
  const active=[scene?.preview,scene?.active].some(a=>a?.meta.id===plan.meta.id);
  if(!active&&(!plan.keys.length||!plan.keys.every(key=>scene!.cache.peek(plan.meta.id,plan.meta.revision,plan.lod,key))))return false;
  const f=plan.meta.frame,marginX=f.width/(plan.meta.gridWidth/2**plan.lod)*4,marginY=f.height/(plan.meta.gridHeight/2**plan.lod)*4;
  return view.right>view.left&&view.bottom>view.top&&(world.wrap?[-world.displayWidth,0,world.displayWidth]:[0]).some(offset=>view.left>=f.x+offset+marginX&&view.right<=f.x+offset+f.width-marginX&&view.top>=f.y+marginY&&view.bottom<=f.y+f.height-marginY);
 });
 return {covering,plans:covering?plans.filter(plan=>plan.meta.level>=covering.meta.level):plans};
}

/** Feather only the inherited presentation collar. Accepted heights, palette,
 * lighting, coordinates and the numerical brush/protection engine are untouched. */
export function featherTerrainDetail(pixels:ImageData,shape:TerrainGeometry,x0:number,y0:number,window?:CartographicWindow,collar=2){
 const left=x0+(window?.x??0),top=y0+(window?.y??0),width=window?.width??shape.tileSize,height=window?.height??shape.tileSize;
 if((shape.wrap||left>=collar&&left+width<=shape.width-collar)&&top>=collar&&top+height<=shape.height-collar)return false;
 const smooth=(n:number)=>{const t=Math.max(0,Math.min(1,n/collar));return t*t*(3-2*t);};
 const columns=Array.from({length:pixels.width},(_,x)=>{const p=left+(x+.5)/pixels.width*width;return shape.wrap?1:smooth(Math.min(p,shape.width-p));});
 for(let y=0;y<pixels.height;y++){const p=top+(y+.5)/pixels.height*height,vertical=smooth(Math.min(p,shape.height-p));for(let x=0;x<pixels.width;x++)pixels.data[(y*pixels.width+x)*4+3]=Math.round(pixels.data[(y*pixels.width+x)*4+3]*Math.min(columns[x],vertical));}
 return true;
}

/** Stable identity across visual windows and numerical LOD, never across saved
 * revisions or working/saved sources. Used only while replacement imagery draws. */
export const detailPresentationIdentity=(plan:DetailPlan,working:boolean)=>`${plan.meta.id}/${plan.meta.revision}/${working?"working":"saved"}`;

/** Read-only integer index of the existing bounded, validated tile cache. Avoid
 * rebuilding long source/revision keys for every halo sample; no arrays are
 * copied, owned or retained across painter synchronizations here. */
export function detailNumericalTiles(scene:TerrainDetailScene,plan:DetailPlan):ReadonlyMap<number,CachedDetailTile>{
 const tiles=new Map<number,CachedDetailTile>();for(const tile of scene.cache.values())if(tile.surfaceId===plan.meta.id&&tile.revision===plan.meta.revision&&tile.lod===plan.lod)tiles.set(tile.key,tile);return tiles;
}
