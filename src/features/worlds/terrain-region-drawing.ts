import type {RegionPoint} from "./terrain-region-geometry";
export type RegionOutlinePart={points:RegionPoint[];closed:boolean};
export type RegionDragPhase="start"|"update"|"finish"|"cancel";
export type RegionOutlineDrawing={editable?:boolean;method:"freehand"|"points";parts:RegionOutlinePart[];activePart:number;operation:"append"|"move"|"insert";vertex:number;onPick:(point:RegionPoint,tolerance:number)=>void;onTrace:(points:RegionPoint[],phase:RegionDragPhase)=>void;onVertexDrag?:(part:number,vertex:number,point:RegionPoint,phase:RegionDragPhase)=>void};

/** Hit the same unwrapped CSS-pixel handles that the map draws, independently of DPR and sample spacing. */
export function regionVertexAt(parts:readonly RegionOutlinePart[],point:RegionPoint,view:{x:number;y:number;scale:number},world:{width:number;wrap:boolean},radius=12){
 if(!Number.isFinite(view.scale)||view.scale<=0)return;
 let found:{part:number;vertex:number}|undefined,best=radius;
 for(const [part,area]of parts.entries()){
  let x=area.points[0]?.x??0,previous=x;
  for(const [vertex,p]of area.points.entries()){
   if(vertex){let dx=p.x-previous;if(world.wrap)dx-=Math.round(dx/world.width)*world.width;x+=dx;}previous=p.x;
   for(const offset of world.wrap?[-world.width,0,world.width]:[0]){const distance=Math.hypot(view.x+(x+offset)*view.scale-point.x,view.y+p.y*view.scale-point.y);if(distance<=best){best=distance;found={part,vertex};}}
  }
 }
 return found;
}
