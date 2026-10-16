import { memo, useMemo } from "react";
import type { MapDrawing, TerrainDrawing } from "./cartography";
import { strokeSamples } from "./cartography";
import { islandAsset, type AssetReference } from "./island-assets";
import type { AtlasGeographicFrame } from "./atlas-geographic-frame";
import { MAP_WIDTH, MAP_HEIGHT } from "./atlas-coordinates";
import {islandArtwork,islandDrawingReferences} from "./island-artwork-source";
import {useIslandArtwork} from "./island-artwork-loading";

export const assetDefinitionId = (prefix: string, ref: AssetReference) => `${prefix}-asset-${ref.libraryId}-${ref.libraryRevision}-${ref.assetId}-${ref.assetRevision}`;
function availableAsset(reference: AssetReference) { try { return islandAsset(reference); } catch { return null; } }
const AssetDefinition=memo(function AssetDefinition({id,revision,svg}:{id:string;revision:string;svg:string}){
  return <g id={id} data-asset-revision={revision} dangerouslySetInnerHTML={{__html:svg}}/>;
});
const AssetDefinitions=memo(function AssetDefinitions({references,prefix}:{references:AssetReference[];prefix:string}){
  useIslandArtwork(references);
  const refs = new Map(references.map(ref=>[assetDefinitionId(prefix,ref),ref]));
  return <>{[...refs].map(([id, ref]) => {
    const asset = availableAsset(ref);
    const source=asset?islandArtwork.read(asset):null;
    return asset&&source?.state==="ready" ? <AssetDefinition key={id} id={id} revision={`${asset.id}:${asset.revision}`} svg={source.svg!}/> : null;
  })}</>;
},(previous,next)=>previous.prefix===next.prefix&&JSON.stringify(previous.references)===JSON.stringify(next.references));
export function IslandAssetDefinitions({ drawings, prefix }: { drawings: MapDrawing[]; prefix: string }) {
  return <AssetDefinitions references={islandDrawingReferences(drawings)} prefix={prefix}/>;
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
    return <use key={mark.key} data-terrain-mark href={`#${assetDefinitionId(prefix, mark.reference)}`} transform={`translate(${point.x} ${point.y}) rotate(${mark.rotation}) scale(${scale})`} />;
  })}</g>;
}
