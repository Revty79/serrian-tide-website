import {styleColor,type TerrainStyle} from "./terrain-style";
import type {HydroEdge,HydroGeometry,HydroLayer,HydroPoint,WaterFeature} from "./terrain-hydrology";
import type {HydroOverlay} from "./terrain-hydrology-overlay";
import type {TerrainView} from "./terrain";
import {automaticRiverWidthM} from "./terrain-water-painter";
import {riverOrders} from "./terrain-water-network";
import {unwrapWaterRing,waterDx} from "./terrain-water-geometry";

type Bounds={left:number;right:number;top:number;bottom:number};
type AnchoredPath={path:Path2D;outline?:Path2D;origin:HydroPoint};
type CachedPath=AnchoredPath&{bounds:Bounds;estimatedBytes:number;factory:(origin:HydroPoint)=>AnchoredPath;anchors?:Map<string,AnchoredPath>};
const transientSurfaces=new Map<object,{key:string;path:CachedPath}>();
type Prepared={key:string;paths:Map<string,CachedPath>;surfaces:Map<string,CachedPath>;orders:Map<string,number>;maximumArea:number;areas:Map<string,number>;courses:{edge:HydroEdge;ids:string[]}[];bytes:number};
const cache=new Map<HydroLayer,Prepared>(),CACHE_BYTES=32*1024*1024;
export const waterArtworkStats={preparations:0,hits:0,bytes:0,entries:0,drawnChannels:0,drawnPaths:0,reanchors:0,hiddenChannels:0,lastPaintMs:0,maxPaintMs:0};
type Palette={water:string;light:string;edge:string;bank:string;wet:string;wetEdge:string};
function palette(style:string):Palette{
  if(style==="illustrated-fantasy")return {water:"#568d99",light:"#8db6b5",edge:"#31566a",bank:"#8a876a",wet:"#809b89",wetEdge:"#537e79"};
  if(style==="topographic")return {water:"#3d8fac",light:"#91c4cc",edge:"#296781",bank:"#617c79",wet:"#80a5a0",wetEdge:"#477f86"};
  if(style==="classic-elevation")return {water:"#347f9a",light:"#78b8c6",edge:"#205f7d",bank:"#45685f",wet:"#6a9e92",wetEdge:"#387e80"};
  if(style==="realistic-terrain")return {water:"#326e7a",light:"#59949a",edge:"#244d55",bank:"#304d3f",wet:"#627e6f",wetEdge:"#385d57"};
  return {water:"#327d91",light:"#76adb5",edge:"#255a6c",bank:"#506f5a",wet:"#71998a",wetEdge:"#457d78"};
}
function bounds(points:HydroPoint[]):Bounds{return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};}
function linePath(edge:HydroEdge,layer:HydroLayer,world:HydroGeometry):CachedPath{
  const points:HydroPoint[]=[];for(const q of edge.points)points.push({x:points.length?points.at(-1)!.x+waterDx(points.at(-1)!.x,q.x,world):q.x,y:q.y});
  const box=bounds(points),spacing=layer.analyses.find(a=>a.id===edge.analysisId)?.pins.reduce((s,p)=>Math.min(s,p.spacingX,p.spacingY),Infinity)??0,smooth=edge.flowKind==="derived"&&!edge.protected&&!layer.features?.some(f=>f.kind!=="wetland"&&f.riverId===edge.id);
  const factory=(origin:HydroPoint):AnchoredPath=>{const p=points.map(p=>({x:p.x-origin.x,y:p.y-origin.y})),path=new Path2D();path.moveTo(p[0].x,p[0].y);for(let i=1;i<p.length-1;i++){const a=p[i-1],b=p[i],c=p[i+1],ab=Math.hypot(b.x-a.x,b.y-a.y),bc=Math.hypot(c.x-b.x,c.y-b.y),r=smooth&&Number.isFinite(spacing)?Math.min(ab*.25,bc*.25,spacing*.2):0;if(r){path.lineTo(b.x+(a.x-b.x)*r/(ab||1),b.y+(a.y-b.y)*r/(ab||1));path.quadraticCurveTo(b.x,b.y,b.x+(c.x-b.x)*r/(bc||1),b.y+(c.y-b.y)*r/(bc||1));}else path.lineTo(b.x,b.y);}path.lineTo(p.at(-1)!.x,p.at(-1)!.y);return {path,origin};};return {...factory(points[0]),bounds:box,estimatedBytes:points.length*216,factory};
}
function surfacePath(rings:HydroPoint[][],world:HydroGeometry,canonical=false):CachedPath{
  const polygons:HydroPoint[][]=[];let anchor:number|undefined;for(const ring of rings){const p=canonical?ring:unwrapWaterRing(ring,world);anchor??=p[0].x;const shift=world.wrap&&!canonical?Math.round((anchor-p[0].x)/world.width)*world.width:0;polygons.push(p.map(q=>({x:q.x+shift,y:q.y})));}
  const factory=(origin:HydroPoint):AnchoredPath=>{const path=new Path2D(),outline=canonical?new Path2D():undefined;for(const ring of polygons){ring.forEach((p,i)=>{if(i)path.lineTo(p.x-origin.x,p.y-origin.y);else path.moveTo(p.x-origin.x,p.y-origin.y);});path.closePath();if(outline)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];if(a.x===b.x&&(a.x===0||a.x===world.width))continue;outline.moveTo(a.x-origin.x,a.y-origin.y);outline.lineTo(b.x-origin.x,b.y-origin.y);}}return {path,outline,origin};};return {...factory(polygons[0][0]),bounds:bounds(polygons.flat()),estimatedBytes:polygons.flat().length*216,factory};
}
export function waterArtworkAnchor(box:Bounds,view:TerrainView,offset:number){if(Math.max(box.right-box.left,box.bottom-box.top)*2**-23*view.scale<=.05)return null;return {x:Math.floor((-view.x/view.scale-offset)/16384)*16384,y:Math.floor(-view.y/view.scale/16384)*16384};}
function anchored(path:CachedPath,view:TerrainView,offset:number){const origin=waterArtworkAnchor(path.bounds,view,offset);if(!origin)return path;const key=origin.x+"/"+origin.y;path.anchors??=new Map();const prior=path.anchors.get(key);if(prior)return prior;const value=path.factory(origin);path.anchors.set(key,value);while(path.anchors.size>2)path.anchors.delete(path.anchors.keys().next().value!);waterArtworkStats.reanchors++;return value;}
function localBounds(path:CachedPath):Bounds{const b=path.bounds,o=path.origin;return {left:b.left-o.x,right:b.right-o.x,top:b.top-o.y,bottom:b.bottom-o.y};}
/** Display-only chains remove artificial segmentation at degree-two nodes.
 * Original records and authored/feature-anchored geometry remain untouched. */
