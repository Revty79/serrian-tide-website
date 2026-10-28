import type {TerrainGeometry,TerrainView} from "./terrain";
import type {TerrainDetailScene} from "./terrain-detail-renderer";
import type {TerrainViewport} from "./terrain-refinement";
import type {EnvironmentLayer} from "./terrain-environment";
import {EMPTY_ENVIRONMENT} from "./terrain-environment";
import {EMPTY_HYDROLOGY,type HydroLayer} from "./terrain-hydrology";
import {environmentSampler} from "./terrain-environment-sample";
import {environmentalWaterIndex} from "./terrain-environment-water";
import {terrainSurfaceSampler} from "./terrain-surface-field";
import {styleColor,terrainStyle,type TerrainStyle} from "./terrain-style";
import {artworkAsset,assetColors} from "./terrain-artwork-assets";
import {ARTWORK_LIMITS,type ArtworkLayer,type ArtworkPlacement} from "./terrain-artwork";
import {planArtwork,type ArtworkContext} from "./terrain-artwork-plan";
export type ArtworkOverlay={layer:ArtworkLayer;selectedId?:string|null};
/** One small bounded symbol bitmap cache, shared by automatic and manual art.
 * No image decoding, full-library painting or geographic generation per frame. */
export class TerrainArtworkPainter{
 private bitmaps=new Map<string,HTMLCanvasElement>();private key="";private automatic:ArtworkPlacement[]=[];private context?:ArtworkContext;private root?:Int16Array;private scene?:TerrainDetailScene;private environment?:EnvironmentLayer;private water?:HydroLayer;private sea=NaN;
 readonly metrics={candidates:0,automatic:0,manual:0,drawn:0,bytes:0,preparations:0,plans:0,maxPlanMs:0,maxDrawMs:0,level:0};
 private bitmap(id:string,layer:ArtworkLayer,art?:TerrainStyle){
  const key=JSON.stringify([id,layer.theme,art]),old=this.bitmaps.get(key);if(old){this.bitmaps.delete(key);this.bitmaps.set(key,old);return old;}
  const a=artworkAsset(id);if(!a)return;const canvas=document.createElement("canvas");canvas.width=192;canvas.height=144;const ctx=canvas.getContext("2d")!,colors=assetColors(a.pack,layer.theme);ctx.scale(1.5,1.5);ctx.lineJoin="round";ctx.lineCap="round";
  for(const p of a.paths){const hex=colors[p.role],rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)),color=art?styleColor(rgb,p.role==="water",art):rgb;ctx.fillStyle=ctx.strokeStyle=`rgb(${color.map(Math.round).join(" ")})`;ctx.lineWidth=p.width??1.2;const path=new Path2D(p.d);if(p.stroke){ctx.globalAlpha=p.role==="ink"?Math.min(1,(terrainStyle(art).ink)*.8):.8;ctx.stroke(path);}else{ctx.globalAlpha=1;ctx.fill(path);if(a.pack==="fantasy"){ctx.strokeStyle=colors.ink;ctx.lineWidth=.8;ctx.globalAlpha=.6;ctx.stroke(path);}}}
  this.bitmaps.set(key,canvas);this.metrics.preparations++;this.metrics.bytes+=canvas.width*canvas.height*4;while(this.metrics.bytes>ARTWORK_LIMITS.bitmapBytes){const oldest=this.bitmaps.keys().next().value!;this.bitmaps.delete(oldest);this.metrics.bytes-=192*144*4;}return canvas;
 }
 draw(ctx:CanvasRenderingContext2D,view:TerrainView,world:TerrainGeometry,viewport:TerrainViewport,root:Int16Array,scene:TerrainDetailScene|undefined,sea:number,overlay:ArtworkOverlay|undefined,environment:EnvironmentLayer|undefined,water:HydroLayer|undefined,style:string,art?:TerrainStyle){
  const started=performance.now(),layer=overlay?.layer;this.metrics.drawn=this.metrics.automatic=this.metrics.manual=0;if(!layer||!layer.opacity||!layer.automatic&&!layer.manual)return;
  // The context is based on accepted data only. Active/preview grids may be
  // sculpting drafts and must never drive an automatic geography claim.
  if(this.root!==root||this.scene!==scene||this.environment!==environment||this.water!==water||this.sea!==sea){this.root=root;this.scene=scene;this.environment=environment;this.water=water;this.sea=sea;this.context={world:{width:world.displayWidth,height:world.displayHeight,wrap:world.wrap},sea,sample:terrainSurfaceSampler(root,world,scene?{...scene,active:undefined,preview:undefined}:undefined),environment:environmentSampler(environment??EMPTY_ENVIRONMENT,{width:world.displayWidth,height:world.displayHeight,wrap:world.wrap}),water:environmentalWaterIndex(water??EMPTY_HYDROLOGY,{width:world.displayWidth,height:world.displayHeight,wrap:world.wrap})};this.key="";}
  const planKey=JSON.stringify([viewport.left,viewport.right,viewport.top,viewport.bottom,layer.automatic,layer.pack,layer.density,layer.seed,style,art]);if(planKey!==this.key){const before=performance.now(),plan=planArtwork(layer,viewport,this.context!,style,art);this.automatic=plan.placements;this.metrics.candidates=plan.candidates;this.metrics.level=plan.level;this.metrics.plans++;this.metrics.maxPlanMs=Math.max(this.metrics.maxPlanMs,performance.now()-before);this.key=planKey;}
  const draw=(p:ArtworkPlacement,manual:boolean)=>{const pixels=p.widthM*view.scale;if(pixels<2)return;const size=Math.min(320,pixels),opacity=Math.min(1,(pixels-2)/6)*p.opacity*layer.opacity*(manual?1:Math.min(1,terrainStyle(art).texture+.2));if(!opacity)return;
   for(const offset of world.wrap?[-world.displayWidth,0,world.displayWidth]:[0]){const x=view.x+(p.x+offset)*view.scale,y=view.y+p.y*view.scale;if(x+size<0||x-size>ctx.canvas.width||y+size<0||y-size>ctx.canvas.height)continue;const bitmap=this.bitmap(p.assetId,layer,art);if(!bitmap)continue;ctx.save();ctx.translate(x,y);ctx.rotate(p.rotation*Math.PI/180);ctx.scale(p.mirror?-1:1,1);ctx.globalAlpha=opacity;ctx.drawImage(bitmap,-size/2,-size*.375,size,size*.75);if(manual&&p.id===overlay?.selectedId){ctx.globalAlpha=1;ctx.strokeStyle=getComputedStyle(ctx.canvas).getPropertyValue("--st-focus");ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.strokeRect(-size/2-3,-size*.375-3,size+6,size*.75+6);}ctx.restore();this.metrics.drawn++;}
  };
  if(layer.automatic)for(const p of this.automatic){draw(p,false);this.metrics.automatic++;}if(layer.manual)for(const p of layer.placements){draw(p,true);this.metrics.manual++;}this.metrics.maxDrawMs=Math.max(this.metrics.maxDrawMs,performance.now()-started);
 }
 clear(){this.bitmaps.clear();this.automatic=[];this.key="";this.metrics.bytes=0;}
}
