import type {AtlasExportData} from "./atlas-export-client";
import type {ExportResource} from "./atlas-export";
import {terrainGeometry,type TerrainGeometry} from "./terrain";
import {TerrainDetailCache,type DetailPlan} from "./terrain-refinement-cache";
import {frameGeometry,lodGeometry,chooseTerrainLod,tileKeysForView,type TerrainViewport,type RefinementMeta} from "./terrain-refinement";
import type {TerrainDetailScene} from "./terrain-detail-renderer";

type Numerical=Extract<ExportResource,{kind:"numerical"}>;
export class ExportNumericalSource{
 root?:Int16Array;shape?:TerrainGeometry;
 private numerical=new Map<string,Numerical>();
 private cache?:TerrainDetailCache;
 private sceneKey="";private lastScene?:TerrainDetailScene;
 readonly metrics={rootSamples:0,detailTiles:0,peakDetailTiles:0};
 constructor(private data:AtlasExportData){}
 async load(){
  if(this.root)return;const geometry=await this.data.resource("geometry");if(geometry.kind!=="geometry"||!("settings" in geometry.value))throw Error("This source is not numerical terrain.");const g=geometry.value,shape=terrainGeometry(g.settings),grid=new Int16Array(shape.width*shape.height);grid.fill(g.baseElevation);
  for(let offset=0;offset<g.tiles.length;offset+=32){this.data.progress(`Reading verified terrain objects ${Math.min(offset+32,g.tiles.length)} of ${g.tiles.length}…`);for(const tile of await this.data.tiles("geometry",Array.from({length:Math.min(32,g.tiles.length-offset)},(_,i)=>offset+i)))for(let row=0;row<32;row++)grid.set(tile.samples.slice(row*32,row*32+32),(tile.y*32+row)*shape.width+tile.x*32);}
  this.data.check();this.root=grid;this.shape=shape;this.metrics.rootSamples=grid.length;
  for(const descriptor of this.data.manifest.resources)if(descriptor.key.startsWith("refinement:")){const value=await this.data.resource(descriptor.key);if(value.kind!=="numerical")throw Error("An accepted detail descriptor is incompatible.");this.numerical.set(descriptor.key,value);}
 }
 async scene(view:TerrainViewport,density:number){
  await this.load();this.data.check();const key=JSON.stringify([view,density]);if(key===this.sceneKey&&this.lastScene)return this.lastScene;
  const shape=this.shape!,rootId=(await this.data.resource("geometry"));if(rootId.kind!=="geometry"||!("terrainId" in rootId.value))throw Error("The saved numerical root is missing.");
  const rootGeometry=rootId.value,values=[...this.numerical],level=(value:Numerical,seen=new Set<string>()):number=>{if(seen.has(value.sourceId))throw Error("The retained numerical parent graph is cyclic.");seen.add(value.sourceId);if(!value.parentId||value.parentId===rootGeometry.terrainId)return 1;const parent=values.find(([,p])=>p.sourceId===value.parentId)?.[1];if(!parent)throw Error("A retained numerical parent is unavailable.");return 1+level(parent,seen);};
  const plans:{key:string;resource:Numerical;plan:DetailPlan}[]=[];
  for(const [resourceKey,value]of values){
   const meta:RefinementMeta={id:value.sourceId,worldId:this.data.manifest.worldId,terrainId:value.terrainId,mapId:this.data.manifest.target.id,name:"Retained export detail",parentId:value.parentId===value.terrainId?null:value.parentId,parentRevision:value.parentRevision??0,level:level(value),revision:value.revision,frame:value.frame,gridWidth:value.gridWidth,gridHeight:value.gridHeight,overviewLevels:Math.log2(Math.min(value.gridWidth,value.gridHeight)/32),updatedAt:""},local=frameGeometry(meta,shape),lod=chooseTerrainLod(local,view.scale*density),keys=[...tileKeysForView(meta.frame,lodGeometry(local,lod),view,shape)];
   if(keys.length)plans.push({key:resourceKey,resource:value,plan:{meta,lod,keys}});
  }
  plans.sort((a,b)=>a.plan.meta.level-b.plan.meta.level||a.plan.meta.id.localeCompare(b.plan.meta.id));const count=plans.reduce((n,p)=>n+p.plan.keys.length,0);if(count>2048)throw Error("This output view needs more than the existing 2,048-detail-tile cache. Choose a smaller area, smaller paper or lower DPI; no detail was omitted.");
  this.cache?.dispose();const cache=new TerrainDetailCache(async()=>{throw Error("Exports load only explicitly pinned numerical batches.");});this.cache=cache;
  for(const item of plans){const {plan,resource}=item,cols=resource.gridWidth/2**plan.lod/32,refs=new Map(resource.tiles.map((t,i)=>[t.lod+":"+(t.y*(resource.gridWidth/2**t.lod/32)+t.x),i]));
   for(let offset=0;offset<plan.keys.length;offset+=32){const keys=plan.keys.slice(offset,offset+32),indexes=keys.map(k=>refs.get(plan.lod+":"+k));if(indexes.some(i=>i===undefined))throw Error("A required retained numerical detail object is missing. Restore its source backup before exporting.");
    const tiles=await this.data.tiles(item.key,indexes as number[]);
    // The cache's unused source receipt remains explicitly unknown; it is never
    // exported as authoring provenance or used to write a map.
    await cache.accept({...plan,keys},{refinement:plan.meta,headRevision:resource.revision,lod:plan.lod,tiles:tiles.map(t=>({x:t.x,y:t.y,samples:t.samples,mask:"0".repeat(256),sha256:t.sha256})),source:{kind:"legacy"},acceptedRequestId:this.data.manifest.pin.sha256,rootRevision:rootId.value.revision,seaLevel:rootId.value.seaLevel,canEdit:false});
    if(tiles.some(t=>t.y*cols+t.x>=cols*(resource.gridHeight/2**plan.lod/32)))throw Error("A numerical object is outside its exact source extent.");
   }
  }
  this.metrics.detailTiles=count;this.metrics.peakDetailTiles=Math.max(this.metrics.peakDetailTiles,count);this.sceneKey=key;return this.lastScene={cache,plans:plans.map(p=>p.plan),tick:1};
 }
 dispose(){this.cache?.dispose();this.cache=undefined;this.root=undefined;this.shape=undefined;this.numerical.clear();this.lastScene=undefined;}
}
