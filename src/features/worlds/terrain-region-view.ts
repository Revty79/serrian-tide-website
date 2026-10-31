import type {TerrainView} from "./terrain";
import type {TerrainFrame} from "./terrain-refinement";
import {frameLocalPoint} from "./terrain-refinement";
import {labelOverlap,type LabelBox} from "./terrain-labels-layout";
import {regionDisplayParts,regionAreaContainsPath,regionCanonicalX,type RegionFootprint} from "./terrain-region-geometry";

/** Presentation clipping only: all coordinates still use the canonical World frame. */
export function clipTerrainRegion(ctx:CanvasRenderingContext2D,view:TerrainView,frame:TerrainFrame|undefined,worldWidth:number,wrap:boolean,footprint?:RegionFootprint){
 if(!frame)return;
 ctx.beginPath();
 for(const offset of wrap?[-worldWidth,0,worldWidth]:[0]){if(footprint){for(const part of regionDisplayParts({frame,footprint},worldWidth,wrap)){part.forEach((p,i)=>{const x=view.x+(p.x+offset)*view.scale,y=view.y+p.y*view.scale;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.closePath();}}else ctx.rect(view.x+(frame.x+offset)*view.scale,view.y+frame.y*view.scale,frame.width*view.scale,frame.height*view.scale);}
 ctx.clip();
}

/** Use the existing label collision rule for inherited native Town captions. */
export function regionalTownCaption(point:{x:number;y:number},screen:{x:number;y:number},view:TerrainView,frame:TerrainFrame,worldWidth:number,wrap:boolean,viewport:{width:number;height:number},textWidth:number,occupied:LabelBox[],footprint?:RegionFootprint):LabelBox|null{
 if(occupied.length>=200)return null;
 const local=frameLocalPoint(point,frame,worldWidth,wrap),left=Math.max(0,screen.x-local.x*view.scale+2),right=Math.min(viewport.width,screen.x-local.x*view.scale+frame.width*view.scale-2),top=Math.max(0,view.y+frame.y*view.scale+2),bottom=Math.min(viewport.height,view.y+(frame.y+frame.height)*view.scale-2),width=Math.min(textWidth,right-left),height=21;
 if(width<48||bottom-top<height)return null;
 for(const [x,y]of [[screen.x+10,screen.y-22],[screen.x-width-10,screen.y-22],[screen.x+10,screen.y+12],[screen.x-width-10,screen.y+12]]){
  const box={x:Math.max(left,Math.min(right-width,x)),y:Math.max(top,Math.min(bottom-height,y)),width,height};
  if(footprint){const world={width:worldWidth,height:frame.y+frame.height,wrap},corners=[[box.x,box.y],[box.x+box.width,box.y],[box.x+box.width,box.y+box.height],[box.x,box.y+box.height]].map(([x,y])=>({x:regionCanonicalX((x-view.x)/view.scale,world),y:(y-view.y)/view.scale}));if(!regionAreaContainsPath({frame,footprint},corners,world,0,true))continue;}
  if(!occupied.some(old=>labelOverlap(old,box)))return box;
 }
 return null;
}
