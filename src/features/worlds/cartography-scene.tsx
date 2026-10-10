import { DungeonScene } from "./dungeon-scene";
import { InteriorScene } from "./interior-scene";
import { SettlementScene } from "./settlement-scene";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { MAP_HEIGHT, MAP_WIDTH, mapLabels, type AtlasFeature, type MapDraft } from "./atlas";
import { curvedPath, defaultPresentation, drawingLayer, terrainMarks, type MapDrawing, type TerrainDrawing } from "./cartography";
import { terrainBitmap } from "./cartography-raster";
import styles from "./cartography.module.css";

// Original vector marks. The reference maps are inspiration, not an asset library.
export function CartographicSymbol({kind,variant=0}:{kind:string;variant?:number}) {
  const lean=variant*3;
  if(kind==="mountain"||kind==="mountains")return <g className={styles.mountain}><path d={`M -28 17 L ${-4+lean} -30 L 28 17 Q 0 23 -28 17 Z`}/><path className={styles.shadow} d={`M ${-4+lean} -30 L 3 15 L 28 17 Z`}/><path className={styles.snowcap} d={`M ${-4+lean} -30 L -13 -11 L -3 -16 L 4 -10 L 10 -12 Z`}/><path className={styles.hatch} d="M -18 11 l 6 -14 M -12 14 l 7 -17 M 10 9 l 7 4 M 13 4 l 7 4"/></g>;
  if(kind==="pine"||kind==="forest")return <g className={styles.forest}><path d="M -1 19 L 1 -18"/><path d={`M 0 ${-29+lean} L -12 -7 L -7 -9 L -18 7 L -10 5 L -23 20 Q 0 26 23 20 L 10 5 L 18 7 L 7 -9 L 12 -7 Z`}/><path className={styles.hatch} d="M 0 -18 L 0 18 M 2 -2 l 9 5 M -1 7 l -10 5"/></g>;
  if(kind==="hills")return <g className={styles.hills}><path d="M -32 15 Q -10 -23 8 11 M -5 14 Q 15 -13 33 15"/><path className={styles.hatch} d="M -16 13 l 5 -13 M -10 15 l 5 -12 M 16 15 l 4 -10"/></g>;
  if(kind==="valleys")return <g className={styles.hills}><path d="M -31 -12 Q -15 18 0 20 Q 15 18 31 -12 M -29 -17 Q -15 11 -8 11 M 8 11 Q 15 11 29 -17"/><path className={styles.hatch} d="M -16 3 l -6 5 M -10 10 l -5 6 M 16 3 l 6 5 M 10 10 l 5 6"/></g>;
  if(kind==="grassland")return <g className={styles.grass}><path d="M -17 8 Q -25 -5 -26 2 M -17 8 Q -14 -7 -8 -8 M 3 15 Q 2 -4 -3 -5 M 3 15 Q 12 -3 15 3 M 20 -6 l 4 -7"/></g>;
  if(kind==="desert")return <g className={styles.dunes}><path d="M -35 9 Q -18 -16 0 3 Q 19 16 35 -3 M -23 19 Q -8 -5 12 12 M -18 7 Q -8 0 1 6"/><path className={styles.hatch} d="M -19 18 l 5 -9 M -13 20 l 5 -9 M -7 22 l 5 -9"/></g>;
  if(kind==="wetland")return <g className={styles.wetland}><path d="M -30 15 Q -16 9 -2 15 M 5 20 Q 18 13 30 20 M -20 3 l 0 -20 M -25 -5 l 5 8 l 6 -10 M 15 6 l 0 -17 M 11 -1 l 4 7 l 5 -9"/><path d="M -21 -20 l 2 0 l 0 9 l -2 0 Z"/></g>;
  if(kind==="snow")return <g className={styles.ice}><path d="M -14 0 L 14 0 M -7 -12 L 7 12 M 7 -12 L -7 12 M -10 -4 L -6 0 L -10 4 M 10 -4 L 6 0 L 10 4 M -7 -7 l 4 -1 l 1 -4 M 7 7 l -4 1 l -1 4"/></g>;
  if(kind==="lake")return <g className={styles.ripple}><path d="M -20 -4 Q -10 -8 0 -4 T 20 -4 M -13 6 Q -3 2 7 6 T 22 6"/></g>;
  if(kind==="village")return <g className={styles.settlement}><path d="M -23 14 l 0 -20 l 12 -10 l 12 10 l 0 20 Z M 4 15 l 0 -15 l 9 -8 l 10 8 l 0 15 Z"/><path className={styles.roof} d="M -26 -5 l 15 -13 l 15 13 l -5 2 l -10 -10 l -10 10 Z M 1 0 l 12 -10 l 13 10"/><path className={styles.hatch} d="M -14 14 l 0 -10 l 6 0 l 0 10 M 9 4 l 5 0 l 0 5 l -5 0 Z"/></g>;
  if(kind==="city"||kind==="castle"||kind==="tower")return <g className={styles.settlement}><path d="M -25 17 L -25 -11 L -19 -11 L -19 -17 L -12 -17 L -12 -11 L -6 -11 L -6 17 Z M 6 17 L 6 -11 L 12 -11 L 12 -17 L 19 -17 L 19 -11 L 25 -11 L 25 17 Z M -6 17 L -6 -2 L 6 -2 L 6 17 Z"/><path className={styles.roof} d="M -27 -17 l 10 -13 l 12 13 Z M 4 -17 l 12 -13 l 12 13 Z"/><path className={styles.hatch} d="M -3 17 l 0 -11 q 3 -5 6 0 l 0 11 M -17 -6 l 0 7 M 17 -6 l 0 7"/></g>;
  if(kind==="ruin")return <g className={styles.settlement}><path d="M -24 18 L -24 -10 L -17 -10 L -17 0 L -10 -5 L -6 3 L 0 0 L 4 18 M 13 18 l 0 -26 l 9 0 l 0 26"/><path className={styles.hatch} d="M -24 6 l 10 0 M -15 13 l 10 0 M 13 0 l 9 0"/></g>;
  return <g className={styles.settlement}><path d="M 0 -23 l 0 35 M -13 -15 Q 0 -28 13 -15 M -24 2 Q -24 20 0 20 Q 24 20 24 2 M -28 1 l 8 0 M 20 1 l 8 0 M -15 15 L 0 26 L 15 15"/></g>;
}