export function waterDisplayCourses(layer:HydroLayer){
  const incoming=new Map<string,HydroEdge[]>(),outgoing=new Map<string,HydroEdge[]>(),anchored=new Set(layer.features?.filter(f=>f.kind!=="wetland").map(f=>f.riverId));
  for(const e of layer.edges){incoming.set(e.to,[...incoming.get(e.to)??[],e]);outgoing.set(e.from,[...outgoing.get(e.from)??[],e]);}
  const compatible=(a:HydroEdge,b:HydroEdge)=>a.flowKind==="derived"&&b.flowKind==="derived"&&!a.protected&&!b.protected&&!a.widthM&&!b.widthM&&a.courseKind===b.courseKind&&a.analysisId===b.analysisId&&!anchored.has(a.id)&&!anchored.has(b.id);
  const starts=layer.edges.filter(e=>{const previous=incoming.get(e.from);return previous?.length!==1||outgoing.get(e.from)?.length!==1||!compatible(previous[0],e);}),seen=new Set<string>(),courses:{edge:HydroEdge;ids:string[]}[]=[];
  for(const start of [...starts,...layer.edges]){if(seen.has(start.id))continue;let end=start;const points=[...start.points],ids=[start.id];seen.add(start.id);while(incoming.get(end.to)?.length===1&&outgoing.get(end.to)?.length===1){const next=outgoing.get(end.to)![0];if(seen.has(next.id)||!compatible(end,next)||points.length+next.points.length>8192)break;points.push(...next.points.slice(1));ids.push(next.id);seen.add(next.id);end=next;}courses.push({edge:ids.length===1?start:{...start,to:end.to,points,drainageM2:Math.max(start.drainageM2,end.drainageM2)},ids});}return courses;
}
function prepare(layer:HydroLayer,world:HydroGeometry){
  const key=JSON.stringify(world),old=cache.get(layer);if(old?.key===key){cache.delete(layer);cache.set(layer,old);waterArtworkStats.hits++;return old;}
  const paths=new Map<string,CachedPath>(),surfaces=new Map<string,CachedPath>();let points=0;
  const courses=waterDisplayCourses(layer);for(const {edge:e} of courses){paths.set(e.id,linePath(e,layer,world));points+=e.points.length;}
  for(const l of layer.lakes??[]){surfaces.set(l.id,surfacePath(l.rings,world));points+=l.rings.flat().length;}
  for(const c of layer.catchments??[]){surfaces.set(c.id,surfacePath(c.rings,world,!!c.frameMode));points+=c.rings.flat().length;}
  for(const f of layer.features??[])if(f.kind==="wetland"){surfaces.set(f.id,surfacePath(f.rings,world));points+=f.rings.flat().length;}
  const nodes=new Map(layer.nodes.map(n=>[n.id,n]));const areas=new Map(courses.map(({edge:e})=>[e.id,Math.max(e.drainageM2,nodes.get(e.to)?.drainageM2??0)]));
  const prepared={key,paths,surfaces,areas,courses,orders:riverOrders(layer),maximumArea:Math.max(1,...layer.edges.map(e=>e.drainageM2)),bytes:points*216+layer.edges.length*160};cache.set(layer,prepared);waterArtworkStats.preparations++;
  while(cache.size>4||cache.size>1&&[...cache.values()].reduce((sum,p)=>sum+p.bytes,0)+[...transientSurfaces.values()].reduce((sum,p)=>sum+p.path.estimatedBytes,0)>CACHE_BYTES)cache.delete(cache.keys().next().value!);
  waterArtworkStats.bytes=[...cache.values()].reduce((sum,p)=>sum+p.bytes,0)+[...transientSurfaces.values()].reduce((sum,p)=>sum+p.path.estimatedBytes,0);waterArtworkStats.entries=cache.size+transientSurfaces.size;return prepared;
}
export function waterCourseVisible(edge:HydroEdge,order:number,maximumArea:number,scale:number,detail:"major"|"balanced"|"all",forced=false){
  if(forced||edge.protected||edge.flowKind!=="derived"||edge.widthM||detail==="all")return true;
  const importance=edge.drainageM2/Math.max(1,maximumArea),kind=edge.courseKind,major=kind==="river"||order>=3||importance>=.08;
  if(major)return true;if(detail==="major")return false;
  if(kind==="stream"||kind==="intermittent"||order===1)return scale*Math.sqrt(Math.max(1,edge.drainageM2))>=75;
  return order>=2&&(importance>=.006||scale*Math.sqrt(Math.max(1,edge.drainageM2))>=30);
}
function visible(b:Bounds,view:TerrainView,offset:number,width:number,height:number){return view.x+(b.right+offset)*view.scale>=-16&&view.x+(b.left+offset)*view.scale<=width+16&&view.y+b.bottom*view.scale>=-16&&view.y+b.top*view.scale<=height+16;}
function tone(lake:NonNullable<HydroLayer["lakes"]>[number],p:Palette){return lake.artwork?.tone==="blue"?{...p,water:"#326f99",light:"#6aa9bf"}:lake.artwork?.tone==="turquoise"?{...p,water:"#367f83",light:"#79b6ae"}:lake.artwork?.tone==="muted"?{...p,water:"#587b80",light:"#86a29d"}:p;}
function wetland(ctx:CanvasRenderingContext2D,f:Extract<WaterFeature,{kind:"wetland"}>,path:CachedPath,p:Palette,scale:number,preview:boolean){
  const box=localBounds(path);ctx.save();ctx.globalAlpha*=preview?.4:f.classification==="intermittent"?.35:.52;const gradient=ctx.createLinearGradient(box.left,box.top,box.right,box.bottom);gradient.addColorStop(0,p.wet);gradient.addColorStop(1,p.water);ctx.fillStyle=gradient;ctx.fill(path.path,"evenodd");ctx.globalAlpha=Math.min(1,ctx.globalAlpha*1.6);ctx.strokeStyle=p.wetEdge;ctx.lineWidth=1/scale;ctx.setLineDash(f.classification==="potential"||f.classification==="intermittent"?[6/scale,5/scale]:[]);ctx.stroke(path.path);ctx.setLineDash([]);ctx.clip(path.path,"evenodd");
  const dx=(box.right-box.left)/6,dy=(box.bottom-box.top)/5;if(dx*scale>16&&dy*scale>12)for(let y=1;y<5;y++)for(let x=1;x<6;x++){if((x*7+y*3)%4!==0)continue;const px=box.left+dx*x,py=box.top+dy*y,r=Math.min(dx*.16,7/scale);ctx.beginPath();ctx.moveTo(px-r,py);ctx.quadraticCurveTo(px,py-2/scale,px+r,py);ctx.stroke();}ctx.restore();
}
function pointFeature(ctx:CanvasRenderingContext2D,f:Exclude<WaterFeature,{kind:"wetland"}>,p:Palette,scale:number,selected:boolean,preview:boolean){
  ctx.save();ctx.scale(1/scale,1/scale);ctx.lineWidth=selected?2:1.3;ctx.strokeStyle=selected?"#f3d88c":p.light;ctx.fillStyle=p.edge;ctx.setLineDash(preview?[3,2]:[]);ctx.beginPath();ctx.arc(0,0,selected?7:5,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.setLineDash([]);ctx.strokeStyle=p.light;ctx.beginPath();if(f.kind==="spring"){ctx.arc(0,0,2,0,Math.PI*2);ctx.moveTo(-8,3);ctx.quadraticCurveTo(0,10,8,3);}else if(f.kind==="waterfall"){ctx.moveTo(-4,-2);ctx.lineTo(4,-2);ctx.moveTo(-2,-1);ctx.lineTo(-2,4);ctx.moveTo(2,-1);ctx.lineTo(2,4);}else{for(let y=-3;y<=3;y+=3){ctx.moveTo(-3,y-1);ctx.lineTo(0,y+1);ctx.lineTo(3,y-1);}}ctx.stroke();if(selected){ctx.font="12px sans-serif";ctx.fillStyle=p.light;ctx.fillText(f.name,11,-7);}ctx.restore();
}
/** Paths are prepared in World metres, reused through pan and zoom. The cache
 * estimate bounds our preparations; opaque browser Path2D overhead is extra. */
export function paintWaterArtwork(ctx:CanvasRenderingContext2D,view:TerrainView,world:HydroGeometry,overlay:HydroOverlay,style="physical-relief",art?:TerrainStyle){
  const started=performance.now(),p=palette(style);if(art){for(const key of ["water","light","edge","wet","wetEdge"] as const){const hex=p[key],rgb=styleColor([1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)),true,art);p[key]=`rgb(${rgb.map(Math.round).join(",")})`;}}const dpr=ctx.getTransform().a||1,width=ctx.canvas.width/dpr,height=ctx.canvas.height/dpr,copies=world.wrap?[-world.width,0,world.width]:[0],drawn=new Set<string>(),pathsDrawn=new Set<string>();waterArtworkStats.drawnChannels=0;waterArtworkStats.hiddenChannels=0;
  const local=(path:CachedPath,offset:number,paint:()=>void)=>{const original={path:path.path,outline:path.outline,origin:path.origin},resolved=anchored(path,view,offset);Object.assign(path,resolved);ctx.save();try{ctx.translate(view.x+(path.origin.x+offset)*view.scale,view.y+path.origin.y*view.scale);ctx.scale(view.scale,view.scale);paint();}finally{ctx.restore();Object.assign(path,original);}};
  const basin=(path:CachedPath,offset:number)=>local(path,offset,()=>{ctx.fillStyle="rgba(177,145,233,.15)";ctx.fill(path.path,"evenodd");ctx.strokeStyle="#ad9ac8";ctx.lineWidth=1/view.scale;ctx.setLineDash([8/view.scale,5/view.scale]);ctx.stroke(path.outline??path.path);});
  const layers:[HydroLayer,boolean,boolean][]=[[overlay.layer,false,false],...overlay.suggestions?[[overlay.suggestions,true,false] as [HydroLayer,boolean,boolean]]:[],...overlay.featurePreview?[[overlay.featurePreview,true,true] as [HydroLayer,boolean,boolean]]:[]];
  for(const [layer,preview,featuresOnly]of layers){if(!layer.visible||!layer.opacity)continue;const prepared=prepare(layer,world),presentation=overlay.layer.presentation??{detail:"balanced",banks:true,symbols:true};
    const channels=featuresOnly?[]:prepared.courses.filter(({edge:e,ids})=>{const show=waterCourseVisible(e,prepared.orders.get(e.id)??1,prepared.maximumArea,view.scale,presentation.detail,ids.includes(overlay.selected??"")&&overlay.selectedPreview===preview||!!overlay.networkEdges?.some(id=>ids.includes(id)));if(!show)waterArtworkStats.hiddenChannels+=ids.length;return show;});
    ctx.save();ctx.globalAlpha=layer.opacity*(preview?.72:1);ctx.lineCap="round";ctx.lineJoin="round";ctx.shadowBlur=0;
    for(const offset of copies){
      if(!featuresOnly&&overlay.showCatchments!==false)for(const c of layer.catchments??[])basin(prepared.surfaces.get(c.id)!,offset);
      for(const f of layer.features??[])if(f.kind==="wetland"){const path=prepared.surfaces.get(f.id)!;if(visible(path.bounds,view,offset,width,height))local(path,offset,()=>wetland(ctx,f,path,p,view.scale,preview));}
      if(!featuresOnly)for(const lake of layer.lakes??[]){const path=prepared.surfaces.get(lake.id)!;if(!visible(path.bounds,view,offset,width,height))continue;const color=tone(lake,p),selected=overlay.selectedLake===lake.id&&!!overlay.selectedLakePreview===preview;
        local(path,offset,()=>{const box=localBounds(path);ctx.setLineDash([]);if(lake.condition!=="dry"){if(presentation.banks&&lake.artwork?.shore!=="crisp"){ctx.strokeStyle=p.bank;ctx.globalAlpha*=.24;ctx.lineWidth=5/view.scale;ctx.stroke(path.path);ctx.globalAlpha=layer.opacity*(preview?.72:1);}const gradient=ctx.createLinearGradient(box.left,box.top,box.right,box.bottom);gradient.addColorStop(0,color.water);gradient.addColorStop(1,color.light);ctx.fillStyle=gradient;if(lake.condition==="intermittent")ctx.globalAlpha*=.55;ctx.fill(path.path,"evenodd");}ctx.strokeStyle=selected?"#f3d88c":lake.condition==="dry"?p.bank:color.light;ctx.lineWidth=(selected?2.2:lake.artwork?.shore==="crisp"?1.3:.8)/view.scale;ctx.setLineDash(preview||lake.condition==="potential"||lake.condition==="intermittent"||lake.condition==="dry"?[5/view.scale,4/view.scale]:[]);ctx.stroke(path.path);});
      }
      // Whole-network bank pass precedes water, avoiding inherited segment beads.
      for(const bank of presentation.banks?[true,false]:[false])for(const {edge:e,ids} of channels){const path=prepared.paths.get(e.id)!;if(!visible(path.bounds,view,offset,width,height))continue;if(!bank){for(const id of ids)drawn.add(id);pathsDrawn.add(e.id);}const network=overlay.networkEdges?.some(id=>ids.includes(id)),order=prepared.orders.get(e.id)??1,area=prepared.areas.get(e.id)??e.drainageM2,physical=e.widthM??automaticRiverWidthM(area),symbol=e.widthM?0:Math.min(3.1,.45+Math.log10(1+area/1e6)*.45+(order-1)*.13),weight=Math.min(96,Math.max(symbol,physical*view.scale));
        local(path,offset,()=>{ctx.globalAlpha*=bank?.3:1;ctx.strokeStyle=network?"#aa9acb":bank?p.bank:preview?p.light:e.flowKind==="exception"?"#b59ac7":p.water;ctx.lineWidth=(weight+(bank?1.8:0))/view.scale;ctx.setLineDash(preview?[6/view.scale,4/view.scale]:e.courseKind==="intermittent"?[5/view.scale,4/view.scale]:e.flowKind==="exception"?[3/view.scale,3/view.scale]:[]);ctx.stroke(path.path);});
      }
    }
    // A seam-crossing course can arrive in a later World copy. Paint every
    // geographic copy before its point symbols so that it cannot cover them.
    if(presentation.symbols)for(const offset of copies)for(const f of layer.features??[])if(f.kind!=="wetland"){const selected=overlay.selectedFeature===f.id&&!!overlay.selectedFeaturePreview===preview,x=view.x+(f.point.x+offset)*view.scale,y=view.y+f.point.y*view.scale;if(x<0||x>width||y<0||y>height)continue;ctx.save();ctx.translate(x,y);ctx.scale(view.scale,view.scale);pointFeature(ctx,f,p,view.scale,selected,preview);ctx.restore();}
    ctx.restore();
  }
  if(overlay.watershed&&overlay.showCatchments!==false){const b=overlay.watershed;const key=JSON.stringify(world);let path=transientSurfaces.get(b)?.key===key?transientSurfaces.get(b)!.path:undefined;if(!path){path=surfacePath(b.rings,world,!!b.frameMode);transientSurfaces.set(b,{key,path});while(transientSurfaces.size>1)transientSurfaces.delete(transientSurfaces.keys().next().value!);while(cache.size>1&&[...cache.values()].reduce((sum,p)=>sum+p.bytes,0)+path.estimatedBytes>CACHE_BYTES)cache.delete(cache.keys().next().value!);waterArtworkStats.bytes=[...cache.values()].reduce((sum,p)=>sum+p.bytes,0)+path.estimatedBytes;waterArtworkStats.entries=cache.size+transientSurfaces.size;}ctx.save();for(const offset of copies)basin(path,offset);ctx.restore();}
  for(const points of [overlay.drawing,overlay.featureDrawing])if(points?.length){const ring=unwrapWaterRing(points,world);ctx.save();ctx.strokeStyle=p.light;ctx.fillStyle=p.light;ctx.lineWidth=2;ctx.setLineDash([6,4]);for(const offset of copies){ctx.beginPath();ring.forEach((q,i)=>{if(i)ctx.lineTo(view.x+(q.x+offset)*view.scale,view.y+q.y*view.scale);else ctx.moveTo(view.x+(q.x+offset)*view.scale,view.y+q.y*view.scale);});ctx.stroke();for(const q of ring){ctx.beginPath();ctx.arc(view.x+(q.x+offset)*view.scale,view.y+q.y*view.scale,3,0,Math.PI*2);ctx.fill();}}ctx.restore();}
  const selected=(overlay.selectedPreview?overlay.suggestions:overlay.layer)?.edges.find(e=>e.id===overlay.selected);if(selected){ctx.save();ctx.fillStyle="#f3d88c";ctx.strokeStyle="#f3d88c";ctx.lineWidth=2;ctx.lineJoin="round";ctx.lineCap="round";ctx.setLineDash([]);const points:HydroPoint[]=[];for(const q of selected.points)points.push({x:points.length?points.at(-1)!.x+waterDx(points.at(-1)!.x,q.x,world):q.x,y:q.y});for(const offset of copies){ctx.beginPath();points.forEach((q,i)=>{if(i)ctx.lineTo(view.x+(q.x+offset)*view.scale,view.y+q.y*view.scale);else ctx.moveTo(view.x+(q.x+offset)*view.scale,view.y+q.y*view.scale);});ctx.stroke();}for(const q of [selected.points[0],selected.points.at(-1)!])for(const offset of copies){ctx.beginPath();ctx.arc(view.x+(q.x+offset)*view.scale,view.y+q.y*view.scale,3,0,Math.PI*2);ctx.fill();}ctx.restore();}
  waterArtworkStats.drawnChannels=drawn.size;waterArtworkStats.drawnPaths=pathsDrawn.size;waterArtworkStats.lastPaintMs=performance.now()-started;waterArtworkStats.maxPaintMs=Math.max(waterArtworkStats.maxPaintMs,waterArtworkStats.lastPaintMs);
}
