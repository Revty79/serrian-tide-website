import {paintTownFeature} from "./town-map-art";
import {paintTownRoadNetwork} from "./town-road-art";
import {townBounds,townLayer,townLayers} from "./town-map";
import {alignedFloorDesign,alignedFloorPoint,alignedFloorAngle} from "./building-floor-alignment";
import {paintFloor,type FloorView} from "./building-floor-art";
import {paintUnderground} from "./underground-art";
import {CompositionPainter} from "./atlas-asset-canvas";
import type {CompositionOverlay} from "./atlas-asset-client";
import {artworkAsset} from "./terrain-artwork-assets";
import {emptyComposition,type AssetComposition} from "./atlas-assets";
import type {AtlasExportData} from "./atlas-export-client";
import {checkImageSize,type ExportOptions,type ExportFrame,type ExportResource} from "./atlas-export";
import {TerrainExportPainter} from "./atlas-export-terrain";

const palette={paper:"#f4efdf",ink:"#34372f",wood:"#a08a63",accent:"#487c7b",stone:"#aaa79a"};
export const exportYield=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
/** Output orchestration only; every native structure/artwork uses its existing painter. */
export class AtlasExportPainter{
 private terrain?:TerrainExportPainter;
 private composition=new CompositionPainter(()=>{});
 readonly metrics={mapRenders:0,renderedTiles:0,peakCanvasPixels:0,peakTilePixels:0,maxNativeWallMs:0,townArtMarks:0};
 constructor(readonly data:AtlasExportData){}
 async render(canvas:HTMLCanvasElement,bounds:ExportFrame,width:number,height:number,options:ExportOptions,density=Math.max(1,width/1600)){
  this.data.check();checkImageSize(width,height);canvas.width=width;canvas.height=height;const out=canvas.getContext("2d");if(!out)throw Error("The requested image surface is unavailable. Lower the resolution and retry.");this.metrics.peakCanvasPixels=Math.max(this.metrics.peakCanvasPixels,width*height);const scale=Math.min(width/bounds.width,height/bounds.height),padX=(width-bounds.width*scale)/2,padY=(height-bounds.height*scale)/2;
  const tile=document.createElement("canvas");try{const count=Math.ceil(width/1024)*Math.ceil(height/1024);let done=0;for(let y=0;y<height;y+=1024)for(let x=0;x<width;x+=1024){this.data.check();const w=Math.min(1024,width-x),h=Math.min(1024,height-y),halo=2;this.data.progress(`Drawing map tile ${++done} of ${count}…`);await this.renderTile(tile,{x:bounds.x+(x-padX-halo)/scale,y:bounds.y+(y-padY-halo)/scale,width:(w+2*halo)/scale,height:(h+2*halo)/scale},w+2*halo,h+2*halo,options,density);out.drawImage(tile,halo,halo,w,h,x,y,w,h);await exportYield();}
   const geometry=await this.data.resource("geometry"),view:FloorView={left:bounds.x-padX/scale,top:bounds.y-padY/scale,scale:scale/density,width:width/density,height:height/density};if(geometry.kind==="geometry"&&"settings"in geometry.value){out.save();out.scale(density,density);if(options.style==="monochrome")out.filter="grayscale(1)";await this.terrain?.decorations(out,geometry.value,view,options);out.restore();}this.metrics.mapRenders++;return{view,density};
  }finally{tile.width=tile.height=0;}
 }
 private async renderTile(canvas:HTMLCanvasElement,bounds:ExportFrame,width:number,height:number,options:ExportOptions,density:number){
  this.data.check();checkImageSize(width,height);canvas.width=width;canvas.height=height;this.metrics.peakTilePixels=Math.max(this.metrics.peakTilePixels,width*height);const ctx=canvas.getContext("2d");if(!ctx)throw Error("This browser cannot allocate the requested map surface. Lower the resolution or DPI and retry.");
  const g=await this.data.resource("geometry");if(g.kind!=="geometry")throw Error("The selected native geometry is unavailable.");const logicalWidth=width/density,logicalHeight=height/density,scale=Math.min(logicalWidth/bounds.width,logicalHeight/bounds.height),padX=(logicalWidth-bounds.width*scale)/2,padY=(logicalHeight-bounds.height*scale)/2,view:FloorView={left:bounds.x-padX/scale,top:bounds.y-padY/scale,scale,width:logicalWidth,height:logicalHeight};
  ctx.scale(density,density);ctx.save();ctx.beginPath();ctx.rect(0,0,logicalWidth,logicalHeight);ctx.clip();if(options.style==="monochrome")ctx.filter="grayscale(1)";if(!options.transparent){ctx.fillStyle=palette.paper;ctx.fillRect(0,0,logicalWidth,logicalHeight);}
  if("settings"in g.value){
   this.terrain??=new TerrainExportPainter(this.data);await this.terrain.render(ctx,g.value,view,options,density,async tier=>this.paintComposition(ctx,view,tier,options));
  }else{
   const geo=g.value,design=structuredClone("plan"in geo?geo.plan:geo.design),layers=new Set(options.layers);for(const [key,layer]of Object.entries(design.layers))layer.visible=layer.visible&&layers.has(key);if(options.transparent&&"ground"in design.layers)design.layers.ground.visible=false;
   const drawStart=performance.now();
   if(geo.family==="town"){
    const town=design as import("./town-map").TownDesign,project=(p:{x:number;y:number})=>({x:(p.x-view.left)*scale,y:(p.y-view.top)*scale}),a=project({x:0,y:0});
    ctx.save();ctx.beginPath();ctx.rect(a.x,a.y,geo.frame.width*scale,geo.frame.height*scale);ctx.clip();
    if(layers.has("ground")&&!options.transparent){ctx.fillStyle=palette.paper;ctx.fillRect(a.x,a.y,geo.frame.width*scale,geo.frame.height*scale);const backdrop=await this.data.optional("backdrop");if(backdrop?.kind==="backdrop")this.paintBackdrop(ctx,backdrop.value,geo.frame,view);}
    await this.paintComposition(ctx,view,"reference",options);
    const art={...palette,selection:palette.accent,water:"#91b1ad",river:"#497d8c",land:"#afbc86",width:logicalWidth,height:logicalHeight},budget={remaining:9000},features=town.features.filter(f=>!f.archived&&town.layers[townLayer(f.kind)].visible).sort((a,b)=>townLayers.indexOf(townLayer(a.kind))-townLayers.indexOf(townLayer(b.kind))),roads=features.filter(f=>f.kind==="road"),presentation=await this.data.optional("presentation"),ruins=new Set(presentation?.kind==="presentation"?presentation.ruins:[]);let roadsDrawn=false,slice=performance.now();
    for(const f of features){if(!roadsDrawn&&f.kind!=="water"){paintTownRoadNetwork(ctx,roads,project,scale,"",palette.accent,budget,logicalWidth,logicalHeight);roadsDrawn=true;}const b=townBounds(f),lo=project(b),hi=project({x:b.x+b.width,y:b.y+b.height});if(hi.x< -30||hi.y< -30||lo.x>logicalWidth+30||lo.y>logicalHeight+30)continue;
     if(f.kind!=="road")paintTownFeature(ctx,f,f.points.map(project),scale,art,false,budget,town.recipe?.culture,ruins.has(f.id)?"ruined":undefined);
     if(f.name&&layers.has("labels")&&(Math.max(b.width,b.height)*scale>55||f.shape==="point")){const p=project({x:f.points.reduce((n,p)=>n+p.x,0)/f.points.length,y:f.points.reduce((n,p)=>n+p.y,0)/f.points.length});ctx.font="12px Georgia,serif";ctx.textAlign="center";ctx.lineWidth=3;ctx.strokeStyle=palette.paper;ctx.strokeText(f.name,p.x,p.y);ctx.fillStyle=palette.ink;ctx.fillText(f.name,p.x,p.y);}
     if(performance.now()-slice>6){await exportYield();this.data.check();slice=performance.now();}
    }
    if(!roadsDrawn)paintTownRoadNetwork(ctx,roads,project,scale,"",palette.accent,budget,logicalWidth,logicalHeight);this.metrics.townArtMarks=Math.max(this.metrics.townArtMarks,9000-budget.remaining);ctx.restore();
   }else{
    let floorDesign=design as import("./building-floor").FloorDesign;let localFrame=geo.frame;if(geo.family==="floor"){const a=await this.data.optional("alignment");if(a?.kind==="alignment"){const alignment={...a.value,frame:{...a.value.frame,rotation:0}};floorDesign=alignedFloorDesign(floorDesign,alignment);localFrame=alignment.frame;}}if(!layers.has("annotations"))floorDesign.features=floorDesign.features.map(f=>({...f,name:""}));
    const frame={x:0,y:0,...localFrame,rotation:0};if(geo.family==="underground"){
     const d=floorDesign as import("./underground").UndergroundDesign;paintUnderground(ctx,{...d,features:[]},frame,view,palette);await this.paintComposition(ctx,view,"reference",options);paintUnderground(ctx,d,frame,view,palette,true);
    }else{const d=floorDesign;paintFloor(ctx,{...d,features:[]},frame,view,palette);await this.paintComposition(ctx,view,"reference",options);paintFloor(ctx,d,frame,view,palette,true);}
   }
   this.metrics.maxNativeWallMs=Math.max(this.metrics.maxNativeWallMs,performance.now()-drawStart);await this.paintComposition(ctx,view,"overlay",options);
  }
  ctx.restore();this.data.check();this.metrics.renderedTiles++;return{view,density};
 }
 private paintBackdrop(ctx:CanvasRenderingContext2D,b:Extract<ExportResource,{kind:"backdrop"}>["value"],frame:{width:number;height:number},v:FloorView){
  const ground=document.createElement("canvas");ground.width=ground.height=b.size;try{const paint=ground.getContext("2d")!,pixels=paint.createImageData(b.size,b.size);for(let i=0;i<b.heights.length;i++){const neighbor=b.heights[Math.floor(i/b.size)*b.size+Math.min(b.size-1,i%b.size+1)],shade=Math.max(-18,Math.min(12,(neighbor-b.heights[i])/Math.max(1,b.spacing)*-18)),color=b.wet[i]?[141,177,173]:[213,207,169];for(let c=0;c<3;c++)pixels.data[i*4+c]=color[c]+shade;pixels.data[i*4+3]=255;}paint.putImageData(pixels,0,0);ctx.imageSmoothingEnabled=true;ctx.drawImage(ground,-v.left*v.scale,-v.top*v.scale,frame.width*v.scale,frame.height*v.scale);if(b.water){ctx.fillStyle="#8db1ad";ctx.strokeStyle="#497d8c";for(const lake of b.water.lakes){ctx.beginPath();for(const ring of lake){ring.forEach((p,i)=>{const x=(p.x-v.left)*v.scale,y=(p.y-v.top)*v.scale;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.closePath();}ctx.fill("evenodd");}ctx.lineCap="round";for(const line of b.water.lines){ctx.lineWidth=Math.max(.7,line.width*v.scale);ctx.beginPath();line.points.forEach((p,i)=>{const x=(p.x-v.left)*v.scale,y=(p.y-v.top)*v.scale;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.stroke();}}}finally{ground.width=ground.height=0;}
 }
 private async paintComposition(ctx:CanvasRenderingContext2D,view:FloorView,tier:"reference"|"overlay",options:ExportOptions){
  if(!options.layers.includes("composition"))return;
  const resource=await this.data.optional("composition"),layer:AssetComposition=resource?.kind==="composition"?structuredClone(resource.value):emptyComposition(),frame={...view,wrapWidth:this.data.manifest.wrapWidth??undefined};
  const align=await this.data.optional("alignment");if(align?.kind==="alignment"&&align.value.angle){const a={...align.value,frame:{...align.value.frame,rotation:0}};layer.placements=layer.placements.map(p=>({...p,...alignedFloorPoint(p,a),rotation:alignedFloorAngle(p.rotation,a)}));}
  const overlay:CompositionOverlay={layer:{...layer,placements:layer.placements.filter(p=>!!artworkAsset(p.assetId))},worldId:this.data.manifest.worldId,review:this.data.review,selected:"",active:false,retryEpoch:0,reportError:message=>{throw Error(message);},select:()=>{},place:()=>{},edit:()=>{},preview:()=>{}};this.composition.draw(ctx,overlay,frame,tier);
  if(!options.uploadedArtwork)return;
  for(const p of layer.placements){if(p.tier!==tier||!p.visible||p.opacity<=0||artworkAsset(p.assetId))continue;for(const offset of frame.wrapWidth?[-frame.wrapWidth,0,frame.wrapWidth]:[0]){const x=(p.x+offset-view.left)*view.scale,y=(p.y-view.top)*view.scale,w=p.width*view.scale,h=p.height*view.scale,r=Math.hypot(w,h)/2;if(x+r<0||y+r<0||x-r>view.width||y-r>view.height)continue;const image=await this.data.image(p.assetId,p.version);ctx.save();ctx.translate(x,y);ctx.rotate(p.rotation*Math.PI/180);ctx.scale(p.flipX?-1:1,p.flipY?-1:1);ctx.globalAlpha*=p.opacity;ctx.drawImage(image,-w/2,-h/2,w,h);ctx.restore();this.data.check();}}
 }
 dispose(){this.terrain?.dispose();this.composition.dispose();}
}
