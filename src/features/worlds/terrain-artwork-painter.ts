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
import {manualMaterialAuthority} from "./terrain-environment-art";
import {EMPTY_TERRAIN_MATERIALS,type TerrainMaterials} from "./terrain-materials";
import {artworkBankIndex} from "./terrain-artwork-water";
export type ArtworkOverlay={layer:ArtworkLayer;selectedId?:string|null};
/** One small bounded symbol bitmap cache, shared by automatic and manual art.
 * No image decoding, full-library painting or geographic generation per frame. */
export class TerrainArtworkPainter{
 private bitmaps=new Map<string,HTMLCanvasElement>();private key="";private automatic:ArtworkPlacement[]=[];private context?:ArtworkContext;private root?:Int16Array;private scene?:TerrainDetailScene;private environment?:EnvironmentLayer;private water?:HydroLayer;private materials?:TerrainMaterials;private sea=NaN;
 readonly metrics={candidates:0,automatic:0,manual:0,drawn:0,bytes:0,preparations:0,plans:0,maxPlanMs:0,maxDrawMs:0,level:0};
 private bitmap(id:string,layer:ArtworkLayer,art:TerrainStyle|undefined,pixels:number){
  const bucket=pixels<=32?32:pixels<=96?96:192;
  const key=JSON.stringify([id,layer.theme,art,bucket]),old=this.bitmaps.get(key);if(old){this.bitmaps.delete(key);this.bitmaps.set(key,old);return old;}
  const a=artworkAsset(id);if(!a)return;const canvas=document.createElement("canvas");canvas.width=bucket;canvas.height=bucket*.75;const ctx=canvas.getContext("2d")!,colors=assetColors(a.pack,layer.theme,a.key);ctx.scale(bucket/128,bucket/128);ctx.lineJoin="round";ctx.lineCap="round";
  for(const p of a.paths){const hex=colors[p.role],rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)),color=art?styleColor(rgb,p.role==="water",art):rgb;ctx.fillStyle=ctx.strokeStyle=`rgb(${color.map(Math.round).join(" ")})`;ctx.lineWidth=p.width??1.2;const path=new Path2D(p.d);if(p.stroke){ctx.globalAlpha=p.role==="ink"?Math.min(1,(terrainStyle(art).ink)*.8):.8;ctx.stroke(path);}else{ctx.globalAlpha=1;ctx.fill(path);if(a.pack==="fantasy"){ctx.strokeStyle=colors.ink;ctx.lineWidth=.8;ctx.globalAlpha=.6;ctx.stroke(path);}}}
  this.bitmaps.set(key,canvas);this.metrics.preparations++;this.metrics.bytes+=canvas.width*canvas.height*4;while(this.metrics.bytes>ARTWORK_LIMITS.bitmapBytes){const oldest=this.bitmaps.keys().next().value!;const dropped=this.bitmaps.get(oldest)!;this.bitmaps.delete(oldest);this.metrics.bytes-=dropped.width*dropped.height*4;}return canvas;
 }
 private sprite(p:ArtworkPlacement,layer:ArtworkLayer,art:TerrainStyle|undefined,size:number,dpr:number,styleKey:string){
  // Small rotated sprites are prepared once at their displayed pixel size. CPU
  // fallback then copies them without resampling and rotating every pan frame.
  const pixels=Math.round(size*dpr*4)/4,key=styleKey+"|sprite|"+p.assetId+"|"+pixels+"|"+p.rotation+"|"+p.mirror,old=this.bitmaps.get(key);if(old){this.bitmaps.delete(key);this.bitmaps.set(key,old);return old;}
  const source=this.bitmap(p.assetId,layer,art,pixels);if(!source)return;const angle=p.rotation*Math.PI/180,cos=Math.abs(Math.cos(angle)),sin=Math.abs(Math.sin(angle)),canvas=document.createElement("canvas");canvas.width=Math.ceil(pixels*cos+pixels*.75*sin)+2;canvas.height=Math.ceil(pixels*sin+pixels*.75*cos)+2;const ctx=canvas.getContext("2d")!;ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(angle);ctx.scale(p.mirror?-1:1,1);ctx.drawImage(source,-pixels/2,-pixels*.375,pixels,pixels*.75);this.bitmaps.set(key,canvas);this.metrics.preparations++;this.metrics.bytes+=canvas.width*canvas.height*4;while(this.metrics.bytes>ARTWORK_LIMITS.bitmapBytes){const first=this.bitmaps.keys().next().value!,dropped=this.bitmaps.get(first)!;this.bitmaps.delete(first);this.metrics.bytes-=dropped.width*dropped.height*4;}return canvas;
 }
 draw(ctx:CanvasRenderingContext2D,view:TerrainView,world:TerrainGeometry,viewport:TerrainViewport,root:Int16Array,scene:TerrainDetailScene|undefined,sea:number,overlay:ArtworkOverlay|undefined,environment:EnvironmentLayer|undefined,water:HydroLayer|undefined,style:string,art?:TerrainStyle,materials:TerrainMaterials=EMPTY_TERRAIN_MATERIALS){
  const started=performance.now(),layer=overlay?.layer;this.metrics.drawn=this.metrics.automatic=this.metrics.manual=0;if(!layer||!layer.opacity||!layer.automatic&&(!layer.manual||!layer.placements.length))return;
  // The context is based on accepted data only. Active/preview grids may be
  // sculpting drafts and must never drive an automatic geography claim.
  if(layer.automatic){if(this.root!==root||this.scene!==scene||this.environment!==environment||this.water!==water||this.sea!==sea||this.materials!==materials){const previous=this.context,environmentChanged=this.environment!==environment,waterChanged=this.water!==water;this.materials=materials;this.root=root;this.scene=scene;this.environment=environment;this.water=water;this.sea=sea;this.context={authority:(x,y)=>manualMaterialAuthority(materials,x,y,world.wrap?world.displayWidth:null),world:{width:world.displayWidth,height:world.displayHeight,wrap:world.wrap},sea,sample:terrainSurfaceSampler(root,world,scene?{...scene,active:undefined,preview:undefined}:undefined),environment:!previous||environmentChanged?environmentSampler(environment??EMPTY_ENVIRONMENT,{width:world.displayWidth,height:world.displayHeight,wrap:world.wrap}):previous.environment,water:!previous||waterChanged?environmentalWaterIndex(water??EMPTY_HYDROLOGY,{width:world.displayWidth,height:world.displayHeight,wrap:world.wrap}):previous.water,bank:!previous||waterChanged?artworkBankIndex(water??EMPTY_HYDROLOGY,{width:world.displayWidth,height:world.displayHeight,wrap:world.wrap}):previous.bank};this.key="";}
  const planKey=JSON.stringify([viewport.left,viewport.right,viewport.top,viewport.bottom,layer.automatic,layer.pack,layer.density,layer.seed,style,art]);if(planKey!==this.key){const before=performance.now(),plan=planArtwork(layer,viewport,this.context!,style,art);this.automatic=plan.placements;this.metrics.candidates=plan.candidates;this.metrics.level=plan.level;this.metrics.plans++;this.metrics.maxPlanMs=Math.max(this.metrics.maxPlanMs,performance.now()-before);this.key=planKey;}}else{this.automatic=[];this.metrics.candidates=0;}
  ctx.save();ctx.shadowBlur=0;ctx.shadowColor="transparent";ctx.imageSmoothingEnabled=true;const base=ctx.getTransform(),dpr=Math.min(2,window.devicePixelRatio||1),styleKey=JSON.stringify([layer.theme,art]);let lastAlpha=-1;
  const draw=(p:ArtworkPlacement,manual:boolean)=>{const pixels=p.widthM*view.scale;if(pixels<2)return;const size=Math.min(320,pixels),opacity=Math.min(1,(pixels-2)/6)*p.opacity*layer.opacity*(manual?1:Math.min(1,terrainStyle(art).texture+.2));if(!opacity)return;const angle=p.rotation*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle),flip=p.mirror?-1:1,aa=(base.a*cos+base.c*sin)*flip,bb=(base.b*cos+base.d*sin)*flip,cc=-base.a*sin+base.c*cos,dd=-base.b*sin+base.d*cos;
   for(const offset of world.wrap?[-world.displayWidth,0,world.displayWidth]:[0]){const x=view.x+(p.x+offset)*view.scale,y=view.y+p.y*view.scale;if(x+size<0||x-size>viewport.width||y+size<0||y-size>viewport.height)continue;const sprite=size<=96?this.sprite(p,layer,art,size,dpr,styleKey):undefined,bitmap=sprite??this.bitmap(p.assetId,layer,art,size*dpr);if(!bitmap)continue;if(lastAlpha!==opacity){ctx.globalAlpha=opacity;lastAlpha=opacity;}if(sprite){ctx.setTransform(base);ctx.drawImage(sprite,x-sprite.width/dpr/2,y-sprite.height/dpr/2,sprite.width/dpr,sprite.height/dpr);}else{ctx.setTransform(aa,bb,cc,dd,base.a*x+base.c*y+base.e,base.b*x+base.d*y+base.f);ctx.drawImage(bitmap,-size/2,-size*.375,size,size*.75);}if(manual&&p.id===overlay?.selectedId){ctx.setTransform(aa,bb,cc,dd,base.a*x+base.c*y+base.e,base.b*x+base.d*y+base.f);ctx.globalAlpha=1;lastAlpha=1;ctx.strokeStyle=getComputedStyle(ctx.canvas).getPropertyValue("--st-focus");ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.strokeRect(-size/2-3,-size*.375-3,size+6,size*.75+6);ctx.setLineDash([]);}this.metrics.drawn++;}
  };
  if(layer.automatic)for(const p of this.automatic){draw(p,false);this.metrics.automatic++;}if(layer.manual)for(const p of layer.placements){draw(p,true);this.metrics.manual++;}ctx.restore();this.metrics.maxDrawMs=Math.max(this.metrics.maxDrawMs,performance.now()-started);
 }
 clear(){this.bitmaps.clear();this.automatic=[];this.key="";this.metrics.bytes=0;}
}
