import {alignedFloorAngle,alignedFloorDesign,alignedFloorPoint,buildingFloorAlignment,sourceFloorAngle,sourceFloorFeature,sourceFloorPoint} from "./building-floor-alignment";
import {floorRound,type FloorDesign,type FloorFrame} from "./building-floor";
import type {TownPoint} from "./town-map";
import type {AssetComposition} from "./atlas-assets";
type Drawing={frame:FloorFrame;design:FloorDesign;footprint?:TownPoint[]};
type Images={surface:number;layer:AssetComposition}[];
/** Reuse the accepted working grid while leaving both canonical building records untouched. */
export function fitInteriorTemplate(d:Drawing,images:Images,frame:FloorFrame,footprint:TownPoint[],fit:boolean){
 const from=buildingFloorAlignment(d.footprint??[],d.frame),to=buildingFloorAlignment(footprint,frame),delta=(to.angle-from.angle)*Math.PI/180,c=Math.abs(Math.cos(delta)),s=Math.abs(Math.sin(delta)),width=d.frame.width*c+d.frame.height*s,height=d.frame.width*s+d.frame.height*c;
 if(!fit&&(width>frame.width+.02||height>frame.height+.02))throw Error("The saved drawing is larger than this workspace at its working-grid angle. Choose Fit drawing, or use a larger workspace.");
 const scale=fit?Math.min(frame.width/width,frame.height/height):1;
 if(scale===1&&from.angle===to.angle&&from.offset.x===to.offset.x&&from.offset.y===to.offset.y&&d.frame.width===frame.width&&d.frame.height===frame.height)return {design:d.design,images};
 const a=alignedFloorPoint({x:d.frame.width/2,y:d.frame.height/2},from),b=alignedFloorPoint({x:frame.width/2,y:frame.height/2},to),move=(p:TownPoint)=>({x:floorRound(b.x+(p.x-a.x)*scale),y:floorRound(b.y+(p.y-a.y)*scale)}),shown=alignedFloorDesign(d.design,from);
 const design={...shown,features:shown.features.map(f=>sourceFloorFeature("points" in f?{...f,points:f.points.map(p=>({...p,...move(p)}))}:f.variant==="object"?{...f,point:move(f.point),width:floorRound(f.width*scale),height:floorRound(f.height*scale)}:f,to))};
 const layers=images.map(i=>({...i,layer:{...i.layer,placements:i.layer.placements.map(p=>({...p,...sourceFloorPoint(move(alignedFloorPoint(p,from)),to),width:p.width*scale,height:p.height*scale,rotation:sourceFloorAngle(alignedFloorAngle(p.rotation,from),to)}))}}));
 return {design,images:layers};
}
