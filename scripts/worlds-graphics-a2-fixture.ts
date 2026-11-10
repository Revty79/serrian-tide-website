/** Original synthetic acceptance geography. No external data, imagery or Earth geometry. */
import {randomUUID} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {createGrid,readTile,terrainGeometry,type TerrainGeometry} from "../src/features/worlds/terrain";
import {initializeRefinement,rootFrame,frameGeometry,isRefinementBoundary,type RefinementMeta,type TerrainFrame} from "../src/features/worlds/terrain-refinement";
import type {RegionalFixture} from "./worlds-regional-editing-fixture";
import {gridDigest} from "./worlds-regional-editing-fixture";

export const graphicsMap="a2000000-0000-4000-8000-000000000001";
export async function createGraphicsA2Fixture(f:RegionalFixture){
 const terrain=await import("../src/features/worlds/terrain-service"),refinements=await import("../src/features/worlds/terrain-refinement-service"),regions=await import("../src/features/worlds/terrain-region-service");
 await terrain.changeTerrain("world-god",f.world,{action:"create",requestId:graphicsMap,name:"A2 original synthetic continents",initial:"ocean",settings:{gridWidth:256,gridHeight:128,widthKm:6400,heightKm:3200,wrap:true,minElevation:-12000,maxElevation:12000}});
 let doc=(await terrain.getTerrain("world-god",f.world,{mapId:graphicsMap})).document!;
 const shape=terrainGeometry(doc.settings),root=createGrid(doc.baseElevation,doc.tiles,shape);
 const wrapped=(a:number,b:number)=>{const d=a-b;return d-Math.round(d);};
 for(let y=0;y<shape.height;y++)for(let x=0;x<shape.width;x++){
  const u=x/shape.width,v=y/shape.height;
  const land=(cx:number,cy:number,rx:number,ry:number,amplitude:number)=>amplitude*Math.exp(-2*((wrapped(u,cx)/rx)**2+((v-cy)/ry)**2));
  const islands=land(.57,.62,.055,.08,4800)+land(.61,.68,.025,.03,4300)+land(.64,.72,.022,.028,4300);
  const mountains=2100*Math.exp(-(((u-.29-.025*Math.sin(v*19))/.025)**2)-((v-.46)/.19)**2);
  root[y*shape.width+x]=Math.round(-4200+land(.27,.49,.23,.35,6500)+land(.77,.52,.18,.31,6400)+land(.005,.4,.09,.2,5100)+islands+mountains+150*Math.sin(u*Math.PI*14)*Math.sin(v*Math.PI*12));
 }
 const tiles=(grid:Int16Array,s:TerrainGeometry)=>Array.from({length:s.width*s.height/1024},(_,key)=>readTile(grid,key,s));
 await terrain.changeTerrain("world-god",f.world,{action:"save",requestId:randomUUID(),mapId:graphicsMap,revision:doc.revision,seaLevel:0,source:{kind:"manual"},tiles:tiles(root,shape)});
 doc=(await terrain.getTerrain("world-god",f.world,{mapId:graphicsMap})).document!;
 async function detail(name:string,parentId:string|null,parentRevision:number,parent:Int16Array,parentShape:TerrainGeometry,parentFrame:TerrainFrame,frame:TerrainFrame,size:number,alter:(x:number,y:number,z:number)=>number){
  const grid=initializeRefinement(parent,parentShape,parentFrame,frame,size,size,shape),created=await refinements.createRefinement("world-god",f.world,{action:"create",requestId:randomUUID(),mapId:graphicsMap,parentId,parentRevision,name,frame,gridWidth:size,gridHeight:size,previewHash:gridDigest(grid)});
  const index=await refinements.getRefinements("world-god",f.world,graphicsMap),meta=index.refinements.find(m=>m.id===created.refinementId)!,s=frameGeometry(meta,shape);
  for(let y=4;y<size-4;y++)for(let x=4;x<size-4;x++){
   if(isRefinementBoundary(x,y,size,size))continue;
   const taper=Math.min(1,(Math.min(x,y,size-1-x,size-1-y)-3)/16),i=y*size+x,east=frame.x+x/size*frame.width,south=frame.y+y/size*frame.height;
   grid[i]=Math.round(grid[i]+taper*(alter(east,south,grid[i])-grid[i]));
  }
  await refinements.saveRefinement("world-god",f.world,created.refinementId,{action:"save",requestId:randomUUID(),mapId:graphicsMap,revision:1,seaLevel:0,source:{kind:"manual"},tiles:tiles(grid,s)});
  return {meta:{...meta,revision:2} as RefinementMeta,shape:s,grid};
 }
 const regional=await detail("A2 accepted regional relief",null,doc.revision,root,shape,rootFrame(shape),{x:640000,y:1120000,width:1280000,height:960000},512,(x,y,z)=>z+500*Math.sin(x/53000+y/79000)*Math.sin(y/34000));
 const frame={x:1664000,y:1472000,width:64000,height:64000},center={x:1696000,y:1504000},lake={x:center.x+9000,y:center.y+5000};
 const local=await detail("A2 accepted 1024 local terrain",regional.meta.id,2,regional.grid,regional.shape,regional.meta.frame,frame,1024,(x,y,z)=>{
  let h=z+520*Math.sin((x-center.x)/1500)*Math.cos((y-center.y)/2200)+300*Math.sin((x+y)/7000);
  const radius=Math.hypot(x-lake.x,y-lake.y);if(radius<6000){const basin=200+700*Math.max(0,Math.min(1,(radius-4500)/1000));h=h+(basin-h)*Math.max(0,Math.min(1,(6000-radius)/500));}
  const channelX=center.x-12000+1200*Math.sin((y-frame.y)/8500),distance=Math.abs(x-channelX),channel=900-(y-frame.y)*.008;
  if(distance<450)h=Math.min(h,channel+(h-channel)*Math.min(1,distance/450));
  return h;
 });
 const water=await import("../src/features/worlds/terrain-hydrology-service"),hydro=await import("../src/features/worlds/terrain-hydrology");
 const points=Array.from({length:33},(_,i)=>{const y=frame.y+8000+i*1500;return {x:center.x-12000+1200*Math.sin((y-frame.y)/8500),y};});
 const node=(id:string,point:{x:number;y:number},kind:"source"|"open-end")=>({id,point,kind,elevationM:900-(point.y-frame.y)*.008,drainageM2:5e6,spillM:null});
 const radius=4500+200/700*1000;
 await water.saveTerrainHydrology("world-god",f.world,{mapId:graphicsMap,revision:0,requestId:randomUUID(),layer:hydro.hydroLayerSchema.parse({...hydro.EMPTY_HYDROLOGY,systemVersion:2,nodes:[node("a2-source",points[0],"source"),node("a2-open-end",points.at(-1)!,"open-end")],edges:[{id:"a2-stream",from:"a2-source",to:"a2-open-end",name:"Synthetic downhill stream",points,drainageM2:5e6,flowKind:"manual",exceptionReason:"",protected:true,analysisId:null,widthM:100}],lakes:[{id:"a2-lake",name:"Synthetic carved basin",rings:[Array.from({length:64},(_,i)=>({x:lake.x+radius*Math.cos(i*Math.PI/32),y:lake.y+radius*Math.sin(i*Math.PI/32)}))],levelM:400,seed:lake,spillM:null,condition:"standing",mode:"closed",inletNodeIds:[],outletNodeId:null,flowKind:"manual",exceptionReason:"",protected:true,analysisId:null,sourceIds:[],review:false}]})});
 const environment=await import("../src/features/worlds/terrain-environment-service"),{EMPTY_ENVIRONMENT}=await import("../src/features/worlds/terrain-environment");
 await environment.saveTerrainEnvironment("world-god",f.world,{mapId:graphicsMap,revision:0,requestId:randomUUID(),layer:{...EMPTY_ENVIRONMENT,regions:[{id:randomUUID(),name:"Explicit synthetic conifer stand",kind:"vegetation",shape:"brush",points:[{x:center.x-6000,y:center.y+12000}],radiusM:6000,strength:1,biome:"conifer",vegetation:"conifer",density:.65,scaleM:18,clustering:.7,protected:true}]}});
 const index=await refinements.getRefinements("world-god",f.world,graphicsMap);
 const region=(await regions.createRegionalMap("world-god",f.world,{action:"create-region",requestId:randomUUID(),parentMapId:graphicsMap,terrainId:doc.terrainId,parentRevision:doc.mapRevision!,sourceRevision:doc.revision,sourceState:index.sourceState,name:"A2 native linked regional view",frame:{x:1280000,y:1360000,width:640000,height:480000}})).id;
 const result={world:f.world,map:graphicsMap,region,regional:regional.meta,local:local.meta,center,lake,rootHash:gridDigest(root),regionalHash:gridDigest(regional.grid),localHash:gridDigest(local.grid),externalSources:[],synthetic:true};
 await writeFile(path.join(f.out,"graphics-fixture.json"),JSON.stringify(result,null,2));return result;
}
