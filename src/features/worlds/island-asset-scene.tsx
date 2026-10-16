import { memo, useMemo,useEffect,useSyncExternalStore } from "react";
import type { MapDrawing, TerrainDrawing } from "./cartography";
import { strokeSamples } from "./cartography";
import { islandAsset, assetReference, type AssetReference } from "./island-assets";
import type { AtlasGeographicFrame } from "./atlas-geographic-frame";
import { MAP_WIDTH, MAP_HEIGHT } from "./atlas-coordinates";
import {islandArtwork,islandDrawingReferences,islandArtworkImage,islandArtworkImageBounds} from "./island-artwork-source";
import {useIslandArtwork} from "./island-artwork-loading";
import {islandArtworkBitmaps,adequateIslandBitmap} from "./island-artwork-bitmap";

export const assetDefinitionId = (prefix: string, ref: AssetReference) => `${prefix}-asset-${ref.libraryId}-${ref.libraryRevision}-${ref.assetId}-${ref.assetRevision}`;
function availableAsset(reference: AssetReference) { try { return islandAsset(reference); } catch { return null; } }
const AssetDefinition=memo(function AssetDefinition({id,revision,asset,display,unitsPerPixel,maximumScale}:{id:string;revision:string;asset:ReturnType<typeof islandAsset>;display:boolean;unitsPerPixel:number;maximumScale:number}){
  useSyncExternalStore(islandArtworkBitmaps.subscribe,islandArtworkBitmaps.version,()=>0);
  useEffect(()=>{if(display)void islandArtworkBitmaps.ensure(asset);},[asset,display]);
  const bitmap=islandArtworkBitmaps.read(asset),raster=display&&bitmap?.state==="ready"&&adequateIslandBitmap(bitmap,unitsPerPixel,maximumScale,typeof window==="undefined"?1:window.devicePixelRatio||1);
  const href=raster?bitmap.url:islandArtworkImage(asset),[x,y,width,height]=islandArtworkImageBounds(asset);
  return href?<g id={id} data-asset-revision={revision} data-artwork-display-ready={!display||bitmap?.state==="ready"||bitmap?.state==="error"} data-artwork-bitmap={raster}><image data-island-source={JSON.stringify(assetReference(asset))} href={href} x={x} y={y} width={width} height={height}/></g>:null;
});
const AssetDefinitions=memo(function AssetDefinitions({references,prefix,display,unitsPerPixel,scales}:{references:AssetReference[];prefix:string;display:boolean;unitsPerPixel:number;scales:Record<string,number>}){
  useIslandArtwork(references);
  const refs = new Map(references.map(ref=>[assetDefinitionId(prefix,ref),ref]));
  return <>{[...refs].map(([id, ref]) => {
    const asset = availableAsset(ref);
    const source=asset?islandArtwork.read(asset):null;
    return asset&&source?.state==="ready" ? <AssetDefinition key={id} id={id} revision={`${asset.id}:${asset.revision}`} asset={asset} display={display} unitsPerPixel={unitsPerPixel} maximumScale={scales[JSON.stringify(ref)]??1}/> : null;
  })}</>;
},(previous,next)=>previous.prefix===next.prefix&&previous.display===next.display&&previous.unitsPerPixel===next.unitsPerPixel&&JSON.stringify(previous.scales)===JSON.stringify(next.scales)&&JSON.stringify(previous.references)===JSON.stringify(next.references));
export function IslandAssetDefinitions({ drawings, prefix,display=false,unitsPerPixel=1,frame }: { drawings: MapDrawing[]; prefix: string;display?:boolean;unitsPerPixel?:number;frame?:AtlasGeographicFrame }) {
  const scales:Record<string,number>={};for(const d of drawings)if(d.version===2){for(const ref of d.type==="symbol"?[d.assetRef]:d.assetRefs){const asset=availableAsset(ref);if(!asset)continue;const bounds=asset.viewBox.split(" ").map(Number),projected=d.type==="symbol"?(frame?.scaleAt(d.point)??1):Math.max(...d.points.map(p=>frame?.scaleAt(p)??1)),scale=d.type==="symbol"?d.scale:d.radius*2/Math.max(bounds[2],bounds[3])*1.2,key=JSON.stringify(ref);scales[key]=Math.max(scales[key]??0,scale*projected);}}
  return <AssetDefinitions references={islandDrawingReferences(drawings)} prefix={prefix} display={display} unitsPerPixel={unitsPerPixel} scales={scales}/>;
}
export function MissingIslandArtwork({ x, y }: { x: number; y: number }) {
  return <g data-missing-artwork><text x={x} y={y} fontSize={18} fill="var(--st-warning)" stroke="var(--st-surface)" strokeWidth={1} paintOrder="stroke">Illustration unavailable</text><title>The exact saved illustration revision is missing. Its reference and editable source are retained; restore the matching artwork release.</title></g>;
}
export function IslandAssetUse({ reference, prefix }: { reference: AssetReference; prefix: string }) {
  const asset=availableAsset(reference);
  return !asset?<MissingIslandArtwork x={0} y={0}/>:islandArtwork.read(asset).state==="ready"?<use href={`#${assetDefinitionId(prefix, reference)}`}/>:null;
}
export function assetTerrainMarks(drawing: Extract<TerrainDrawing, { version: 2 }>) {
  let state = drawing.seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const assets = drawing.assetRefs.map(reference => ({ reference, asset: islandAsset(reference) }));
  return strokeSamples(drawing.points, drawing.spacing).flatMap((point, i) => Array.from({ length: drawing.density }, (_, j) => {
    const x = point.x + (random() - .5) * drawing.radius * 1.35, y = point.y + (random() - .5) * drawing.radius;
    const size = .85 + random() * .35, selected = assets[Math.floor(random() * assets.length)], bounds = selected.asset.viewBox.split(" ").map(Number), rotation = (random() - .5) * 8;
    return { key: `${i}:${j}`, x, y, scale: drawing.radius * 2 / Math.max(bounds[2], bounds[3]) * size, rotation, reference: selected.reference };
  })).sort((a, b) => a.y - b.y);
}
export function IslandTerrainArt({ drawing, original, frame, prefix }: { drawing: Extract<TerrainDrawing, { version: 2 }>; original?: TerrainDrawing; frame?: AtlasGeographicFrame; prefix: string }) {
  const source = original?.version === 2 ? original : drawing;
  const result = useMemo(() => { try { return { marks: assetTerrainMarks(source), missing: false }; } catch { return { marks: [], missing: true }; } }, [source]);
  if (result.missing) return <MissingIslandArtwork x={drawing.points[0].x} y={drawing.points[0].y} />;
  if(!source.assetRefs.every(reference=>islandArtwork.read(islandAsset(reference)).state==="ready"))return null;
  return <g data-terrain-source data-illustrated-terrain pointerEvents="none">{result.marks.filter(mark => !frame || mark.x >= 0 && mark.x <= MAP_WIDTH && mark.y >= 0 && mark.y <= MAP_HEIGHT).map(mark => {
    const point = frame?.project(mark) ?? mark, scale = mark.scale * (frame?.scaleAt(mark) ?? 1);
    const transform=`translate(${point.x} ${point.y}) rotate(${mark.rotation}) scale(${scale})`;
    return <use key={mark.key} data-terrain-mark href={`#${assetDefinitionId(prefix, mark.reference)}`} transform={transform} />;
  })}</g>;
}
