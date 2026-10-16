import type {MapDraft,Point} from "./atlas";
import {curvedPath,defaultPresentation,drawingLayer,type MapDrawing} from "./cartography";
import {islandAsset,type AssetReference,type IslandAsset} from "./island-assets";
import {islandArtwork} from "./island-artwork-source";
import {assetTerrainMarks} from "./island-asset-scene";
import type {AtlasGeographicFrame} from "./atlas-geographic-frame";

type Shape={path:Path2D;fill:boolean;stroke:number;rule:CanvasFillRule;cap:CanvasLineCap;join:CanvasLineJoin};
const geometry=new WeakMap<IslandAsset,Shape[]>(),marks=new WeakMap<MapDrawing,ReturnType<typeof assetTerrainMarks>>();
let context:CanvasRenderingContext2D|null=null;
const canvasContext=()=>context??(typeof document==="undefined"?null:context=document.createElement("canvas").getContext("2d"));
export function inverseArtworkPoint(point:Point,anchor:Point,scale:number,rotation:number):Point|null{
 if(!Number.isFinite(scale)||scale<=0)return null;const angle=-rotation*Math.PI/180,x=(point.x-anchor.x)/scale,y=(point.y-anchor.y)/scale;return {x:x*Math.cos(angle)-y*Math.sin(angle),y:x*Math.sin(angle)+y*Math.cos(angle)};
}
function sourceGeometry(asset:IslandAsset):Shape[]{
 const cached=geometry.get(asset);if(cached)return cached;const source=islandArtwork.read(asset);if(source.state!=="ready"||typeof DOMParser==="undefined")return [];
 const doc=new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${source.svg}</svg>`,"image/svg+xml"),result:Shape[]=[];
 for(const element of doc.querySelectorAll("path")){
  const attribute=(name:string,fallback:string)=>{for(let node:Element|null=element;node;node=node.parentElement){const value=node.getAttribute(name);if(value!==null)return value;}return fallback;};
  let opacity=1;for(let node:Element|null=element;node;node=node.parentElement)opacity*=Number(node.getAttribute("opacity")??1);if(!opacity)continue;
  const path=new Path2D(element.getAttribute("d")??""),fill=attribute("fill","black"),stroke=attribute("stroke","none");
  result.push({path,fill:fill!=="none"&&fill!=="transparent"&&Number(attribute("fill-opacity","1"))>0,stroke:stroke!=="none"&&stroke!=="transparent"&&Number(attribute("stroke-opacity","1"))>0?Number(attribute("stroke-width","1")):0,rule:attribute("fill-rule","nonzero")==="evenodd"?"evenodd":"nonzero",cap:attribute("stroke-linecap","butt") as CanvasLineCap,join:attribute("stroke-linejoin","miter") as CanvasLineJoin});
 }
 // Published starter vectors are path-only, already hash verified by the existing artwork store.
 geometry.set(asset,result);return result;
}
export function pinnedArtworkHit(reference:AssetReference,point:Point,tolerance:number):boolean{
 const c=canvasContext();if(!c)return false;try{const asset=islandAsset(reference),[x,y,w,h]=asset.viewBox.split(" ").map(Number);if(point.x<x-32-tolerance||point.y<y-32-tolerance||point.x>x+w+32+tolerance||point.y>y+h+32+tolerance)return false;
  return sourceGeometry(asset).some(shape=>{if(shape.fill&&c.isPointInPath(shape.path,point.x,point.y,shape.rule))return true;if(!shape.stroke&&!shape.fill)return false;c.lineWidth=shape.stroke+tolerance*2;c.lineCap=shape.cap;c.lineJoin=shape.join;return c.lineWidth>0&&c.isPointInStroke(shape.path,point.x,point.y);});
 }catch{return false;}
}
export type DrawingHitOptions={frame?:AtlasGeographicFrame;units:number;tolerance:number;visibleTerrain?:(point:Point)=>boolean;artworkHit?:(reference:AssetReference,point:Point,tolerance:number)=>boolean;legacyHit?:(drawing:MapDrawing,point:Point,tolerance:number)=>boolean};
export function labelHitBounds(drawing:Extract<MapDrawing,{type:"label"}>,units:number){
 const size=Math.max(drawing.size,11*units),c=canvasContext();if(!c)return {x:-drawing.text.length*size*.3,y:-size,w:drawing.text.length*size*.6,h:size*1.2};
 c.font=`${drawing.style==="water"?"italic ":drawing.style==="region"?"small-caps ":""}${size}px Georgia, 'Palatino Linotype', serif`;c.textAlign="center";const metrics=c.measureText(drawing.text),spacing=drawing.style==="region"?Math.max(0,drawing.text.length-1)*3:0;return {x:-metrics.actualBoundingBoxLeft-spacing/2-2,y:-metrics.actualBoundingBoxAscent-2,w:metrics.actualBoundingBoxLeft+metrics.actualBoundingBoxRight+spacing+4,h:metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent+4};
}
export function drawingSelectionBounds(drawing:MapDrawing,frame:AtlasGeographicFrame|undefined,units:number){
 if(drawing.type!=="symbol"&&drawing.type!=="label")return null;const anchor=frame?.project(drawing.point)??drawing.point,scale=drawing.type==="symbol"?drawing.scale*(drawing.version===2?(frame?.scaleAt(drawing.point)??1):1):1;
 let box={x:-35,y:-35,w:70,h:70};if(drawing.type==="label")box=labelHitBounds(drawing,units);else if(drawing.version===2){try{const [x,y,w,h]=islandAsset(drawing.assetRef).viewBox.split(" ").map(Number);box={x,y,w,h};}catch{/* Keep a bounded placeholder for a retained missing reference. */}}
 const angle=drawing.rotation*Math.PI/180,points=[[box.x,box.y],[box.x+box.w,box.y],[box.x,box.y+box.h],[box.x+box.w,box.y+box.h]].map(([x,y])=>({x:anchor.x+scale*(x*Math.cos(angle)-y*Math.sin(angle)),y:anchor.y+scale*(x*Math.sin(angle)+y*Math.cos(angle))}));return {x:Math.min(...points.map(p=>p.x)),y:Math.min(...points.map(p=>p.y)),width:Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),height:Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y))};
}
/** Match the renderer's layer/order, exact pins, projected anchor/scale and deterministic stroke instances. */
export function hitAtlasDrawing(draft:MapDraft,point:Point,options:DrawingHitOptions):MapDrawing|null{
 if(point.x<0||point.x>2000||point.y<0||point.y>1200)return null;
 const presentation=draft.presentation??defaultPresentation(),drawings=draft.drawings??[],project=(p:Point)=>options.frame?.project(p)??p,scaleAt=(p:Point)=>options.frame?.scaleAt(p)??1,hit=options.artworkHit??pinnedArtworkHit,c=canvasContext();
 // Prefer actual painted ink over another object’s minimum touch halo.
 for(const tolerance of [0,options.tolerance])for(const layer of ["labels","symbols","paths","waterways","terrain"] as const){if(!presentation.layers[layer].visible||presentation.layers[layer].locked)continue;
  for(let i=drawings.length-1;i>=0;i--){const d=drawings[i];if(d.archived||drawingLayer(d)!==layer||layer==="terrain"&&options.visibleTerrain&&!options.visibleTerrain(point))continue;
   if(d.type==="symbol"){
    const scale=d.scale*(d.version===2?scaleAt(d.point):1),local=inverseArtworkPoint(point,project(d.point),scale,d.rotation);if(!local)continue;
    if(d.version===2?hit(d.assetRef,local,tolerance/scale):options.legacyHit?.(d,point,tolerance))return d;
   }else if(d.type==="label"){
    const local=inverseArtworkPoint(point,project(d.point),1,d.rotation),box=labelHitBounds(d,options.units),t=tolerance;if(local&&local.x>=box.x-t&&local.x<=box.x+box.w+t&&local.y>=box.y-t&&local.y<=box.y+box.h+t)return d;
   }else if(d.type==="path"){
    if(!c)continue;const path=new Path2D(options.frame?options.frame.path(d.points,false,d.curve):curvedPath(d.points,d.curve));c.lineWidth=Math.max(d.width+3,tolerance*2);c.lineCap="round";c.lineJoin="round";if(c.isPointInStroke(path,point.x,point.y))return d;
   }else if(d.version===2){
    let instances=marks.get(d);if(!instances){try{instances=assetTerrainMarks(d);marks.set(d,instances);}catch{continue;}}
    for(let j=instances.length-1;j>=0;j--){const mark=instances[j];if(options.frame&&(mark.x<0||mark.x>2000||mark.y<0||mark.y>1200))continue;const scale=mark.scale*scaleAt(mark),local=inverseArtworkPoint(point,project(mark),scale,mark.rotation);if(local&&hit(mark.reference,local,tolerance/scale))return d;}
   }else if(options.legacyHit?.(d,point,tolerance))return d;
  }
 }
 return null;
}
