import type {AtlasExportData} from "./atlas-export-client";
import type {ExportOptions} from "./atlas-export";
import type {ConsumptionGeometry} from "./atlas-map-consumption";
import type {FloorView} from "./building-floor-art";
import {ExportNumericalSource} from "./atlas-export-numerical";
import {paintTerrainTile,terrainRenderKeys} from "./terrain-renderer";
import {TerrainDetailPainter} from "./terrain-detail-renderer";
import {TerrainCartographyPainter} from "./terrain-cartography-painter";
import {TerrainSurfacePainter} from "./terrain-surface-painter";
import {TerrainEngravingPainter} from "./terrain-engraving-painter";
import {TerrainEnvironmentPainter} from "./terrain-environment-painter";
import {TerrainArtworkPainter} from "./terrain-artwork-painter";
import {TerrainLabelsPainter} from "./terrain-labels-painter";
import {DEFAULT_MAP_APPEARANCE,appearanceRelief,mapAppearanceSchema,type MapAppearance} from "./terrain-appearance";
import {DEFAULT_ENGRAVING} from "./terrain-engraving";
import {EMPTY_TERRAIN_MATERIALS} from "./terrain-materials";
import {EMPTY_ENVIRONMENT} from "./terrain-environment";
import {EMPTY_HYDROLOGY} from "./terrain-hydrology";
import {EMPTY_ARTWORK} from "./terrain-artwork";
import {EMPTY_LABELS,type LabelsLayer} from "./terrain-labels";
import {drawHydrology} from "./terrain-hydrology-overlay";
import {regionDisplayParts} from "./terrain-region-geometry";
import {drawCraftMarkers} from "./craft-markers";
import {paintNativeTerritories} from "./native-map-history-territory-painter";
import {clipTerrainRegion} from "./terrain-region-view";
import {DEFAULT_MEASUREMENT_PREFERENCES} from "./terrain-units";
import {artworkAsset} from "./terrain-artwork-assets";

