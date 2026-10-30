import type {TerrainView} from "./terrain";
import type {TerrainFrame} from "./terrain-refinement";
import {frameLocalPoint} from "./terrain-refinement";
import {labelOverlap,type LabelBox} from "./terrain-labels-layout";

/** Presentation clipping only: all coordinates still use the canonical World frame. */
export function clipTerrainRegion(ctx:CanvasRenderingContext2D,view:TerrainView,frame:TerrainFrame|undefined,worldWidth:number,wrap:boolean){
 if(!frame)return;
 ctx.beginPath();
 for(const offset of wrap?[-worldWidth,0,worldWidth]:[0])ctx.rect(view.x+(frame.x+offset)*view.scale,view.y+frame.y*view.scale,frame.width*view.scale,frame.height*view.scale);
 ctx.clip();
}

/** Use the existing label collision rule for inherited native Town captions. */
export function regionalTownCaption(point:{x:number;y:number},screen:{x:number;y:number},view:TerrainView,frame:TerrainFrame,worldWidth:number,wrap:boolean,viewport:{width:number;height:number},textWidth:number,occupied:LabelBox[]):LabelBox|null{
 if(occupied.length>=200)return null;
 const local=frameLocalPoint(point,frame,worldWidth,wrap),left=Math.max(0,screen.x-local.x*view.scale+2),right=Math.min(viewport.width,screen.x-local.x*view.scale+frame.width*view.scale-2),top=Math.max(0,view.y+frame.y*view.scale+2),bottom=Math.min(viewport.height,view.y+(frame.y+frame.height)*view.scale-2),width=Math.min(textWidth,right-left),height=21;
 if(width<48||bottom-top<height)return null;
 for(const [x,y]of [[screen.x+10,screen.y-22],[screen.x-width-10,screen.y-22],[screen.x+10,screen.y+12],[screen.x-width-10,screen.y+12]]){
  const box={x:Math.max(left,Math.min(right-width,x)),y:Math.max(top,Math.min(bottom-height,y)),width,height};
  if(!occupied.some(old=>labelOverlap(old,box)))return box;
 }
 return null;
}
