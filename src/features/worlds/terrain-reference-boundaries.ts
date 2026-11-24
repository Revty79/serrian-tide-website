import {geographicProjection} from "./geographic-projection";
import {wrapLongitude,type GeographicBounds,type GeographicViewport} from "./geographic";
import type {TerrainViewport} from "./terrain-refinement";
import type {TerrainFrame} from "./terrain-refinement";
export type ReferenceBoundaryWorld={displayWidth:number;displayHeight:number;wrap:boolean};

function validReferenceWorld(world:ReferenceBoundaryWorld){return [world.displayWidth,world.displayHeight].every(n=>Number.isFinite(n)&&n>0);}
/** The same full-angular declaration used by the boundary overlay, never a survey transform. */
export function terrainReferenceCoordinate(world:ReferenceBoundaryWorld,point:{x:number;y:number}){
 if(!validReferenceWorld(world)||![point.x,point.y].every(Number.isFinite)||point.y<0||point.y>world.displayHeight||!world.wrap&&(point.x<0||point.x>world.displayWidth))return null;
 const x=world.wrap?((point.x%world.displayWidth)+world.displayWidth)%world.displayWidth:point.x;
 return {longitude:x/world.displayWidth*360-180,latitude:90-point.y/world.displayHeight*180};
}
export function terrainReferencePosition(world:ReferenceBoundaryWorld,coordinate:{longitude:number;latitude:number}){
 if(!validReferenceWorld(world)||![coordinate.longitude,coordinate.latitude].every(Number.isFinite)||Math.abs(coordinate.longitude)>180||Math.abs(coordinate.latitude)>90)return null;
 return {x:(coordinate.longitude+180)/360*world.displayWidth,y:(90-coordinate.latitude)/180*world.displayHeight};
}

/** Explicit full angular-surface alignment; no terrain samples are resampled. */
export function terrainReferenceExtent(world:ReferenceBoundaryWorld,view:Pick<TerrainViewport,"left"|"right"|"top"|"bottom">):GeographicBounds|null{
 const width=Math.min(world.displayWidth,view.right-view.left),top=Math.max(0,view.top),bottom=Math.min(world.displayHeight,view.bottom);
 if(!(width>0&&bottom>top))return null;
 const left=world.wrap?((view.left%world.displayWidth)+world.displayWidth)%world.displayWidth:Math.max(0,view.left),right=world.wrap?left+width:Math.min(world.displayWidth,view.right);
 if(!world.wrap&&right<=left)return null;
 const south=90-bottom/world.displayHeight*180,north=90-top/world.displayHeight*180;
 return width>=world.displayWidth?[-180,south,180,north]:[wrapLongitude(left/world.displayWidth*360-180),south,wrapLongitude(right/world.displayWidth*360-180),north];
}
export function terrainReferenceTransform(packet:GeographicViewport,world:ReferenceBoundaryWorld){
 if(packet.layer.surface.reference.kind!=="sphere"||packet.projection!=="equirectangular")throw Error("Native boundary alignment requires a full angular surface in flat rectangular projection.");
 const p=geographicProjection(packet.layer.surface.reference,packet.bounds,"equirectangular"),center=p.invert?.([500,300]);if(!center)throw Error("The boundary source frame cannot be aligned.");
 const scaleX=world.displayWidth/(2*Math.PI*p.scale()),scaleY=world.displayHeight/(Math.PI*p.scale());
 return {x:(center[0]+180)/360*world.displayWidth-500*scaleX,y:(90-center[1])/180*world.displayHeight-300*scaleY,scaleX,scaleY};
}

/** Focus all retained source parts, including islands across the wrapping seam. */
export function terrainReferenceSourceFrame(bounds:GeographicBounds[],world:ReferenceBoundaryWorld):TerrainFrame|undefined{
 if(!bounds.length)return;
 if(bounds.some(b=>!b.every(Number.isFinite)||b[0]<-180-1e-8||b[2]>180+1e-8||b[1]<-90-1e-8||b[3]>90+1e-8||b[0]>b[2]||b[1]>b[3]))throw Error("The geographic source has an invalid angular extent.");
 const intervals=bounds.map(b=>[Math.max(0,(b[0]+180)/360*world.displayWidth),Math.min(world.displayWidth,(b[2]+180)/360*world.displayWidth)]).sort((a,b)=>a[0]-b[0]),merged:number[][]=[];
 for(const interval of intervals){const last=merged.at(-1);if(last&&interval[0]<=last[1])last[1]=Math.max(last[1],interval[1]);else merged.push([...interval]);}
 let x=merged[0][0],width=merged.at(-1)![1]-x;
 if(world.wrap){let gap=-1;for(let i=0;i<merged.length;i++){const next=merged[(i+1)%merged.length][0]+(i===merged.length-1?world.displayWidth:0),size=next-merged[i][1];if(size>gap){gap=size;x=next%world.displayWidth;}}width=world.displayWidth-gap;}
 const top=(90-Math.max(...bounds.map(b=>b[3])))/180*world.displayHeight,bottom=(90-Math.min(...bounds.map(b=>b[1])))/180*world.displayHeight,padX=Math.max(250,width*.15),padY=Math.max(250,(bottom-top)*.15);
 if(world.wrap){x=((x-padX)%world.displayWidth+world.displayWidth)%world.displayWidth;width=Math.min(world.displayWidth,width+2*padX);if(width===world.displayWidth)x=0;}
 else {const right=Math.min(world.displayWidth,x+width+padX);x=Math.max(0,x-padX);width=right-x;}
 const y=Math.max(0,top-padY),height=Math.min(world.displayHeight,bottom+padY)-y;
 return {x,y,width,height};
}
