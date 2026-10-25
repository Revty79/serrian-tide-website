"use client";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { type TerrainGeometry, brushRadius, fitTerrain, zoomTerrain, terrainPoint, type Brush, type TerrainPatch, type TerrainView } from "./terrain";
import { paintTerrainTile, terrainRenderKeys } from "./terrain-renderer";
import type {TerrainArea} from "./terrain-source";
import {normalizePlacePoint,type MapPlace,type PlaceOverlay} from "./world-towns";
import styles from "./terrain.module.css";
import {TerrainStroke} from "./terrain-stroke";
import {unwrapTerrainPath,type TerrainPathPoint} from "./terrain-operations";
export type TerrainCanvasHandle = { refresh: (keys?: Iterable<number>) => void; fit: () => void; zoom: (factor: number) => void; pan: (x: number, y: number) => void; redraw:()=>void };
export type TerrainCanvasTool = "pan" | "inspect" | "locations" | "select" | "sample" | "path" | Brush["tool"];
type Props = { handleRef: Ref<TerrainCanvasHandle>; shape: TerrainGeometry; grid: Int16Array; seaLevel: number; brush: Brush; tool: TerrainCanvasTool; touchEdit?:boolean;path?:TerrainPathPoint[];pathRadius?:number;onPath?:(points:TerrainPathPoint[])=>void;onSample?:(height:number)=>void;onTool?:(tool:TerrainCanvasTool)=>void;onHistory?:(direction:"undo"|"redo")=>void;selection?:TerrainArea|null;onSelect?:(area:TerrainArea)=>void;onRenderReady?:(ready:boolean)=>void; locations:PlaceOverlay; onLocation:(point:{x:number;y:number},hit?:MapPlace)=>void; canEdit: boolean; onStroke: (patch: TerrainPatch) => void; onWorking: (working: boolean) => void; onInspect: (text: string) => void; onMeasure: (ms: number) => void };
export function TerrainCanvas({ handleRef, ...props }: Props) {
  const element = useRef<HTMLCanvasElement>(null), current = useRef(props), api = useRef<TerrainCanvasHandle>(null);
  useEffect(() => { current.current = props; });
  useImperativeHandle(handleRef, () => ({ refresh: keys => api.current?.refresh(keys), fit: () => api.current?.fit(), zoom: factor => api.current?.zoom(factor), pan: (x, y) => api.current?.pan(x, y), redraw:()=>api.current?.redraw() }), []);
  useEffect(() => {
    const shape = current.current.shape;
    const canvas = element.current!, ctx = canvas.getContext("2d")!, texture = document.createElement("canvas");
    texture.width = shape.width; texture.height = shape.height;
    const pixels = texture.getContext("2d")!;
    let width = 1, height = 1, view: TerrainView = fitTerrain(1, 1, shape), initialized = false, cursor: { x: number; y: number } | null = null;
    const queue = terrainRenderKeys(undefined, shape);
    let renderFrame = 0, moveFrame = 0, space=false;
    let gesture: {id:number;mode:"pan"|"inspect"|"sculpt"|"select"|"path";x:number;y:number;last:{x:number;y:number};stroke?:TerrainStroke;ending?:boolean;pathBefore?:TerrainPathPoint[];vertex?:number;dragVertex?:boolean}|null=null;
    const positions = new Map<number, { x: number; y: number }>();
    let pinch: { distance: number; x: number; y: number } | null = null;
    const point = (e: PointerEvent | WheelEvent) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    function draw() {
      const dpr = Math.min(2, window.devicePixelRatio || 1); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(texture, view.x, view.y, shape.displayWidth * view.scale, shape.displayHeight * view.scale);
      const theme=getComputedStyle(canvas),left=view.x,top=view.y,right=left+shape.displayWidth*view.scale,bottom=top+shape.displayHeight*view.scale;
      ctx.save();ctx.beginPath();ctx.rect(left,top,right-left,bottom-top);ctx.clip();ctx.font="600 13px system-ui";
      for(const marker of current.current.locations.markers){for(const offset of shape.wrap?[-shape.displayWidth,0,shape.displayWidth]:[0]){
        const x=view.x+(marker.x+offset)*view.scale,y=view.y+marker.y*view.scale;if(x<-200||x>width+200||y<-30||y>height+30)continue;
        ctx.beginPath();ctx.arc(x,y,current.current.locations.selectedId===marker.id?8:6,0,Math.PI*2);ctx.fillStyle=theme.getPropertyValue(marker.archived?"--st-muted":"--st-primary");ctx.fill();ctx.strokeStyle=theme.getPropertyValue("--st-text-strong");ctx.lineWidth=2;ctx.stroke();
        const label=marker.name+(marker.archived?" (archived)":""),textWidth=ctx.measureText(label).width+10,lx=Math.max(left+2,Math.min(right-textWidth-2,x+10)),ly=Math.max(top+2,y-22);ctx.fillStyle=theme.getPropertyValue("--st-surface-deep");ctx.fillRect(lx,ly,textWidth,21);ctx.fillStyle=theme.getPropertyValue("--st-text-strong");ctx.fillText(label,lx+5,ly+15);
      }}
      const active=current.current,brushTool=!["pan","inspect","locations","select","sample","path"].includes(active.tool);
      if(cursor&&active.canEdit&&brushTool){const r=brushRadius(shape,active.brush.radius),rx=r/shape.width*shape.displayWidth*view.scale,ry=r/shape.height*shape.displayHeight*view.scale;ctx.strokeStyle=theme.getPropertyValue("--st-text-strong");ctx.lineWidth=2;for(const offset of shape.wrap?[-shape.displayWidth*view.scale,0,shape.displayWidth*view.scale]:[0]){ctx.beginPath();ctx.ellipse(cursor.x+offset,cursor.y,rx,ry,0,0,Math.PI*2);ctx.stroke();}canvas.dataset.brushRadius=String(r);}
      if(active.path?.length){const points=unwrapTerrainPath(active.path,shape);ctx.save();ctx.translate(view.x,view.y);ctx.scale(shape.displayWidth*view.scale/shape.width,shape.displayHeight*view.scale/shape.height);ctx.strokeStyle=theme.getPropertyValue("--st-primary");ctx.globalAlpha=.2;ctx.lineWidth=(active.pathRadius??1)*2;ctx.lineCap="round";ctx.lineJoin="round";for(const offset of shape.wrap?[-shape.width,0,shape.width]:[0]){ctx.beginPath();points.forEach((p,i)=>{if(i)ctx.lineTo(p.x+offset,p.y);else ctx.moveTo(p.x+offset,p.y);});ctx.stroke();}ctx.restore();ctx.strokeStyle=theme.getPropertyValue("--st-primary");ctx.fillStyle=theme.getPropertyValue("--st-text-strong");ctx.lineWidth=3;for(const offset of shape.wrap?[-shape.width,0,shape.width]:[0]){ctx.beginPath();for(let i=0;i<points.length;i++){const x=view.x+(points[i].x+offset)/shape.width*shape.displayWidth*view.scale,y=view.y+points[i].y/shape.height*shape.displayHeight*view.scale;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);}ctx.stroke();for(const p of points){const x=view.x+(p.x+offset)/shape.width*shape.displayWidth*view.scale,y=view.y+p.y/shape.height*shape.displayHeight*view.scale;ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();}}}
      const selection=current.current.selection;if(selection){const x=view.x+selection.x/shape.width*shape.displayWidth*view.scale,y=view.y+selection.y/shape.height*shape.displayHeight*view.scale,w=selection.width/shape.width*shape.displayWidth*view.scale,h=selection.height/shape.height*shape.displayHeight*view.scale;ctx.globalAlpha=.18;ctx.fillStyle=theme.getPropertyValue("--st-primary");ctx.fillRect(x,y,w,h);ctx.globalAlpha=1;ctx.strokeStyle=theme.getPropertyValue("--st-text-strong");ctx.setLineDash([8,4]);ctx.strokeRect(x,y,w,h);ctx.setLineDash([]);}
      const draft=current.current.locations.point;if(draft){const x=view.x+draft.x*view.scale,y=view.y+draft.y*view.scale;ctx.strokeStyle=theme.getPropertyValue("--st-text-strong");ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.strokeRect(x-10,y-10,20,20);ctx.setLineDash([]);}
      ctx.restore();
      canvas.dataset.zoom = String(view.scale); canvas.dataset.viewX = String(view.x); canvas.dataset.viewY = String(view.y);
    }
    function render() {
      renderFrame = 0; const start = performance.now();
      for (const key of queue) { pixels.putImageData(paintTerrainTile(current.current.grid, current.current.seaLevel, key, shape), key % (shape.width / shape.tileSize) * shape.tileSize, Math.floor(key / (shape.width / shape.tileSize)) * shape.tileSize); queue.delete(key); if (performance.now() - start > 6) break; }
      draw();canvas.dataset.renderBatchMs=String(performance.now()-start); canvas.dataset.renderPending = String(queue.size);current.current.onRenderReady?.(queue.size===0);
      if (queue.size) renderFrame = requestAnimationFrame(render);
    }
    function refresh(keys?: Iterable<number>) { current.current.onRenderReady?.(false); for (const key of terrainRenderKeys(keys, shape)) queue.add(key); if (!renderFrame) renderFrame = requestAnimationFrame(render); }
    const observer = new ResizeObserver(() => { const rect = canvas.getBoundingClientRect(), previousWidth = width, previousHeight = height; width = rect.width; height = rect.height; const dpr = Math.min(2, window.devicePixelRatio || 1); canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); if (!initialized) { view = fitTerrain(width, height, shape); initialized = true; } else { view.x += (width - previousWidth) / 2; view.y += (height - previousHeight) / 2; } draw(); }); observer.observe(canvas);
    api.current = { refresh, fit: () => { view = fitTerrain(width, height, shape); draw(); }, zoom: factor => { view = zoomTerrain(view, width / 2, height / 2, factor); draw(); }, pan: (x, y) => { view = { ...view, x: view.x + x, y: view.y + y }; draw(); },redraw:draw };
    function inspect(p: { x: number; y: number }) { const g = terrainPoint(view, p.x, p.y, shape), x = Math.floor(g.x), y = Math.floor(g.y); if (x >= 0 && x < shape.width && y >= 0 && y < shape.height) { const z = current.current.grid[y * shape.width + x]; current.current.onInspect(`Elevation ${z.toLocaleString()} m · ${z <= current.current.seaLevel ? "water" : "land"} · sample ${x}, ${y}`); } }
    function advanceStroke(){
      moveFrame=0;const g=gesture;if(!g?.stroke)return;const started=performance.now(),touched=g.stroke.advance(5);current.current.onMeasure(performance.now()-started);if(touched.size)refresh(touched);
      if(g.stroke.pending)moveFrame=requestAnimationFrame(advanceStroke);else if(g.ending){const patch=g.stroke.finish();gesture=null;if(patch.indices.length)current.current.onStroke(patch);current.current.onWorking(false);}
    }
    function scheduleStroke(){if(!moveFrame)moveFrame=requestAnimationFrame(advanceStroke);}
    function cancelGesture(){const g=gesture;if(!g)return;cancelAnimationFrame(moveFrame);moveFrame=0;if(g.stroke){const keys=g.stroke.cancel();if(keys.size)refresh(keys);}if(g.pathBefore)current.current.onPath?.(g.pathBefore);gesture=null;current.current.onWorking(false);}
    function selectPoint(p:{x:number;y:number}){if(!gesture||gesture.mode!=="select")return;const g=terrainPoint(view,p.x,p.y,shape),start=gesture.last,ex=Math.max(0,Math.min(shape.width-1,Math.floor(g.x))),ey=Math.max(0,Math.min(shape.height-1,Math.floor(g.y))),sx=Math.max(0,Math.min(shape.width-1,Math.floor(start.x))),sy=Math.max(0,Math.min(shape.height-1,Math.floor(start.y)));current.current.onSelect?.({x:Math.min(sx,ex),y:Math.min(sy,ey),width:Math.abs(ex-sx)+1,height:Math.abs(ey-sy)+1});draw();}
    function pathPoint(p:{x:number;y:number},first=false){const g=gesture;if(!g||g.mode!=="path"||!current.current.onPath)return;const sample=terrainPoint(view,p.x,p.y,shape),next={x:Math.max(0,Math.min(shape.width-1,sample.x)),y:Math.max(0,Math.min(shape.height-1,sample.y))},points=[...(current.current.path??[])];if(g.dragVertex&&g.vertex!==undefined){points[g.vertex]=next;}else if(first||!points.length||Math.hypot((next.x-points[points.length-1].x)/shape.width*shape.displayWidth*view.scale,(next.y-points[points.length-1].y)/shape.height*shape.displayHeight*view.scale)>=6){if(points.length>=256)return;points.push(next);}else return;current.current={...current.current,path:points};current.current.onPath?.(points);draw();}
    function down(e:PointerEvent){
      if(e.button!==0&&e.button!==1)return;if(gesture?.ending)return;e.preventDefault();canvas.focus();canvas.setPointerCapture(e.pointerId);const p=point(e);positions.set(e.pointerId,p);
      if(positions.size>1){cancelGesture();const [a,b]=[...positions.values()];pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),x:(a.x+b.x)/2,y:(a.y+b.y)/2};return;}
      const active=current.current,tool=active.tool,sample=terrainPoint(view,p.x,p.y,shape),inside=sample.x>=0&&sample.x<shape.width&&sample.y>=0&&sample.y<shape.height,touchPan=e.pointerType==="touch"&&!active.touchEdit;
      if(tool==="sample"&&inside&&active.onSample){active.onSample(active.grid[Math.floor(sample.y)*shape.width+Math.floor(sample.x)]);inspect(p);return;}
      if(tool==="locations"&&e.button===0&&!touchPan){let selected:MapPlace|undefined;for(const marker of active.locations.markers)for(const offset of shape.wrap?[-shape.displayWidth,0,shape.displayWidth]:[0])if(Math.hypot(p.x-view.x-(marker.x+offset)*view.scale,p.y-view.y-marker.y*view.scale)<22)selected=marker;try{active.onLocation(normalizePlacePoint((p.x-view.x)/view.scale,(p.y-view.y)/view.scale,{widthMetres:shape.displayWidth,heightMetres:shape.displayHeight,wrap:shape.wrap}),selected);}catch{}return;}
      const mode=e.button===1||space||tool==="pan"||touchPan?"pan":tool==="select"&&active.onSelect?"select":tool==="path"&&active.onPath?"path":tool==="inspect"||!active.canEdit?"inspect":"sculpt";
      if((mode==="select"||mode==="path")&&!inside)return;
      gesture={id:e.pointerId,mode,...p,last:sample};
      if(mode==="sculpt"){gesture.stroke=new TerrainStroke(active.grid,shape,{...active.brush},sample);active.onWorking(true);scheduleStroke();}
      else if(mode==="select"){active.onWorking(true);selectPoint(p);}
      else if(mode==="path"){gesture.pathBefore=[...(active.path??[])];let vertex=-1;for(let i=0;i<(active.path?.length??0);i++){const v=active.path![i];if(Math.hypot(view.x+v.x/shape.width*shape.displayWidth*view.scale-p.x,view.y+v.y/shape.height*shape.displayHeight*view.scale-p.y)<12)vertex=i;}gesture.vertex=vertex;gesture.dragVertex=vertex>=0;active.onWorking(true);pathPoint(p,true);}
      inspect(p);
    }
    function move(e:PointerEvent){
      const p=point(e);cursor=p;inspect(p);if(positions.has(e.pointerId))positions.set(e.pointerId,p);
      if(pinch&&positions.size>1){const [a,b]=[...positions.values()],next={distance:Math.hypot(a.x-b.x,a.y-b.y),x:(a.x+b.x)/2,y:(a.y+b.y)/2};view=zoomTerrain(view,pinch.x,pinch.y,next.distance/Math.max(1,pinch.distance));view.x+=next.x-pinch.x;view.y+=next.y-pinch.y;pinch=next;draw();return;}
      const g=gesture;if(g?.id===e.pointerId&&!g.ending){if(g.mode==="pan"){view.x+=p.x-g.x;view.y+=p.y-g.y;g.x=p.x;g.y=p.y;draw();}else if(g.mode==="select")selectPoint(p);else if(g.mode==="path")pathPoint(p);else if(g.stroke){g.stroke.enqueue(terrainPoint(view,p.x,p.y,shape));scheduleStroke();}}else draw();
    }
    function up(e:PointerEvent){positions.delete(e.pointerId);if(gesture?.id===e.pointerId){if(gesture.stroke){gesture.stroke.enqueue(terrainPoint(view,point(e).x,point(e).y,shape));gesture.ending=true;scheduleStroke();}else{gesture=null;current.current.onWorking(false);}}if(positions.size<2)pinch=null;}
    function cancelled(e:PointerEvent){positions.delete(e.pointerId);if(gesture?.id===e.pointerId&&!gesture.ending)cancelGesture();if(positions.size<2)pinch=null;}
    function leave(){cursor=null;draw();}
    function spaceDown(e:KeyboardEvent){if(e.code==="Space"){e.preventDefault();space=true;}}
    function spaceUp(e:KeyboardEvent){if(e.code==="Space")space=false;}
    function blur(){space=false;}
    function wheel(e: WheelEvent) { e.preventDefault(); const p = point(e); view = zoomTerrain(view, p.x, p.y, Math.exp(-e.deltaY * .0015)); draw(); }
    canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", cancelled); canvas.addEventListener("lostpointercapture", cancelled);canvas.addEventListener("keydown",spaceDown);canvas.addEventListener("keyup",spaceUp);canvas.addEventListener("blur",blur); canvas.addEventListener("pointerleave", leave); canvas.addEventListener("wheel", wheel, { passive: false }); refresh();
    return () => { observer.disconnect(); cancelAnimationFrame(renderFrame); cancelAnimationFrame(moveFrame); canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", cancelled); canvas.removeEventListener("lostpointercapture", cancelled);canvas.removeEventListener("keydown",spaceDown);canvas.removeEventListener("keyup",spaceUp);canvas.removeEventListener("blur",blur); canvas.removeEventListener("pointerleave", leave); canvas.removeEventListener("wheel", wheel); api.current = null; };
  }, []);
  useEffect(() => { api.current?.refresh(); }, [props.seaLevel]);
  useEffect(()=>{api.current?.redraw();},[props.locations,props.tool,props.selection,props.path,props.brush]);
  return <canvas ref={element} className={styles.canvas} tabIndex={0} aria-label="Terrain map canvas" aria-describedby="terrain-canvas-help" onKeyDown={e => { const moves: Record<string, [number, number]> = { ArrowLeft: [50, 0], ArrowRight: [-50, 0], ArrowUp: [0, 50], ArrowDown: [0, -50] }; if (moves[e.key]) { e.preventDefault(); api.current?.pan(...moves[e.key]); } else if (e.key === "+" || e.key === "=") api.current?.zoom(1.25); else if (e.key === "-") api.current?.zoom(.8); else if (e.key.toLowerCase() === "f") api.current?.fit();else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();props.onHistory?.(e.shiftKey?"redo":"undo");}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="y"){e.preventDefault();props.onHistory?.("redo");}else if(!e.ctrlKey&&!e.metaKey){const tools:Record<string,TerrainCanvasTool>={p:"pan",i:"inspect",r:"raise",l:"lower",s:"smooth",t:"level"};if(tools[e.key.toLowerCase()])props.onTool?.(tools[e.key.toLowerCase()]);} }} />;
}
