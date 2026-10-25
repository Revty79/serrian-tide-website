"use client";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { type TerrainGeometry, sculpt, finishPatch, fitTerrain, zoomTerrain, terrainPoint, type Brush, type TerrainPatch, type TerrainView } from "./terrain";
import { paintTerrainTile, terrainRenderKeys } from "./terrain-renderer";
import {normalizePlacePoint,type MapPlace,type PlaceOverlay} from "./world-towns";
import styles from "./terrain.module.css";
export type TerrainCanvasHandle = { refresh: (keys?: Iterable<number>) => void; fit: () => void; zoom: (factor: number) => void; pan: (x: number, y: number) => void; redraw:()=>void };
type Props = { handleRef: Ref<TerrainCanvasHandle>; shape: TerrainGeometry; grid: Int16Array; seaLevel: number; brush: Brush; tool: "pan" | "inspect" | "locations" | Brush["tool"]; locations:PlaceOverlay; onLocation:(point:{x:number;y:number},hit?:MapPlace)=>void; canEdit: boolean; onStroke: (patch: TerrainPatch) => void; onWorking: (working: boolean) => void; onInspect: (text: string) => void; onMeasure: (ms: number) => void };
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
    let renderFrame = 0, moveFrame = 0, latest: PointerEvent | null = null;
    let gesture: { id: number; mode: "pan" | "inspect" | "sculpt"; x: number; y: number; last: { x: number; y: number }; before: Map<number, number> } | null = null;
    const positions = new Map<number, { x: number; y: number }>();
    let pinch: { distance: number; x: number; y: number } | null = null;
    const point = (e: PointerEvent | WheelEvent) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    function draw() {
      const dpr = Math.min(2, window.devicePixelRatio || 1); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(texture, view.x, view.y, shape.displayWidth * view.scale, shape.displayHeight * view.scale);
      if (cursor && current.current.canEdit && !["pan", "inspect", "locations"].includes(current.current.tool)) {
        ctx.beginPath(); ctx.ellipse(cursor.x, cursor.y, current.current.brush.radius / shape.width * shape.displayWidth * view.scale, current.current.brush.radius / shape.height * shape.displayHeight * view.scale, 0, 0, Math.PI * 2);
        ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue("--st-text-strong"); ctx.lineWidth = 2; ctx.stroke();
      }
      const theme=getComputedStyle(canvas),left=view.x,top=view.y,right=left+shape.displayWidth*view.scale,bottom=top+shape.displayHeight*view.scale;
      ctx.save();ctx.beginPath();ctx.rect(left,top,right-left,bottom-top);ctx.clip();ctx.font="600 13px system-ui";
      for(const marker of current.current.locations.markers){for(const offset of shape.wrap?[-shape.displayWidth,0,shape.displayWidth]:[0]){
        const x=view.x+(marker.x+offset)*view.scale,y=view.y+marker.y*view.scale;if(x<-200||x>width+200||y<-30||y>height+30)continue;
        ctx.beginPath();ctx.arc(x,y,current.current.locations.selectedId===marker.id?8:6,0,Math.PI*2);ctx.fillStyle=theme.getPropertyValue(marker.archived?"--st-muted":"--st-primary");ctx.fill();ctx.strokeStyle=theme.getPropertyValue("--st-text-strong");ctx.lineWidth=2;ctx.stroke();
        const label=marker.name+(marker.archived?" (archived)":""),textWidth=ctx.measureText(label).width+10,lx=Math.max(left+2,Math.min(right-textWidth-2,x+10)),ly=Math.max(top+2,y-22);ctx.fillStyle=theme.getPropertyValue("--st-surface-deep");ctx.fillRect(lx,ly,textWidth,21);ctx.fillStyle=theme.getPropertyValue("--st-text-strong");ctx.fillText(label,lx+5,ly+15);
      }}
      const draft=current.current.locations.point;if(draft){const x=view.x+draft.x*view.scale,y=view.y+draft.y*view.scale;ctx.strokeStyle=theme.getPropertyValue("--st-text-strong");ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.strokeRect(x-10,y-10,20,20);ctx.setLineDash([]);}
      ctx.restore();
      canvas.dataset.zoom = String(view.scale); canvas.dataset.viewX = String(view.x); canvas.dataset.viewY = String(view.y);
    }
    function render() {
      renderFrame = 0; const start = performance.now();
      for (const key of queue) { pixels.putImageData(paintTerrainTile(current.current.grid, current.current.seaLevel, key, shape), key % (shape.width / shape.tileSize) * shape.tileSize, Math.floor(key / (shape.width / shape.tileSize)) * shape.tileSize); queue.delete(key); if (performance.now() - start > 6) break; }
      draw(); canvas.dataset.renderPending = String(queue.size);
      if (queue.size) renderFrame = requestAnimationFrame(render);
    }
    function refresh(keys?: Iterable<number>) { for (const key of terrainRenderKeys(keys, shape)) queue.add(key); if (!renderFrame) renderFrame = requestAnimationFrame(render); }
    const observer = new ResizeObserver(() => { const rect = canvas.getBoundingClientRect(), previousWidth = width, previousHeight = height; width = rect.width; height = rect.height; const dpr = Math.min(2, window.devicePixelRatio || 1); canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); if (!initialized) { view = fitTerrain(width, height, shape); initialized = true; } else { view.x += (width - previousWidth) / 2; view.y += (height - previousHeight) / 2; } draw(); }); observer.observe(canvas);
    api.current = { refresh, fit: () => { view = fitTerrain(width, height, shape); draw(); }, zoom: factor => { view = zoomTerrain(view, width / 2, height / 2, factor); draw(); }, pan: (x, y) => { view = { ...view, x: view.x + x, y: view.y + y }; draw(); },redraw:draw };
    function inspect(p: { x: number; y: number }) { const g = terrainPoint(view, p.x, p.y, shape), x = Math.floor(g.x), y = Math.floor(g.y); if (x >= 0 && x < shape.width && y >= 0 && y < shape.height) { const z = current.current.grid[y * shape.width + x]; current.current.onInspect(`Elevation ${z.toLocaleString()} m · ${z <= current.current.seaLevel ? "water" : "land"} · sample ${x}, ${y}`); } }
    function dab(p: { x: number; y: number }) {
      if (!gesture || gesture.mode !== "sculpt") return;
      const g = terrainPoint(view, p.x, p.y, shape), last = gesture.last, distance = Math.hypot(g.x - last.x, g.y - last.y), step = Math.max(1, current.current.brush.radius / 3), steps = Math.max(1, Math.ceil(distance / step));
      // Pointer capture can travel far outside the map. Clamp work to one map diagonal.
      if (distance > Math.hypot(shape.width, shape.height) * 2) { gesture.last = g; return; }
      const touched = new Set<number>(), start = performance.now();
      for (let s = 1; s <= steps; s++) for (const key of sculpt(current.current.grid, last.x + (g.x - last.x) * s / steps, last.y + (g.y - last.y) * s / steps, current.current.brush, gesture.before, shape)) touched.add(key);
      gesture.last = g; current.current.onMeasure(performance.now() - start); if (touched.size) refresh(touched);
    }
    function finish() { if (!gesture) return; if (latest) { const e = latest; latest = null; if (gesture.mode === "sculpt") dab(point(e)); } const patch = finishPatch(current.current.grid, gesture.before); gesture = null; if (patch.indices.length) current.current.onStroke(patch); current.current.onWorking(false); }
    function down(e: PointerEvent) {
      if (e.button !== 0 && e.button !== 1) return; e.preventDefault(); canvas.focus(); canvas.setPointerCapture(e.pointerId); const p = point(e); positions.set(e.pointerId, p);
      if (positions.size > 1) { finish(); const [a, b] = [...positions.values()]; pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; return; }
      const tool=current.current.tool;
      if(tool==="locations"&&e.button===0){let selected:MapPlace|undefined;for(const marker of current.current.locations.markers)for(const offset of shape.wrap?[-shape.displayWidth,0,shape.displayWidth]:[0])if(Math.hypot(p.x-view.x-(marker.x+offset)*view.scale,p.y-view.y-marker.y*view.scale)<22)selected=marker;
        try{const physical=normalizePlacePoint((p.x-view.x)/view.scale,(p.y-view.y)/view.scale,{widthMetres:shape.displayWidth,heightMetres:shape.displayHeight,wrap:shape.wrap});current.current.onLocation(physical,selected);}catch{/* Outside fixed map bounds does not choose a point. */}return;}
      const mode = e.button === 1 || tool === "pan" ? "pan" : tool === "inspect" || !current.current.canEdit ? "inspect" : "sculpt";
      gesture = { id: e.pointerId, mode, ...p, last: terrainPoint(view, p.x, p.y, shape), before: new Map() }; if (mode === "sculpt") { current.current.onWorking(true); dab(p); } inspect(p);
    }
    function move(e: PointerEvent) {
      const p = point(e); cursor = p; inspect(p);
      if (positions.has(e.pointerId)) positions.set(e.pointerId, p);
      if (pinch && positions.size > 1) { const [a, b] = [...positions.values()], next = { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; view = zoomTerrain(view, pinch.x, pinch.y, next.distance / Math.max(1, pinch.distance)); view.x += next.x - pinch.x; view.y += next.y - pinch.y; pinch = next; draw(); return; }
      if (gesture?.id === e.pointerId) { if (gesture.mode === "pan") { view.x += p.x - gesture.x; view.y += p.y - gesture.y; gesture.x = p.x; gesture.y = p.y; draw(); } else if (gesture.mode === "sculpt") { latest = e; if (!moveFrame) moveFrame = requestAnimationFrame(() => { moveFrame = 0; if (latest) { const last = latest; latest = null; dab(point(last)); } }); } } else draw();
    }
    function up(e: PointerEvent) { positions.delete(e.pointerId); if (gesture?.id === e.pointerId) finish(); if (positions.size < 2) pinch = null; }
    function leave() { cursor = null; draw(); }
    function wheel(e: WheelEvent) { e.preventDefault(); const p = point(e); view = zoomTerrain(view, p.x, p.y, Math.exp(-e.deltaY * .0015)); draw(); }
    canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up); canvas.addEventListener("lostpointercapture", up); canvas.addEventListener("pointerleave", leave); canvas.addEventListener("wheel", wheel, { passive: false }); refresh();
    return () => { observer.disconnect(); cancelAnimationFrame(renderFrame); cancelAnimationFrame(moveFrame); canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up); canvas.removeEventListener("lostpointercapture", up); canvas.removeEventListener("pointerleave", leave); canvas.removeEventListener("wheel", wheel); api.current = null; };
  }, []);
  useEffect(() => { api.current?.refresh(); }, [props.seaLevel]);
  useEffect(()=>{api.current?.redraw();},[props.locations,props.tool]);
  return <canvas ref={element} className={styles.canvas} tabIndex={0} aria-label="Terrain map canvas" aria-describedby="terrain-canvas-help" onKeyDown={e => { const moves: Record<string, [number, number]> = { ArrowLeft: [50, 0], ArrowRight: [-50, 0], ArrowUp: [0, 50], ArrowDown: [0, -50] }; if (moves[e.key]) { e.preventDefault(); api.current?.pan(...moves[e.key]); } else if (e.key === "+" || e.key === "=") api.current?.zoom(1.25); else if (e.key === "-") api.current?.zoom(.8); else if (e.key.toLowerCase() === "f") api.current?.fit(); }} />;
}