const TerrainArt=memo(function TerrainArt({drawing,prefix}:{drawing:TerrainDrawing;prefix:string}) {
  const marks=useMemo(()=>terrainMarks(drawing),[drawing]);
  return <g className={styles.terrainArt} data-terrain-source>
    {drawing.kind==="lake"&&drawing.points.length===1&&<circle cx={drawing.points[0].x} cy={drawing.points[0].y} r={drawing.radius*.8} className={styles.lakeSpot}/>}
    {drawing.kind==="lake"&&<path d={curvedPath(drawing.points)} className={styles.lakePaint} strokeWidth={drawing.radius*1.6}/>}
    {drawing.kind==="snow"&&drawing.points.length===1&&<circle cx={drawing.points[0].x} cy={drawing.points[0].y} r={drawing.radius*.8} className={styles.snowSpot}/>}
    {drawing.kind==="snow"&&<path d={curvedPath(drawing.points)} className={styles.snowPaint} strokeWidth={drawing.radius*1.5}/>}
    {marks.map(mark=><use key={mark.key} data-terrain-mark href={`#${prefix}-${drawing.kind}-${mark.variant}`} transform={`translate(${mark.x} ${mark.y}) scale(${mark.scale})`}/>)}
  </g>;
});
const CachedTerrain=memo(function CachedTerrain({drawing,prefix,motion,palette,unitsPerPixel,allowRaster}:{drawing:TerrainDrawing;prefix:string;motion:boolean;palette:string;unitsPerPixel:number;allowRaster:boolean}) {
  const root=useRef<SVGGElement>(null),[cached,setCached]=useState<{drawing:TerrainDrawing;prefix:string;palette:string;image:Awaited<ReturnType<typeof terrainBitmap>>}|null>(null);
  const image=cached?.drawing===drawing&&cached.prefix===prefix&&cached.palette===palette?cached.image:null;
  useEffect(()=>{
    let alive=true,url:string|undefined;
    const source=root.current?.querySelector<SVGGElement>("[data-terrain-source]");
    if(source)void terrainBitmap(source,prefix,drawing).then(image=>{url=image.url;if(alive)setCached({drawing,prefix,palette,image});else URL.revokeObjectURL(url);}).catch(()=>{});
    return()=>{alive=false;if(url)URL.revokeObjectURL(url);};
  },[drawing,prefix,palette]);
  // At rest, use the cache only when it exceeds the actual display resolution.
  // Deep zoom and the selected drawing keep live vectors. Motion can reuse the cache temporarily.
  const fast=allowRaster&&image!==null&&(motion||image.scale*unitsPerPixel>=1.2*(typeof window==="undefined"?1:window.devicePixelRatio||1));
  return <g ref={root} data-terrain-cache-ready={image!==null}><g style={{display:fast?"none":undefined}}><TerrainArt drawing={drawing} prefix={prefix}/></g>{fast&&<image data-terrain-raster href={image.url} x={image.x} y={image.y} width={image.width} height={image.height} pointerEvents="none"/>}</g>;
});
const DrawingArt=memo(function DrawingArt({drawing,unitsPerPixel,prefix,motion,cacheTerrain,palette,allowRaster}:{drawing:MapDrawing;unitsPerPixel:number;prefix:string;motion:boolean;cacheTerrain:boolean;palette:string;allowRaster:boolean}) {
  if(drawing.type==="terrain")return cacheTerrain?<CachedTerrain drawing={drawing} prefix={prefix} motion={motion} palette={palette} unitsPerPixel={unitsPerPixel} allowRaster={allowRaster}/>:<TerrainArt drawing={drawing} prefix={prefix}/>;
  if(drawing.type==="path")return <g className={styles.route} data-kind={drawing.kind}><path d={curvedPath(drawing.points,drawing.curve)} className={styles.routeUnder} strokeWidth={drawing.width+3}/><path d={curvedPath(drawing.points,drawing.curve)} strokeWidth={drawing.width}/></g>;
  if(drawing.type==="symbol")return <g transform={`translate(${drawing.point.x} ${drawing.point.y}) rotate(${drawing.rotation}) scale(${drawing.scale})`} data-ink={drawing.style==="ink"}><CartographicSymbol kind={drawing.kind}/></g>;
  return <text transform={`translate(${drawing.point.x} ${drawing.point.y}) rotate(${drawing.rotation})`} className={styles.label} data-style={drawing.style} fontSize={Math.max(drawing.size,11*unitsPerPixel)} textAnchor="middle">{drawing.text}</text>;
});
export const CartographyScene=memo(function CartographyScene({draft,id,selectedId,unitsPerPixel=1,editable=true,motion=false,cacheTerrain=false,settlement=true,explorable=false}:{draft:MapDraft;id:string;selectedId?:string|null;unitsPerPixel?:number;editable?:boolean;motion?:boolean;cacheTerrain?:boolean;settlement?:boolean;explorable?:boolean}) {
  const [themeRevision,setThemeRevision]=useState(0);
  useEffect(()=>{if(!cacheTerrain)return;const observer=new MutationObserver(()=>setThemeRevision(n=>n+1));observer.observe(document.documentElement,{attributes:true,attributeFilter:["style","data-appearance-preset"]});return()=>observer.disconnect();},[cacheTerrain]);
  const presentation=draft.presentation??defaultPresentation(),land=draft.features.filter(f=>!f.archived&&f.geometry.type==="polygon"),labels=mapLabels(draft.features.filter(f=>!f.archived),new Map(draft.geographies.map(g=>[g.id,g.name])),unitsPerPixel);
  const terrainKinds=useMemo(()=>[...new Set((draft.drawings??[]).filter((d):d is TerrainDrawing=>d.type==="terrain"&&!d.archived).map(d=>d.kind))],[draft.drawings]);
  const place=(f:AtlasFeature)=>f.geometry.type==="point"?f.geometry.point:{x:0,y:0};
  return <g data-cartography-scene className={styles.scene} data-style={presentation.style}>
    <defs>{terrainKinds.map(kind=>[0,1,2].map(variant=><g key={`${kind}-${variant}`} id={`${id}-${kind}-${variant}`}><CartographicSymbol kind={kind} variant={variant}/></g>))}<pattern id={`${id}-grain`} width="53" height="47" patternUnits="userSpaceOnUse"><path d="M 4 7 l 3 0 M 34 12 l 2 1 M 19 29 l 4 -1 M 43 38 l 2 0 M 8 44 l 2 0" className={styles.paperGrain}/></pattern><pattern id={`${id}-sea`} width="130" height="105" patternUnits="userSpaceOnUse"><path d="M 14 50 q 12 -7 24 0 t 24 0 M 76 90 q 12 -7 24 0" className={styles.seaHatch}/></pattern><pattern id={`${id}-grid`} width="100" height="100" patternUnits="userSpaceOnUse"><path d="M 100 0 L 0 0 0 100" className={styles.grid}/></pattern><clipPath id={`${id}-extent`}><rect width={MAP_WIDTH} height={MAP_HEIGHT}/></clipPath><clipPath id={`${id}-land`}>{land.length?land.map(f=>f.geometry.type==="polygon"&&<polygon key={f.id} points={f.geometry.points.map(p=>`${p.x},${p.y}`).join(" ")}/>):<rect width={MAP_WIDTH} height={MAP_HEIGHT}/>}</clipPath></defs>
    <g clipPath={`url(#${id}-extent)`}>
      <rect width={MAP_WIDTH} height={MAP_HEIGHT} className={draft.settlementState&&!land.length?styles.settlementPaper:styles.sea}/><rect width={MAP_WIDTH} height={MAP_HEIGHT} fill={`url(#${id}-sea)`} pointerEvents="none"/>
      {presentation.layers.land.visible&&land.map(f=>f.geometry.type==="polygon"&&<g key={f.id} data-feature={f.id} data-selected={selectedId===f.id} className={styles.landFeature} pointerEvents={(presentation.layers.land.locked||!editable)&&!explorable?"none":undefined}><polygon points={f.geometry.points.map(p=>`${p.x},${p.y}`).join(" ")} className={styles.coastalHalo}/><polygon points={f.geometry.points.map(p=>`${p.x},${p.y}`).join(" ")} className={styles.land}/><polygon points={f.geometry.points.map(p=>`${p.x},${p.y}`).join(" ")} fill={`url(#${id}-grain)`} pointerEvents="none"/><title>{draft.geographies.find(g=>g.id===f.geographyId)?.name}</title></g>)}
      {(["terrain","waterways","paths","symbols","labels"] as const).map(layer=>presentation.layers[layer].visible&&<g key={layer} data-layer={layer} pointerEvents={(presentation.layers[layer].locked||!editable)&&!explorable?"none":undefined}>{(draft.drawings??[]).filter(d=>!d.archived&&drawingLayer(d)===layer).map(d=><g key={d.id} data-drawing={d.id} pointerEvents={explorable&&!d.geographyId?"none":undefined} data-selected={selectedId===d.id} className={styles.drawing} clipPath={layer==="terrain"?`url(#${id}-land)`:undefined}>
        <DrawingArt drawing={d} unitsPerPixel={unitsPerPixel} prefix={id} motion={motion} allowRaster={selectedId!==d.id} cacheTerrain={cacheTerrain} palette={`${presentation.style}:${themeRevision}`}/>
        {(editable||(explorable&&!!d.geographyId))&&(d.type==="terrain"||d.type==="path"?<path d={curvedPath(d.points,d.type==="path"?d.curve:.75)} data-export-omit className={styles.hitPath} strokeWidth={Math.max(44*unitsPerPixel,d.type==="terrain"?d.radius*1.5:d.width+12)}/>:<rect x={d.point.x-22*unitsPerPixel} y={d.point.y-22*unitsPerPixel} width={44*unitsPerPixel} height={44*unitsPerPixel} data-export-omit className={styles.hit}/>)}
        {selectedId===d.id&&(d.type==="terrain"||d.type==="path")&&<path d={curvedPath(d.points)} data-export-omit className={styles.selectedStroke} strokeWidth={2*unitsPerPixel}/>}<title>{d.name}</title>
      </g>)}</g>)}
      {presentation.layers.symbols.visible&&draft.features.filter(f=>!f.archived&&f.geometry.type==="point").map(f=><g key={f.id} data-feature={f.id} data-selected={selectedId===f.id} className={styles.place} pointerEvents={(presentation.layers.symbols.locked||!editable)&&!explorable?"none":undefined}><circle cx={place(f).x} cy={place(f).y} r={22*unitsPerPixel} data-export-omit className={styles.hit}/><g data-place-art transform={`translate(${place(f).x} ${place(f).y}) scale(${Math.max(.65,unitsPerPixel*.7)})`}><CartographicSymbol kind="village"/></g><title>{draft.geographies.find(g=>g.id===f.geographyId)?.name}</title></g>)}
      {presentation.layers.labels.visible&&draft.features.filter(f=>!f.archived).map(f=>{if((draft.drawings??[]).some(d=>d.type==="label"&&!d.archived&&d.geographyId===f.geographyId))return null;const label=labels.get(f.id)!;return <text key={f.id} x={label.x} y={label.y} textAnchor="middle" data-geography-label className={styles.placeLabel} fontSize={Math.max(20,13*unitsPerPixel)}>{label.text}</text>;})}
      <rect x="12" y="12" width={MAP_WIDTH-24} height={MAP_HEIGHT-24} className={styles.frame}/><rect x="22" y="22" width={MAP_WIDTH-44} height={MAP_HEIGHT-44} className={styles.innerFrame}/>
      {presentation.grid&&<rect width={MAP_WIDTH} height={MAP_HEIGHT} fill={`url(#${id}-grid)`} pointerEvents="none"/>}
      <g transform={`translate(${MAP_WIDTH-105} 105)`} className={styles.compass}><circle r="47"/><circle r="38"/><path d="M 0 -61 L 11 -9 L 61 0 L 11 9 L 0 61 L -11 9 L -61 0 L -11 -9 Z"/><path d="M 0 -61 L 0 0 L 11 -9 Z M 61 0 L 0 0 L 11 9 Z M 0 61 L 0 0 L -11 9 Z M -61 0 L 0 0 L -11 -9 Z" className={styles.compassShade}/><text y="-72" textAnchor="middle">N</text></g>
      {draft.dungeonState&&<DungeonScene draft={draft} selectedId={selectedId} units={unitsPerPixel}/>}
      {draft.interiorState&&<InteriorScene draft={draft} selectedId={selectedId} unitsPerPixel={unitsPerPixel}/>}
      {settlement&&draft.settlementShapes&&<SettlementScene draft={draft} selectedId={selectedId} units={unitsPerPixel} explorable={explorable}/>}
    </g>
  </g>;
});