type Geometry=Extract<ConsumptionGeometry,{family:"world"|"regional"}>;
const yieldTask=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
export class TerrainExportPainter{
 private numerical:ExportNumericalSource;private detail=new TerrainDetailPainter();private cartography=new TerrainCartographyPainter();private surface=new TerrainSurfacePainter();private engraved=new TerrainEngravingPainter(()=>{});private environment=new TerrainEnvironmentPainter(()=>{});private artwork=new TerrainArtworkPainter();private labels=new TerrainLabelsPainter();
 private texture?:HTMLCanvasElement;private textureSpec="";private assets=new Set<string>();
 readonly metrics={maxPainterBatchMs:0,peakRootPixels:0,peakDetailBytes:0,peakSurfaceBytes:0,peakEnvironmentBytes:0,peakEngravingBytes:0,peakCartographyBytes:0,labelBudgetHidden:0};
 constructor(private data:AtlasExportData){this.numerical=new ExportNumericalSource(data);}
 private spec(o:ExportOptions):MapAppearance{const saved=this.data.manifest.appearance??DEFAULT_MAP_APPEARANCE;if(o.style==="saved"||o.style==="monochrome")return saved;return mapAppearanceSchema.parse({...saved,style:o.style,version:o.style==="engraved-fantasy"?3:o.style==="realistic-terrain"?2:1,...o.style==="engraved-fantasy"?{engraving:saved.engraving??DEFAULT_ENGRAVING}:{}});}
 private async wait(work:()=>void,pending:()=>boolean){const deadline=performance.now()+120000;do{this.data.check();const start=performance.now();work();this.metrics.maxPainterBatchMs=Math.max(this.metrics.maxPainterBatchMs,performance.now()-start);if(!pending())return;if(performance.now()>deadline)throw Error("Map artwork did not finish within the bounded export window. Cancel and retry at lower resolution, or omit that display layer.");await yieldTask();}while(true);}
 async render(ctx:CanvasRenderingContext2D,g:Geometry,v:FloorView,o:ExportOptions,density:number,composition:(tier:"reference"|"overlay")=>Promise<void>){
  await this.numerical.load();const root=this.numerical.root!,shape=this.numerical.shape!,view={x:-v.left*v.scale,y:-v.top*v.scale,scale:v.scale},viewport={left:v.left,top:v.top,right:v.left+v.width/v.scale,bottom:v.top+v.height/v.scale,scale:v.scale,width:v.width,height:v.height},scene=await this.numerical.scene(viewport,density),spec=this.spec(o),relief=appearanceRelief(spec),layers=new Set(o.layers),materials=await this.data.optional("materials"),env=await this.data.optional("environment"),hydro=await this.data.optional("hydrology"),art=await this.data.optional("artwork"),labels=await this.data.optional("labels"),materialLayer=layers.has("materials")&&materials?.kind==="materials"?materials.value:EMPTY_TERRAIN_MATERIALS,environmentLayer=layers.has("environment")&&env?.kind==="environment"?env.value:EMPTY_ENVIRONMENT,water=layers.has("hydrology")&&hydro?.kind==="hydrology"?hydro.value:EMPTY_HYDROLOGY;
  ctx.save();clipTerrainRegion(ctx,view,g.region?.frame,shape.displayWidth,shape.wrap,g.region?.footprint??undefined);const key=JSON.stringify(relief);
  if(layers.has("terrain")){
   if(!this.texture||key!==this.textureSpec){if(this.texture)this.texture.width=this.texture.height=0;this.texture=document.createElement("canvas");this.texture.width=shape.width;this.texture.height=shape.height;const target=this.texture.getContext("2d")!;let slice=performance.now();for(const tile of terrainRenderKeys(undefined,shape)){target.putImageData(paintTerrainTile(root,g.seaLevel,tile,shape,relief),tile%(shape.width/32)*32,Math.floor(tile/(shape.width/32))*32);if(performance.now()-slice>6){await yieldTask();this.data.check();slice=performance.now();}}this.textureSpec=key;this.metrics.peakRootPixels=Math.max(this.metrics.peakRootPixels,shape.width*shape.height);}
   ctx.imageSmoothingEnabled=true;for(const offset of shape.wrap?[-shape.displayWidth,0,shape.displayWidth]:[0])ctx.drawImage(this.texture,view.x+offset*v.scale,view.y,shape.displayWidth*v.scale,shape.displayHeight*v.scale);
   if(spec.style==="topographic"||spec.style==="illustrated-fantasy"){
    this.cartography.sync(root,shape,scene,viewport,g.seaLevel,spec,density);await this.wait(()=>this.cartography.paint(4),()=>this.cartography.pending>0);this.cartography.draw(ctx,view,shape);
   }else if(spec.style==="realistic-terrain"){
    this.surface.sync(root,shape,scene,viewport,g.seaLevel,spec.relief,materialLayer,density,spec.art);await this.wait(()=>this.surface.paint(4),()=>this.surface.pending>0||this.surface.waitingForAssets);if(this.surface.assetState==="error")throw Error("The exact installed surface artwork is unavailable. Retry its resources or select another appearance before exporting.");this.surface.draw(ctx,view);
   }else if(spec.style==="engraved-fantasy"){
    this.engraved.sync(root,shape,scene,viewport,g.seaLevel,spec,environmentLayer,water,materialLayer,density,true);await this.wait(()=>this.engraved.paint(4),()=>this.engraved.pending>0);this.engraved.draw(ctx,view,shape);
   }else{this.detail.sync(scene,shape,g.seaLevel,relief,viewport,root,density);await this.wait(()=>this.detail.paint(shape,g.seaLevel,relief,4),()=>this.detail.pending>0);this.detail.draw(ctx,view,shape,scene);}
  }
  if(layers.has("environment")||layers.has("materials")){
   this.environment.sync(root,shape,scene,viewport,g.seaLevel,spec.style,layers.has("environment")?{layer:environmentLayer}:undefined,water,materialLayer,density,spec.art,spec.relief,128);await this.wait(()=>this.environment.paint(4),()=>this.environment.pending>0);this.environment.draw(ctx,view);
  }
  await composition("reference");if(layers.has("hydrology"))drawHydrology(ctx,view,{width:shape.displayWidth,height:shape.displayHeight,wrap:shape.wrap},{layer:water,suggestions:null,selected:null,selectedPreview:false},spec.style,spec.art,spec.engraving);
  if(layers.has("artwork")){const layer=art?.kind==="artwork"?art.value:EMPTY_ARTWORK;this.artwork.draw(ctx,view,shape,viewport,root,scene,g.seaLevel,{layer:spec.style==="engraved-fantasy"?{...layer,automatic:false}:layer},environmentLayer,water,spec.style,spec.art,materialLayer,spec.engraving);for(const id of this.artwork.visibleAssets)this.assets.add(id);}
  if(layers.has("positions")){const presentation=await this.data.optional("presentation");if(presentation?.kind==="presentation")drawCraftMarkers(ctx,{markers:presentation.crafts,selected:"",choosing:false,point:null,rotation:0},view,shape.displayWidth,shape.wrap,v.width,v.height,"#34372f","#f7efcc");if(presentation?.kind==="presentation")for(const p of presentation.places)for(const offset of shape.wrap?[-shape.displayWidth,0,shape.displayWidth]:[0]){const x=(p.x+offset-v.left)*v.scale,y=(p.y-v.top)*v.scale;if(x< -160||y< -20||x>v.width+160||y>v.height+20)continue;ctx.fillStyle="#f7efcc";ctx.strokeStyle="#34372f";ctx.lineWidth=1.2;ctx.fillRect(x-3,y-3,6,6);ctx.strokeRect(x-3,y-3,6,6);if(layers.has("labels")){ctx.font="12px Georgia,serif";ctx.textAlign="left";ctx.lineWidth=3;ctx.strokeStyle="#f4efdf";ctx.strokeText(p.name,x+7,y+4);ctx.fillStyle="#34372f";ctx.fillText(p.name,x+7,y+4);}}}
  if(layers.has("politics")){const p=await this.data.optional("politics");if(p?.kind==="politics")paintNativeTerritories(ctx,{territories:layers.has("labels")?p.territories:p.territories.map(t=>({...t,name:""})),year:p.year},view,{displayWidth:shape.displayWidth,wrap:shape.wrap},{known:"#696051",unknown:"#877a86",text:"#34372f"});}
  ctx.restore();
  if(layers.has("labels")&&labels?.kind==="labels"){
   const layer=this.labelLayer(labels.value,o,true);this.labels.draw(ctx,view,{width:shape.displayWidth,height:shape.displayHeight,wrap:shape.wrap},v.width,v.height,{layer},spec.style,DEFAULT_MEASUREMENT_PREFERENCES,[],{...spec,engraving:spec.engraving?{...spec.engraving,ornaments:false}:undefined},g.region?.frame,g.region?.footprint??undefined);this.metrics.labelBudgetHidden=Math.max(this.metrics.labelBudgetHidden,this.labels.metrics.budgetHidden);if(this.labels.metrics.budgetHidden)throw Error("This selected view exceeds the existing label drawing budget. Choose a smaller area or omit labels; no partial label layer was downloaded.");
  }
  await composition("overlay");if(layers.has("boundary")&&g.region){ctx.save();clipTerrainRegion(ctx,view,g.region.frame,shape.displayWidth,shape.wrap,g.region.footprint??undefined);ctx.strokeStyle="#494334";ctx.lineWidth=1.2;for(const offset of shape.wrap?[-shape.displayWidth,0,shape.displayWidth]:[0]){ctx.beginPath();if(g.region.footprint){for(const part of regionDisplayParts({frame:g.region.frame,footprint:g.region.footprint},shape.displayWidth,shape.wrap)){part.forEach((p,i)=>{const x=view.x+(p.x+offset)*v.scale,y=view.y+p.y*v.scale;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.closePath();}}else ctx.rect(view.x+(g.region.frame.x+offset)*v.scale,view.y+g.region.frame.y*v.scale,g.region.frame.width*v.scale,g.region.frame.height*v.scale);ctx.stroke();}ctx.restore();}
  this.metrics.peakDetailBytes=Math.max(this.metrics.peakDetailBytes,this.detail.bytes);this.metrics.peakSurfaceBytes=Math.max(this.metrics.peakSurfaceBytes,this.surface.bytes);this.metrics.peakEnvironmentBytes=Math.max(this.metrics.peakEnvironmentBytes,this.environment.bytes);this.metrics.peakEngravingBytes=Math.max(this.metrics.peakEngravingBytes,this.engraved.bytes);this.metrics.peakCartographyBytes=Math.max(this.metrics.peakCartographyBytes,this.cartography.bytes);
 }
 private labelLayer(input:LabelsLayer,o:ExportOptions,tile:boolean):LabelsLayer{const layer=structuredClone(input);for(const part of [layer.composition.scale,layer.composition.north])part.visible=false;if(tile)for(const part of Object.values(layer.composition))part.visible=false;else{layer.labels=[];layer.composition.title.visible=layer.composition.title.visible&&o.title;}return layer;}
 async decorations(ctx:CanvasRenderingContext2D,g:Geometry,v:FloorView,o:ExportOptions){if(!o.layers.includes("labels"))return;const resource=await this.data.optional("labels"),layer=this.labelLayer(resource?.kind==="labels"?resource.value:EMPTY_LABELS,o,false),spec=this.spec(o),shape=this.numerical.shape!;this.labels.draw(ctx,{x:-v.left*v.scale,y:-v.top*v.scale,scale:v.scale},{width:shape.displayWidth,height:shape.displayHeight,wrap:shape.wrap},v.width,v.height,{layer},spec.style,DEFAULT_MEASUREMENT_PREFERENCES,[...this.assets].map(id=>artworkAsset(id)?.name??"").filter(Boolean),spec,g.region?.frame,g.region?.footprint??undefined);}
 dispose(){if(this.texture)this.texture.width=this.texture.height=0;this.numerical.dispose();this.detail.clear();this.cartography.clear();this.surface.dispose();this.engraved.dispose();this.environment.dispose();this.artwork.clear();this.labels.clear();this.assets.clear();}
}
