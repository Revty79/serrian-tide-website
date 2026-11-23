import {brushWeight,type TerrainGeometry} from "./terrain";
import type {AdvancedOperation} from "./terrain-advanced-spec";
import type {AdvancedTerrainContext} from "./terrain-advanced";

type Profile=Extract<AdvancedOperation,{kind:"landform-profile"}>;
const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
/** A physical path, with no global lookup or accumulated height at intersections. */
export function prepareLandformProfile(op:Profile,shape:TerrainGeometry,context:AdvancedTerrainContext){
  const {world,frame,nativeLattice}=context,spacing=nativeLattice?Math.max(nativeLattice.frame.width/nativeLattice.width,nativeLattice.frame.height/nativeLattice.height):Math.max(frame.width/shape.width,frame.height/shape.height);
  const dx=(a:number,b:number)=>{let d=b-a;if(world.wrap)d-=Math.round(d/world.width)*world.width;return d;};
  if(op.mode==="upper-envelope"){
    const base=op.envelopeBaseM;
    if(base===undefined||base<context.seaLevel+1||base<shape.min||base>shape.max)throw Error("Keep the envelope base at least one metre above sea level and within this saved map's limits.");
    if(op.points.some(point=>point.elevationM<base))throw Error("Keep every profile envelope ceiling at or above its base elevation.");
  }
  for(const point of op.points){
    if(point.x>=world.width||point.y>=world.height)throw Error("Keep every profile point inside the World.");
    if(point.elevationM<shape.min||point.elevationM>shape.max)throw Error("Keep profile elevations within this saved map's limits.");
    if(point.widthM<spacing*2)throw Error("Each profile width must cover at least two native samples. Choose an explicit supported width or finer terrain.");
  }
  let length=0;
  const segments=op.points.slice(1).map((b,index)=>{
    const a=op.points[index],east=dx(a.x,b.x),south=b.y-a.y,extent=Math.hypot(east,south),start=length;
    if(extent<1e-6)throw Error("Separate consecutive profile points; coincident points cannot define an elevation transition.");
    length+=extent;return {a,b,east,south,extent,start};
  });
  if(op.endBlendM>length/2)throw Error("Keep the end blend within half the profile's physical path length.");
  return (point:{x:number;y:number})=>{
    let weight=0,targetSum=0,contributions=0,endDistanceSum=0;
    for(const s of segments){
      const east=dx(s.a.x,point.x),south=point.y-s.a.y,t=Math.max(0,Math.min(1,(east*s.east+south*s.south)/(s.extent*s.extent))),u=smooth(t),
        radius=(s.a.widthM+(s.b.widthM-s.a.widthM)*u)/2,
        r=Math.hypot(east-t*s.east,south-t*s.south)/radius;
      if(r>=1)continue;
      const along=s.start+t*s.extent,endWeight=op.endBlendM&&!op.continuousEndBlend?smooth(Math.min(along,length-along)/op.endBlendM):1,
        next=brushWeight(r,op.hardness)*endWeight;
      // Blend competing segments continuously at bends and crossings. The
      // maximum envelope controls effect, so overlapping segments never stack.
      const contribution=next/Math.max(1e-12,r**4);
      weight=Math.max(weight,next);contributions+=contribution;
      targetSum+=(s.a.elevationM+(s.b.elevationM-s.a.elevationM)*u)*contribution;
      if(op.continuousEndBlend)endDistanceSum+=Math.min(along,length-along)*contribution;
    }
    // One path-wide fade keeps overlapping segment caps from bypassing its ends.
    // The original absent/false branch retains its exact weighting and arithmetic.
    if(op.continuousEndBlend&&op.endBlendM){
      const distance=contributions?endDistanceSum/contributions:0;
      weight*=smooth(distance/op.endBlendM);
    }
    return {weight,target:contributions?targetSum/contributions:0};
  };
}
