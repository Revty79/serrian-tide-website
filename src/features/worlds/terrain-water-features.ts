import {hydroIdentity,hydroLayerSchema,moveHydroPoint,pruneHydrology,type HydroLayer,type HydroPoint,type HydroGeometry,type HydroSources,type WaterFeature} from "./terrain-hydrology";
import {waterDx,waterPoint,insideWaterRings,waterBounds} from "./terrain-water-geometry";

export const specialWater=(layer:HydroLayer):HydroLayer=>({...layer,systemVersion:3,features:layer.features??[]});
export function waterAuthorPins(sources?:HydroSources,points?:HydroPoint[]){const box=sources&&points?.length?waterBounds(points,sources.world):undefined,relevant=sources?.sources.filter(s=>!box||s.level===0||s.frame.y<=box.y+box.height&&s.frame.y+s.frame.height>=box.y&&[-sources.world.width,0,sources.world.width].some(offset=>(sources.world.wrap||offset===0)&&s.frame.x+offset<=box.x+box.width&&s.frame.x+s.frame.width+offset>=box.x));return relevant?.map(s=>({id:s.id,revision:s.revision,lod:0,contentHash:s.contentHash,spacingX:s.frame.width/s.gridWidth,spacingY:s.frame.height/s.gridHeight}));}

export function nearestRiverPoint(layer:HydroLayer,riverId:string,point:HydroPoint,world:HydroGeometry){
  const river=layer.edges.find(e=>e.id===riverId);if(!river)throw Error("Choose a saved river first.");let distance=Infinity,best=river.points[0];
  for(let i=1;i<river.points.length;i++){const a=river.points[i-1],b=river.points[i],sx=waterDx(a.x,b.x,world),sy=b.y-a.y,x=waterDx(a.x,point.x,world),y=point.y-a.y,t=Math.max(0,Math.min(1,(x*sx+y*sy)/(sx*sx+sy*sy||1))),d=Math.hypot(x-t*sx,y-t*sy);if(d<distance){distance=d;best=waterPoint({x:a.x+t*sx,y:a.y+t*sy},world);}}
  return {point:best,distance};
}
/** Parent edits retain every feature; detached/repositioned interpretations
 * become reviewable. Deliberate simultaneous feature alignment is respected. */
export function reconcileWaterFeatures(before:HydroLayer,next:HydroLayer):HydroLayer{
  if(!next.features)return next;
  return {...next,features:next.features.map(f=>{const old=before.features?.find(v=>v.id===f.id);if(!old)return f;const geometry=(v:WaterFeature)=>v.kind==="wetland"?v.rings:v.point;if(JSON.stringify(geometry(old))!==JSON.stringify(geometry(f)))return f;
    const riverChanged=f.riverId&&JSON.stringify(before.edges.find(e=>e.id===f.riverId)?.points)!==JSON.stringify(next.edges.find(e=>e.id===f.riverId)?.points),lakeChanged=f.kind==="wetland"&&f.lakeId&&JSON.stringify(before.lakes?.find(l=>l.id===f.lakeId)?.rings)!==JSON.stringify(next.lakes?.find(l=>l.id===f.lakeId)?.rings);
    return riverChanged||lakeChanged?{...f,review:true}:f;
  })};
}
export function connectSpring(layer:HydroLayer,id:string,riverId:string){
  const spring=layer.features?.find(f=>f.id===id),river=layer.edges.find(e=>e.id===riverId);if(spring?.kind!=="spring"||!river)throw Error("Choose a spring and a saved headwater channel.");
  if(layer.nodes.find(n=>n.id===river.from)?.lakeId||layer.edges.some(e=>e.to===river.from))throw Error("Choose a headwater channel, or deliberately disconnect its source before linking a spring.");
  const moved=moveHydroPoint(layer,riverId,0,spring.point);return hydroLayerSchema.parse({...specialWater(moved),features:layer.features!.map(f=>f.id===id?{...f,riverId,protected:true,review:false}:f)});
}
export function moveWaterFeature(layer:HydroLayer,id:string,point:HydroPoint,world:HydroGeometry){
  const f=layer.features?.find(f=>f.id===id);if(!f||f.kind==="wetland")throw Error("Choose a point water feature.");
  let next=layer,p=point;if(f.kind!=="spring"&&f.riverId)p=nearestRiverPoint(layer,f.riverId,point,world).point;
  if(f.kind==="spring"&&f.riverId){const river=layer.edges.find(e=>e.id===f.riverId)!;next=moveHydroPoint(layer,river.id,0,p);}
  return hydroLayerSchema.parse({...specialWater(next),features:layer.features!.map(v=>v.id===id?{...v,point:p,protected:true,flowKind:v.flowKind==="exception"?"exception":"manual",review:false}:v)});
}
export function acceptWaterFeatures(base:HydroLayer,proposal:HydroLayer,id?:string){
  const features=new Map((base.features??[]).map(f=>[f.id,f]));for(const f of proposal.features??[]){if(id&&id!==f.id)continue;const old=features.get(f.id);if(old&&(old.protected||old.flowKind!=="derived"))continue;if(f.riverId&&!base.edges.some(e=>e.id===f.riverId))throw Error("This suggestion's river changed. Review the saved network again.");features.set(f.id,f);}
  const analyses=new Map([...base.analyses,...proposal.analyses].map(a=>[a.id,a]));return hydroLayerSchema.parse(pruneHydrology({...specialWater(base),features:[...features.values()],analyses:[...analyses.values()]}));
}
export function hitWaterFeature(layer:HydroLayer,point:HydroPoint,world:HydroGeometry,tolerance:number){
  for(const f of layer.features??[])if(f.kind!=="wetland"&&Math.hypot(waterDx(point.x,f.point.x,world),point.y-f.point.y)<=tolerance)return f.id;
  return layer.features?.find(f=>f.kind==="wetland"&&insideWaterRings(point,f.rings,world))?.id;
}
export const featureIdentity=(kind:string,riverId:string,point:HydroPoint)=>hydroIdentity(kind,riverId+"/"+point.x.toFixed(4)+"/"+point.y.toFixed(4));
