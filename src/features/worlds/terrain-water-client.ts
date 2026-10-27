"use client";
import {useEffect,useMemo,useState} from "react";
import {useTerrainHydrology} from "./terrain-hydrology-client";
import {type HydroAnalysis,type HydroCatchment,type HydroLake,type HydroLayer,type HydroPoint} from "./terrain-hydrology";
import {acceptLake,affectedWater,alignWaterPorts,closeWaterLake,connectWaterLake,connectedWater,disconnectWater,editWaterLake,insertWaterControl,joinWaterRivers,removeWaterControl,removeWaterLake,waterNetwork} from "./terrain-water-network";
import {insideWaterRings,waterBounds,waterPoint} from "./terrain-water-geometry";
import {hitHydrology} from "./terrain-hydrology-overlay";
import type {TerrainFrame} from "./terrain-refinement";
import type {HydroWorkerRequest} from "./terrain-hydrology-worker";

type Mode="select"|"draw-lake"|"move-shore"|"insert-shore"|"insert-control"|"join-river"|"watershed";
export function useTerrainWater(api:string,mapId:string,editable:boolean,sourceEpoch:string){
  const base=useTerrainHydrology(api,mapId,editable,sourceEpoch),[lakeId,setLakeId]=useState<string|null>(null),[lakePreview,setLakePreview]=useState(false),[mode,setMode]=useState<Mode>("select"),[drawing,setDrawing]=useState<HydroPoint[]>([]),[ringIndex,setRingIndex]=useState(0),[vertex,setVertex]=useState(0),[review,setReview]=useState<HydroLayer|null>(null),[watershed,setWatershed]=useState<{data:HydroCatchment;analysis:HydroAnalysis}>(),[watershedShown,setWatershedShown]=useState(true),[networkShown,setNetworkShown]=useState(false),[issues,setIssues]=useState<{id:string;message:string}[]>([]),[frame,setFrame]=useState<TerrainFrame>();
  const layer=base.layer,sources=base.sources,lake=(lakePreview?base.preview?.lakes:layer.lakes)?.find(l=>l.id===lakeId),world=sources?.world;
  useEffect(()=>{const before=(event:BeforeUnloadEvent)=>{if(drawing.length)event.preventDefault();};window.addEventListener("beforeunload",before);return()=>window.removeEventListener("beforeunload",before);},[drawing.length]);
  const {onExtra,reportNotice}=base;
  useEffect(()=>onExtra(value=>{
    if(value.type==="watershed"){setWatershed({data:value.catchment,analysis:value.analysis});setWatershedShown(true);reportNotice("Provisional watershed reviewed. Its shading is separate from terrain; keep it in the draft only if wanted.");}
    else if(value.type==="lake-review"){setReview(value.layer);reportNotice("Lake level and outlet proposal prepared. Existing shoreline and rivers remain unchanged until you accept it.");}
    else if(value.type==="review"){setIssues(value.issues);reportNotice(value.issues.length?value.issues.length+" water connections need review. Existing authoring was retained.":"No uphill sampled paths or detached endpoints were found in this review. Sampling remains provisional.");}
  }),[onExtra,reportNotice]);
  function perform(action:()=>HydroLayer,notice:string){try{if(base.change(action()))base.reportNotice(notice);}catch(e){base.reportError(e);}}
  function selectLake(id:string|null,preview:boolean){setLakeId(id);setLakePreview(preview);setMode("select");base.setSelection(null,false);base.setMode("select");}
  function begin(next:Mode,selectedFrame?:TerrainFrame,index=0,ring=0){if(!base.canEdit&&next!=="watershed")return;setMode(next);if(selectedFrame)setFrame(selectedFrame);setVertex(index);setRingIndex(ring);base.setMode("select");if(next==="draw-lake"){setDrawing([]);setLakeId(null);setLakePreview(false);base.setSelection(null,false);}base.reportNotice(next==="draw-lake"?"Tap shoreline corners on the map, then finish the lake. Ground elevations remain unchanged.":next==="join-river"?"Choose another authored river. Its path will split at the chosen junction; connections remain explicit.":next==="watershed"?"Choose the downstream drainage destination to inspect.":"Choose the new control position on the map.");}
  const waterSettings=(f:TerrainFrame)=>({lakeMinimumAreaM2:Math.max(1,f.width*f.height/10000),lakeMinimumDepthM:2});
  function request(action:(analysis:HydroAnalysis)=>HydroWorkerRequest,f?:TerrainFrame){if(!world)return;const area=f??frame??{x:0,y:0,width:world.width,height:world.height};void base.suggest(area,Math.max(1,area.width*area.height/2000),waterSettings(area),action);}
  const authoredPins=()=>sources?.sources.map(s=>({id:s.id,revision:s.revision,lod:0,contentHash:s.contentHash,spacingX:s.frame.width/s.gridWidth,spacingY:s.frame.height/s.gridHeight}));
  function finishLake(name:string,levelM:number){if(!world||drawing.length<3)return;const seed=waterPoint({x:drawing.reduce((n,p)=>n+p.x,0)/drawing.length,y:drawing.reduce((n,p)=>n+p.y,0)/drawing.length},world),id="lake:"+crypto.randomUUID(),newLake:HydroLake={id,name:name.trim()||"Authored lake",rings:[drawing],seed,levelM,spillM:null,condition:"standing",mode:"closed",inletNodeIds:[],outletNodeId:null,flowKind:"manual",exceptionReason:"",protected:true,analysisId:null,sourceIds:[],authoredPins:authoredPins(),review:false};try{if(base.change({...connectedWater(layer),lakes:[...layer.lakes??[],newLake]})){setDrawing([]);setMode("select");selectLake(id,false);base.reportNotice("Lake added to the water draft. Its level and shoreline are creator-defined; save waterways to retain it.");}}catch(e){base.reportError(e);}}
  function pick(point:HydroPoint,tolerance:number){
    if(!world)return;
    if(mode==="draw-lake"){if(drawing.length>=512){base.reportError(Error("Finish this shoreline within its 512-point drawing budget."));return;}setDrawing(p=>[...p,point]);return;}
    if(mode==="watershed"){setMode("select");request(analysis=>({type:"watershed",analysis,point}));return;}
    if((mode==="move-shore"||mode==="insert-shore")&&lake&&!lakePreview){const rings=lake.rings.map((r,i)=>i!==ringIndex?r:mode==="move-shore"?r.map((p,j)=>j===vertex?point:p):[...r.slice(0,vertex+1),point,...r.slice(vertex+1)]);perform(()=>editWaterLake(layer,lake.id,{rings,authoredPins:authoredPins()}),"Shoreline changed in the draft. Connected ports are retained and marked for review.");setMode("select");return;}
    if(mode==="insert-control"&&base.selected&&!base.selectedPreview){perform(()=>insertWaterControl(layer,base.selected!,vertex,point),"River control point added. This course is creator-authored and protected.");setMode("select");return;}
    if(mode==="join-river"&&base.selected){const hit=hitHydrology(layer,point,world,tolerance);if(!hit){base.reportError(Error("Choose another visible authored river to join."));return;}perform(()=>joinWaterRivers(layer,base.selected!,hit,point,world,"junction:"+crypto.randomUUID()),"Tributary joined through a shared junction. Undo and save remain independent of terrain.");setMode("select");return;}
    if(base.mode!=="select"){base.pick(point,tolerance);return;}
    const river=hitHydrology(layer,point,world,tolerance),suggested=base.preview?.lakes?.find(l=>insideWaterRings(point,l.rings,world)),authored=layer.lakes?.find(l=>insideWaterRings(point,l.rings,world));
    if(!river&&(suggested||authored)){selectLake((suggested??authored)!.id,!!suggested);return;}setLakeId(null);base.pick(point,tolerance);
  }
  function lakeLevel(levelM:number,spillOutlet:boolean){if(!lake||!world)return;const area=waterBounds(lake.rings.flat(),world,Math.max(...lake.rings[0].map(p=>Math.abs(p.y-lake.seed.y)))*.5+1);request(analysis=>({type:"lake-level",analysis,lake,levelM,spillOutlet}),area);}
  function acceptReview(){if(!review?.lakes?.[0])return;const proposed=review.lakes[0],old=layer.lakes?.find(l=>l.id===proposed.id);if(old?.protected){base.reportError(Error("This lake is protected. Deliberately clear its protection before accepting a different calculated shoreline."));return;}if(old?.outletNodeId&&proposed.outletNodeId){base.reportError(Error("Disconnect the current lake outlet before accepting a replacement outlet proposal. Existing downstream rivers will be retained."));return;}
    perform(()=>{
      const analyses=new Map([...layer.analyses,...review.analyses].map(a=>[a.id,a])),nodes=new Map([...layer.nodes,...review.nodes].map(n=>[n.id,n])),edges=new Map([...layer.edges,...review.edges].map(e=>[e.id,e]));
      return {...connectedWater(layer),analyses:[...analyses.values()],nodes:[...nodes.values()],edges:[...edges.values()],lakes:[...(layer.lakes??[]).filter(l=>l.id!==proposed.id),{...proposed,inletNodeIds:old?.inletNodeIds??[],review:!!old?.inletNodeIds.length}]};
    },"Lake proposal accepted into the draft. Retained inflows may need shoreline alignment; save waterways after review.");setReview(null);selectLake(proposed.id,false);
  }
  const selectedLayer=lakePreview?base.preview:layer,selectedIdentity=lakeId??base.selected,network=useMemo(()=>networkShown&&selectedIdentity&&selectedLayer?waterNetwork(selectedLayer,selectedIdentity):undefined,[networkShown,selectedIdentity,selectedLayer]);
  const overlay=useMemo(()=>({...base.overlay,suggestions:review??base.overlay.suggestions,watershed:watershedShown?watershed?.data:null,showCatchments:watershedShown,drawing,selectedLake:lakeId,selectedLakePreview:lakePreview,networkEdges:network?.edges.map(e=>e.id)}),[base.overlay,review,watershedShown,watershed,drawing,lakeId,lakePreview,network]);
  return {...base,setSelection:(id:string|null,preview:boolean)=>{setLakeId(null);setMode("select");base.setSelection(id,preview);},pick,overlay,dirty:base.dirty||drawing.length>0,system:{mode,drawing,lake,lakeId,lakePreview,selectLake,begin,finishLake,cancelDrawing:()=>{setDrawing([]);setMode("select");},ringIndex,vertex,network,networkShown,setNetworkShown,issues,review,acceptReview,discardReview:()=>setReview(null),watershed,watershedShown,setWatershedShown,affected:sources?affectedWater(layer,sources):{edges:[],lakes:[],catchments:[]},
    suggest:(f:TerrainFrame,minArea:number,lakeArea:number,depth:number)=>{setFrame(f);void base.suggest(f,minArea,{lakeMinimumAreaM2:lakeArea,lakeMinimumDepthM:depth});},
    acceptLake:()=>lake&&base.preview&&perform(()=>acceptLake(layer,base.preview!,lake.id),"Lake and its connected river network accepted into the draft. Save waterways to retain them."),
    rejectLake:()=>{if(lake&&base.preview){base.changePreview(removeWaterLake(base.preview,lake.id));setLakeId(null);}},
    editLake:(values:Partial<HydroLake>)=>lake&&perform(()=>editWaterLake(layer,lake.id,{...values,authoredPins:authoredPins()}),"Lake details changed in the draft. Geometry and level changes mark ports for review."),
    deleteLake:()=>lake&&perform(()=>removeWaterLake(layer,lake.id),"Lake removed; related rivers were retained with explicit detached endpoints for review."),
    closeLake:()=>lake&&perform(()=>closeWaterLake(layer,lake.id),"Lake closed. Its former downstream channel remains as a separate authored course."),
    alignPorts:()=>lake&&world&&perform(()=>alignWaterPorts(layer,lake.id,world),"Ports deliberately aligned to the shoreline; affected river paths are creator-authored."),
    removeShore:(ring:number,index:number)=>{if(!lake)return;perform(()=>editWaterLake(layer,lake.id,{rings:lake.rings.map((r,i)=>i===ring?r.filter((_,j)=>j!==index):r)}),"Shoreline point removed; connected ports need review.");},
    removeControl:(index:number)=>base.selected&&perform(()=>removeWaterControl(layer,base.selected!,index),"River control point removed in the draft."),
    disconnect:(end:"from"|"to")=>base.selected&&perform(()=>disconnectWater(layer,base.selected!,end,"detached:"+crypto.randomUUID()),"Connection detached deliberately. Other river records and terrain were retained."),
    connectLake:(id:string,outlet:boolean)=>base.selected&&world&&perform(()=>connectWaterLake(layer,base.selected!,id,outlet,world),outlet?"Waterway connected as this lake's outlet.":"Waterway connected to this lake through an explicit inlet."),
    width:(value:number|null)=>base.selected&&perform(()=>({...connectedWater(layer),edges:layer.edges.map(e=>e.id===base.selected?{...e,widthM:value}:e)}),"River width changed in the draft. Automatic estimates remain separate from physical overrides."),
    lakeLevel,inspectWatershed:()=>{const point=lake?.seed??layer.nodes.find(n=>n.id===layer.edges.find(e=>e.id===base.selected)?.to)?.point;if(point){const source=lake&&sources?.sources.filter(s=>lake.sourceIds.includes(s.id)).sort((a,b)=>b.level-a.level)[0];request(analysis=>({type:"watershed",analysis,point}),frame??source?.frame);}else begin("watershed");},
    keepWatershed:()=>watershed&&perform(()=>({...connectedWater(layer),analyses:[...layer.analyses.filter(a=>a.id!==watershed.analysis.id),watershed.analysis],catchments:[...layer.catchments?.filter(c=>c.id!==watershed.data.id)??[],watershed.data]}),"Watershed retained in the water draft; its area and boundary remain provisional."),
    reviewNetwork:()=>request(()=>({type:"review",layer})),
  }};
}
