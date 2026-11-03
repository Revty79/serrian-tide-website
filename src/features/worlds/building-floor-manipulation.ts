import {floorAnchor,floorRound,transformFloorFeature,type FloorFeature} from "./building-floor";
import {floorFeatureBounds,type FloorView} from "./building-floor-art";
import type {TownPoint} from "./town-map";

/** Selection geometry follows the visible object rather than its conservative paint/culling radius. */
export function floorSelection(f:FloorFeature,features:FloorFeature[],view:FloorView){
 const b=floorFeatureBounds(f,features),c=floorAnchor(f,features),object=f.variant==="object",w=object?f.width:b.width,h=object?f.height:b.height,r=object?f.rotation*Math.PI/180:0;
 const center=object?c:{x:b.x+b.width/2,y:b.y+b.height/2},project=(x:number,y:number)=>({x:(center.x+x*Math.cos(r)-y*Math.sin(r)-view.left)*view.scale,y:(center.y+x*Math.sin(r)+y*Math.cos(r)-view.top)*view.scale});
 const corners=[project(-w/2,-h/2),project(w/2,-h/2),project(w/2,h/2),project(-w/2,h/2)],stem=project(0,-h/2),outside=project(0,-h/2-30/view.scale);
 const corner=corners[2],screenCenter=project(0,0),distance=Math.max(1,Math.hypot(corner.x-screenCenter.x,corner.y-screenCenter.y)),resize={x:corner.x+18*(corner.x-screenCenter.x)/distance,y:corner.y+18*(corner.y-screenCenter.y)/distance};
 return {corners,resize,stem,rotate:{x:Math.max(16,Math.min(view.width-16,outside.x)),y:Math.max(16,Math.min(view.height-16,outside.y))}};
}

/** A drag starts at the handle's actual hit point; no handle offset becomes an unintended size change. */
export function resizeFloorFeature(f:FloorFeature,features:FloorFeature[],start:TownPoint,end:TownPoint):FloorFeature{
 if(f.variant!=="object"&&f.variant!=="area")return f;
 const b=floorFeatureBounds(f,features),r=f.variant==="object"?f.rotation*Math.PI/180:0,dx=end.x-start.x,dy=end.y-start.y;
 const width=f.variant==="object"?f.width:b.width,height=f.variant==="object"?f.height:b.height;
 const w=floorRound(Math.max(.1,Math.min(f.variant==="object"?100:20000,width+dx*Math.cos(r)+dy*Math.sin(r)))),h=floorRound(Math.max(.1,Math.min(f.variant==="object"?100:20000,height-dx*Math.sin(r)+dy*Math.cos(r))));
 const x=(w-width)/2,y=(h-height)/2;
 return transformFloorFeature(f,features,x*Math.cos(r)-y*Math.sin(r),x*Math.sin(r)+y*Math.cos(r),0,w/width,h/height);
}
