import {drawingSelectionBounds} from "./atlas-drawing-hit";
import { TerritoryScene } from "./territory-scene";
import { DungeonScene } from "./dungeon-scene";
import { InteriorScene } from "./interior-scene";
import { SettlementScene } from "./settlement-scene";
import { memo, useEffect, useImperativeHandle, useMemo, useRef, useState, type RefObject } from "react";
import {createPortal} from "react-dom";
import { MAP_HEIGHT, MAP_WIDTH, mapLabels, polygonCenter, type AtlasFeature, type MapDraft } from "./atlas";
import { curvedPath, defaultPresentation, drawingLayer, strokeSamples, terrainMarks, type MapDrawing, type TerrainDrawing } from "./cartography";
import { terrainBitmap } from "./cartography-raster";
import {createAtlasDraftProjector,projectedAtlasDraft,type AtlasGeographicFrame} from "./atlas-geographic-frame";
import styles from "./cartography.module.css";
import { IslandAssetDefinitions, IslandAssetUse, IslandTerrainArt } from "./island-asset-scene";
import { isIslandStyle,islandAsset } from "./island-assets";
import {islandDrawingReferences,islandArtwork} from "./island-artwork-source";
import {IslandArtworkLoading,useIslandArtwork} from "./island-artwork-loading";
import type { GeographicLandMask } from "./geographic-land-mask";
import { GeographicLandMaskScene } from "./geographic-land-mask-scene";

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

