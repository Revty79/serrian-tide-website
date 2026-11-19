import type {TerrainGeometry} from "./terrain";
import {frameGeometry,framesOverlap,lodGeometry,tileKeysForView,type RefinementMeta,type TerrainViewport} from "./terrain-refinement";
import type {DetailPlan} from "./terrain-refinement-cache";
/** Legacy World windows can have 20 x 12 native tiles. Use only integer LODs
 * dividing both axes; no fractional tile keys or native-grid resampling. */
export function sharedReliefPreviewPlans(metas:RefinementMeta[],view:TerrainViewport,world:TerrainGeometry,budget=1024):DetailPlan[]{
 const bounds={x:view.left,y:view.top,width:view.right-view.left,height:view.bottom-view.top};
 const plans=metas.filter(m=>Math.min(m.frame.width,m.frame.height)*view.scale>=2&&framesOverlap(m.frame,bounds,world.displayWidth,world.wrap)).sort((a,b)=>b.level-a.level).map(meta=>{
  const shape=frameGeometry(meta,world),density=Math.max(shape.displayWidth/shape.width,shape.displayHeight/shape.height)*view.scale,lod=Math.max(0,Math.min(meta.overviewLevels,Math.floor(Math.log2(2/Math.max(1e-12,density)))));
  return {meta,lod,keys:[...tileKeysForView(meta.frame,lodGeometry(shape,lod),view,world)]};
 }).filter(p=>p.keys.length);
 while(plans.reduce((n,p)=>n+p.keys.length,0)>budget){const p=plans.filter(p=>p.lod<p.meta.overviewLevels).sort((a,b)=>b.keys.length-a.keys.length)[0];if(!p)break;p.lod++;p.keys=[...tileKeysForView(p.meta.frame,lodGeometry(frameGeometry(p.meta,world),p.lod),view,world)];}
 return plans;
}