const TerrainArt=memo(function TerrainArt({drawing,prefix,original,frame}:{drawing:TerrainDrawing;prefix:string;original?:TerrainDrawing;frame?:AtlasGeographicFrame}) {
  const marks=useMemo(()=>terrainMarks(original??drawing),[drawing,original]);
  const paintPath=frame&&original?frame.path(original.points,false,.75):curvedPath(drawing.points);
  return <g className={styles.terrainArt} data-terrain-source>
    {drawing.kind==="lake"&&drawing.points.length===1&&<circle cx={drawing.points[0].x} cy={drawing.points[0].y} r={drawing.radius*.8} className={styles.lakeSpot}/>}
    {drawing.kind==="lake"&&<path d={paintPath} className={styles.lakePaint} strokeWidth={drawing.radius*1.6}/>}
    {drawing.kind==="snow"&&drawing.points.length===1&&<circle cx={drawing.points[0].x} cy={drawing.points[0].y} r={drawing.radius*.8} className={styles.snowSpot}/>}
    {drawing.kind==="snow"&&<path d={paintPath} className={styles.snowPaint} strokeWidth={drawing.radius*1.5}/>}
    {marks.filter(m=>!frame||m.x>=0&&m.x<=MAP_WIDTH&&m.y>=0&&m.y<=MAP_HEIGHT).map(mark=>{const p=frame?.project(mark)??mark,scale=mark.scale*(frame?.scaleAt(mark)??1);return <use key={mark.key} data-terrain-mark href={`#${prefix}-${drawing.kind}-${mark.variant}`} transform={`translate(${p.x} ${p.y}) scale(${scale})`}/>;})}
  </g>;
});
function drawingArtworkReady(drawing:MapDrawing){
  if(drawing.version!==2)return true;
  try{return (drawing.type==="symbol"?[drawing.assetRef]:drawing.assetRefs).every(reference=>islandArtwork.read(islandAsset(reference)).state==="ready");}catch{return false;}
}
const CachedTerrain=memo(function CachedTerrain({drawing,original,frame,prefix,motion,palette,unitsPerPixel,allowRaster}:{drawing:TerrainDrawing;original?:TerrainDrawing;frame?:AtlasGeographicFrame;prefix:string;motion:boolean;palette:string;unitsPerPixel:number;allowRaster:boolean}) {
  const sourceDrawing=original??drawing;
  const sourceMarks=useMemo(()=>strokeSamples(sourceDrawing.points,sourceDrawing.spacing).length*sourceDrawing.density,[sourceDrawing]);
  const root=useRef<SVGGElement>(null),[cached,setCached]=useState<{drawing:TerrainDrawing;frame?:AtlasGeographicFrame;prefix:string;palette:string;image:Awaited<ReturnType<typeof terrainBitmap>>}|null>(null);
  const image=cached?.drawing===sourceDrawing&&cached.frame===frame&&cached.prefix===prefix&&cached.palette===palette?cached.image:null;
  useEffect(()=>{
    if(motion||cached?.drawing===sourceDrawing&&cached.frame===frame&&cached.prefix===prefix&&cached.palette===palette)return;
    let alive=true;
    const source=drawingArtworkReady(sourceDrawing)?root.current?.querySelector<SVGGElement>("[data-terrain-source]"):null;
    if(source)void terrainBitmap(source,prefix,drawing).then(image=>{if(alive)setCached({drawing:sourceDrawing,frame,prefix,palette,image});else URL.revokeObjectURL(image.url);}).catch(()=>{});
    return()=>{alive=false;};
  },[drawing,sourceDrawing,frame,prefix,palette,motion,cached]);
  useEffect(()=>()=>{if(cached)URL.revokeObjectURL(cached.image.url);},[cached]);
  // At rest, use the cache only when it exceeds the actual display resolution.
  // Deep zoom and the selected drawing keep live vectors. Motion can reuse the cache temporarily.
  const fast=allowRaster&&image!==null&&(motion||image.scale*unitsPerPixel>=1.2*(typeof window==="undefined"?1:window.devicePixelRatio||1));
  return <g ref={root} data-terrain-cache-ready={image!==null} data-terrain-source-marks={sourceMarks}>{!fast&&(drawing.version===2?<IslandTerrainArt drawing={drawing} original={original} frame={frame} prefix={prefix}/>:<TerrainArt drawing={drawing} original={original} frame={frame} prefix={prefix}/>)}{fast&&<image data-terrain-raster href={image.url} x={image.x} y={image.y} width={image.width} height={image.height} pointerEvents="none"/>}</g>;
});
const DrawingArt=memo(function DrawingArt({drawing,unitsPerPixel,prefix,motion,cacheTerrain,palette,allowRaster,original,frame}:{drawing:MapDrawing;unitsPerPixel:number;prefix:string;motion:boolean;cacheTerrain:boolean;palette:string;allowRaster:boolean;original?:MapDrawing;frame?:AtlasGeographicFrame}) {
  if(drawing.type==="terrain"&&cacheTerrain)return <CachedTerrain drawing={drawing} original={original?.type==="terrain"?original:undefined} frame={frame} prefix={prefix} motion={motion} palette={palette} unitsPerPixel={unitsPerPixel} allowRaster={allowRaster}/>;
  if(drawing.type==="terrain"&&drawing.version===2)return <IslandTerrainArt drawing={drawing} original={original?.type==="terrain"?original:undefined} frame={frame} prefix={prefix}/>;
  if(drawing.type==="symbol"&&drawing.version===2)return <g transform={`translate(${drawing.point.x} ${drawing.point.y}) rotate(${drawing.rotation}) scale(${drawing.scale*(frame&&original?.type==="symbol"?frame.scaleAt(original.point):1)})`}><IslandAssetUse reference={drawing.assetRef} prefix={prefix}/></g>;
  if(drawing.type==="terrain")return <TerrainArt drawing={drawing} original={original?.type==="terrain"?original:undefined} frame={frame} prefix={prefix}/>;
  if(drawing.type==="path"){const d=frame&&original?.type==="path"?frame.path(original.points,false,original.curve):curvedPath(drawing.points,drawing.curve);return <g className={styles.route} data-kind={drawing.kind}><path d={d} className={styles.routeUnder} strokeWidth={drawing.width+3}/><path d={d} strokeWidth={drawing.width}/></g>;}
  if(drawing.type==="symbol")return <g transform={`translate(${drawing.point.x} ${drawing.point.y}) rotate(${drawing.rotation}) scale(${drawing.scale})`} data-ink={drawing.style==="ink"}><CartographicSymbol kind={drawing.kind}/></g>;
  return <text transform={`translate(${drawing.point.x} ${drawing.point.y}) rotate(${drawing.rotation})`} className={styles.label} data-style={drawing.style} fontSize={Math.max(drawing.size,11*unitsPerPixel)} textAnchor="middle">{drawing.text}</text>;
});
function LandOutline({feature,path,className,fill,pointerEvents}:{feature:AtlasFeature;path?:string;className?:string;fill?:string;pointerEvents?:"none"}){return path!==undefined?<path d={path} className={className} fill={fill} pointerEvents={pointerEvents}/>:feature.geometry.type==="polygon"?<polygon points={feature.geometry.points.map(p=>`${p.x},${p.y}`).join(" ")} className={className} fill={fill} pointerEvents={pointerEvents}/>:null;}
export type PaintPreviewHandle={show:(drawing:TerrainDrawing|null)=>void};
/** Only this unfinished stroke renders while the retained map and inspector stay still. */
export function CartographyPaintPreview({handle,target,frame,prefix,unitsPerPixel}:{handle:RefObject<PaintPreviewHandle|null>;target:SVGGElement|null;frame?:AtlasGeographicFrame;prefix:string;unitsPerPixel:number}){
 const [drawing,setDrawing]=useState<TerrainDrawing|null>(null);useImperativeHandle(handle,()=>({show:setDrawing}),[]);
 useIslandArtwork(drawing?.version===2?drawing.assetRefs:[]);
 const projected=useMemo(()=>drawing&&frame?projectedAtlasDraft({name:"Live terrain preview",description:"",scope:"regional",features:[],geographies:[],drawings:[drawing]},frame).drawings![0]:drawing,[drawing,frame]);
 if(!target||!drawing||!projected)return null;
 return createPortal(<><defs>{drawing.version===2?<IslandAssetDefinitions drawings={[drawing]} prefix={prefix} display unitsPerPixel={unitsPerPixel} frame={frame}/>: [0,1,2].map(variant=><g key={variant} id={`${prefix}-${drawing.kind}-${variant}`}><CartographicSymbol kind={drawing.kind} variant={variant}/></g>)}</defs><DrawingArt drawing={projected} original={drawing} frame={frame} unitsPerPixel={unitsPerPixel} prefix={prefix} motion cacheTerrain={false} palette="preview" allowRaster={false}/></>,target);
}
export const CartographyScene=memo(function CartographyScene({draft:sourceDraft,id,selectedId,unitsPerPixel=1,editable=true,motion=false,cacheTerrain=false,settlement=true,explorable=false,geographicFrame,landMask,background=true,previewTarget}:{draft:MapDraft;id:string;selectedId?:string|null;unitsPerPixel?:number;editable?:boolean;motion?:boolean;cacheTerrain?:boolean;settlement?:boolean;explorable?:boolean;geographicFrame?:AtlasGeographicFrame;landMask?:GeographicLandMask;background?:boolean;previewTarget?:(target:SVGGElement|null)=>void}) {
  const projector=useMemo(()=>geographicFrame?createAtlasDraftProjector(geographicFrame):null,[geographicFrame]);
  const draft=useMemo(()=>projector?projector(sourceDraft):sourceDraft,[sourceDraft,projector]);
  const paths=useMemo(()=>new Map(sourceDraft.features.flatMap(f=>f.geometry.type==="polygon"&&geographicFrame?[[f.id,geographicFrame.path(f.geometry.points,true)] as const]:[])),[sourceDraft.features,geographicFrame]);
  const originalDrawings=new Map(sourceDraft.drawings?.map(d=>[d.id,d]));
  const drawingPath=(d:MapDrawing)=>{const original=originalDrawings.get(d.id);return geographicFrame&&original&&(original.type==="terrain"||original.type==="path")?geographicFrame.path(original.points,false,original.type==="path"?original.curve:.75):(d.type==="terrain"||d.type==="path")?curvedPath(d.points,d.type==="path"?d.curve:.75):"";};
  const [themeRevision,setThemeRevision]=useState(0);
  useEffect(()=>{if(!cacheTerrain)return;const observer=new MutationObserver(()=>setThemeRevision(n=>n+1));observer.observe(document.documentElement,{attributes:true,attributeFilter:["style","data-appearance-preset"]});return()=>observer.disconnect();},[cacheTerrain]);
  const presentation=draft.presentation??defaultPresentation(),land=draft.features.filter(f=>!f.archived&&f.geometry.type==="polygon");
  const visibleDrawings=useMemo(()=>(sourceDraft.drawings??[]).filter(d=>!d.archived&&presentation.layers[drawingLayer(d)].visible),[sourceDraft.drawings,presentation.layers]);
  const artworkReferences=islandDrawingReferences(visibleDrawings),artwork=useIslandArtwork(artworkReferences);
  const labelAnchors=geographicFrame?new Map(sourceDraft.features.map(f=>[f.id,geographicFrame.project(f.geometry.type==="point"?f.geometry.point:polygonCenter(f.geometry.points))])):null;
  const labels=mapLabels(draft.features.filter(f=>{if(f.archived)return false;const p=labelAnchors?.get(f.id);return !p||p.x>=0&&p.x<=MAP_WIDTH&&p.y>=0&&p.y<=MAP_HEIGHT;}),new Map(draft.geographies.map(g=>[g.id,g.name])),unitsPerPixel);
  const terrainKinds=useMemo(()=>[...new Set((draft.drawings??[]).filter((d):d is TerrainDrawing=>d.type==="terrain"&&!d.archived).map(d=>d.kind))],[draft.drawings]);
  const place=(f:AtlasFeature)=>f.geometry.type==="point"?f.geometry.point:{x:0,y:0};
  return <g data-cartography-scene data-artwork-ready={artwork.ready} className={styles.scene} data-style={presentation.style} data-cartographic-style={presentation.version===2?`${presentation.styleRef.id}:${presentation.styleRef.revision}`:undefined}>
    <defs>{landMask&&<GeographicLandMaskScene id={`${id}-source-land`} mask={landMask}/>}<IslandAssetDefinitions drawings={visibleDrawings} prefix={id} display={cacheTerrain} unitsPerPixel={unitsPerPixel} frame={geographicFrame}/>{terrainKinds.map(kind=>[0,1,2].map(variant=><g key={`${kind}-${variant}`} id={`${id}-${kind}-${variant}`}><CartographicSymbol kind={kind} variant={variant}/></g>))}<pattern id={`${id}-grain`} width="53" height="47" patternUnits="userSpaceOnUse"><path d="M 4 7 l 3 0 M 34 12 l 2 1 M 19 29 l 4 -1 M 43 38 l 2 0 M 8 44 l 2 0" className={styles.paperGrain}/></pattern><pattern id={`${id}-sea`} width="130" height="105" patternUnits="userSpaceOnUse"><path d="M 14 50 q 12 -7 24 0 t 24 0 M 76 90 q 12 -7 24 0" className={styles.seaHatch}/></pattern><pattern id={`${id}-grid`} width="100" height="100" patternUnits="userSpaceOnUse"><path d="M 100 0 L 0 0 0 100" className={styles.grid}/></pattern><clipPath id={`${id}-extent`}><rect width={MAP_WIDTH} height={MAP_HEIGHT}/></clipPath><clipPath id={`${id}-land`}>{land.length?land.map(f=>f.geometry.type==="polygon"&&<LandOutline key={f.id} feature={f} path={paths.get(f.id)}/>):<rect width={MAP_WIDTH} height={MAP_HEIGHT}/>}</clipPath></defs>
    <g clipPath={`url(#${id}-extent)`}>
      {presentation.version===2&&!isIslandStyle(presentation)&&<text data-missing-artwork="style" x={1000} y={80} textAnchor="middle" className={styles.label} fontSize={28}>Map style unavailable. Restore the matching artwork release.</text>}
      {background&&<><rect width={MAP_WIDTH} height={MAP_HEIGHT} className={draft.settlementState&&!land.length?styles.settlementPaper:styles.sea}/><rect width={MAP_WIDTH} height={MAP_HEIGHT} fill={`url(#${id}-sea)`} pointerEvents="none"/></>}
      {presentation.layers.land.visible&&land.map(f=>f.geometry.type==="polygon"&&<g key={f.id} data-feature={f.id} data-selected={selectedId===f.id} className={styles.landFeature} pointerEvents={(presentation.layers.land.locked||!editable)&&!explorable?"none":undefined}><LandOutline feature={f} path={paths.get(f.id)} className={styles.coastalHalo}/><LandOutline feature={f} path={paths.get(f.id)} className={styles.land}/><LandOutline feature={f} path={paths.get(f.id)} fill={`url(#${id}-grain)`} pointerEvents="none"/><title>{draft.geographies.find(g=>g.id===f.geographyId)?.name}</title></g>)}
      {(["terrain","waterways","paths","symbols","labels"] as const).map(layer=>presentation.layers[layer].visible&&<g key={layer} data-layer={layer} pointerEvents={(presentation.layers[layer].locked||!editable)&&!explorable?"none":undefined}>{(draft.drawings??[]).filter(d=>!d.archived&&drawingLayer(d)===layer).map(d=><g key={d.id} data-drawing={d.id} pointerEvents={explorable&&!d.geographyId?"none":undefined} data-selected={selectedId===d.id} className={styles.drawing} clipPath={layer==="terrain"&&!landMask?`url(#${id}-land)`:undefined} mask={layer==="terrain"&&landMask?`url(#${id}-source-land)`:undefined}>
        <DrawingArt drawing={d} original={originalDrawings.get(d.id)} frame={geographicFrame} unitsPerPixel={unitsPerPixel} prefix={id} motion={motion} allowRaster={selectedId!==d.id} cacheTerrain={cacheTerrain} palette={JSON.stringify([presentation.version,presentation.style,presentation.version===2?presentation.styleRef:null,themeRevision,drawingArtworkReady(d)])}/>
        {(editable&&!presentation.layers[layer].locked||(explorable&&!!d.geographyId))&&(d.type==="terrain"||d.type==="path"?<path d={drawingPath(d)} data-export-omit className={styles.hitPath} strokeWidth={Math.max(44*unitsPerPixel,d.type==="terrain"?d.radius*1.5:d.width+12)}/>:<rect x={d.point.x-22*unitsPerPixel} y={d.point.y-22*unitsPerPixel} width={44*unitsPerPixel} height={44*unitsPerPixel} data-export-omit className={styles.hit}/>)}
        {selectedId===d.id&&(d.type==="symbol"||d.type==="label")&&(()=>{const box=drawingSelectionBounds(originalDrawings.get(d.id)??d,geographicFrame,unitsPerPixel);return box?<rect {...box} data-export-omit data-selection-highlight className={styles.selectionBox}/>:null;})()}
        {selectedId===d.id&&(d.type==="terrain"||d.type==="path")&&<path d={drawingPath(d)} data-export-omit className={styles.selectedStroke} strokeWidth={2*unitsPerPixel}/>}<title>{d.name}</title>
      </g>)}{layer==="terrain"&&previewTarget&&<g ref={previewTarget} data-export-omit pointerEvents="none" clipPath={!landMask?`url(#${id}-land)`:undefined} mask={landMask?`url(#${id}-source-land)`:undefined}/>}</g>)}
      {presentation.layers.symbols.visible&&draft.features.filter(f=>!f.archived&&f.geometry.type==="point").map(f=><g key={f.id} data-feature={f.id} data-selected={selectedId===f.id} className={styles.place} pointerEvents={(presentation.layers.symbols.locked||!editable)&&!explorable?"none":undefined}><circle cx={place(f).x} cy={place(f).y} r={22*unitsPerPixel} data-export-omit className={styles.hit}/><g data-place-art transform={`translate(${place(f).x} ${place(f).y}) scale(${Math.max(.65,unitsPerPixel*.7)})`}><CartographicSymbol kind="village"/></g><title>{draft.geographies.find(g=>g.id===f.geographyId)?.name}</title></g>)}
      {presentation.layers.labels.visible&&draft.features.filter(f=>!f.archived).map(f=>{if((draft.drawings??[]).some(d=>d.type==="label"&&!d.archived&&d.geographyId===f.geographyId))return null;const label=labels.get(f.id);if(!label)return null;return <text key={f.id} x={label.x} y={label.y} textAnchor="middle" data-geography-label className={styles.placeLabel} fontSize={Math.max(20,13*unitsPerPixel)}>{label.text}</text>;})}
      {draft.territories&&<TerritoryScene territories={draft.territories} selectedId={selectedId} units={unitsPerPixel}/>}
      {background&&<><rect x="12" y="12" width={MAP_WIDTH-24} height={MAP_HEIGHT-24} className={styles.frame}/><rect x="22" y="22" width={MAP_WIDTH-44} height={MAP_HEIGHT-44} className={styles.innerFrame}/></>}
      {presentation.grid&&<rect width={MAP_WIDTH} height={MAP_HEIGHT} fill={`url(#${id}-grid)`} pointerEvents="none"/>}
      {background&&<><g transform={`translate(${MAP_WIDTH-105} 105)`} className={styles.compass}><circle r="47"/><circle r="38"/><path d="M 0 -61 L 11 -9 L 61 0 L 11 9 L 0 61 L -11 9 L -61 0 L -11 -9 Z"/><path d="M 0 -61 L 0 0 L 11 -9 Z M 61 0 L 0 0 L 11 9 Z M 0 61 L 0 0 L -11 9 Z M -61 0 L 0 0 L -11 -9 Z" className={styles.compassShade}/><text y="-72" textAnchor="middle">N</text></g></>}
      {draft.dungeonState&&<DungeonScene draft={draft} selectedId={selectedId} units={unitsPerPixel}/>}
      {draft.interiorState&&<InteriorScene draft={draft} selectedId={selectedId} unitsPerPixel={unitsPerPixel}/>}
      {settlement&&draft.settlementShapes&&<SettlementScene draft={draft} selectedId={selectedId} units={unitsPerPixel} explorable={explorable}/>}
    </g>
    <IslandArtworkLoading references={artworkReferences} unitsPerPixel={unitsPerPixel}/>
  </g>;
});
