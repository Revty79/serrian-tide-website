import {worldApi} from "./client-api";
import type {AtlasGeography} from "./atlas-geographic-workspace";
import type {GeographicViewport} from "./geographic";
import type {RasterView} from "./raster";
import type {CategoricalView} from "./categorical-raster";

export function visibleMapExportIssue(geo:AtlasGeography){
 if(geo.context?.historical)return "";
 if(geo.loading)return "Geographic detail is still loading. Wait for this view before downloading it.";
 if(geo.error)return "Geographic detail is incomplete. Retry the geographic layers before downloading this view.";
 for(const [name,source] of [["Terrain relief",geo.elevation],["Land cover",geo.landCover]] as const){const state=source.exportState;if(!state.settings.visible)continue;if(state.error)return `${name} is incomplete. Retry its resources before downloading the visible map.`;if(!state.ready)return `${name} is still loading. Wait for its resources before downloading the visible map.`;}
 return "";
}
export function geographicExportCredits(geo:AtlasGeography){
 const credits=geo.viewport?.attributions.map(c=>`${c.label} · ${c.license} · ${c.url}`)??[];
 for(const source of [geo.elevation,geo.landCover]){const c=source.credit;if(source.image&&c)credits.push(`${c.label} · ${c.license} · ${c.url}${"observationPeriod"in c&&c.observationPeriod?` · ${c.observationPeriod}`:""}`);}
 if(geo.frame)credits.unshift(`${geo.kind} · ${geo.frame.reference.crs} · view extent [${geo.extent!.map(v=>Number(v.toFixed(6))).join(", ")}]`);
 return credits;
}
/** Authorize the exact included originals again immediately before the local download. */
export async function authorizeGeographicExport(geo:AtlasGeography){
 if(!geo.frame||!geo.viewport||!geo.context)return;const issue=visibleMapExportIssue(geo);if(issue)throw new Error(issue);
 const q=new URLSearchParams({map:geo.viewport.layer.mapId,timeline:geo.context.timelineId,bounds:JSON.stringify(geo.extent),projection:geo.kind,lod:geo.viewport.lod,themes:geo.themes.join(","),...geo.context.ordinary?{ordinary:"1"}:{},...geo.context.review?{review:"1"}:{}}),base=`/api/worlds/${geo.context.worldId}`;
 const fresh=await worldApi<GeographicViewport>(`${base}/geography?${q}`);
 if(fresh.context!==geo.viewport.context||JSON.stringify(fresh.layer)!==JSON.stringify(geo.viewport.layer)||fresh.canEdit!==geo.viewport.canEdit)throw new Error("Geographic sources or access changed. Retry the map layers before exporting.");
 for(const [domain,source] of [["elevation",geo.elevation],["land-cover",geo.landCover]] as const){
  if(!source.image)continue;const expected=source.exportState.view;if(!expected)throw new Error("A geographic image is not ready for export.");const request=new URLSearchParams(q);request.set("version",expected.versionId);if(domain==="elevation")request.set("style",geo.elevation.exportState.settings.style);
  const current=await worldApi<RasterView|CategoricalView|null>(`${base}/${domain}?${request}`);
  if(!current||current.sourceId!==expected.sourceId||current.versionId!==expected.versionId||current.archived||current.grid.width!==expected.grid.width||current.grid.height!==expected.grid.height||JSON.stringify(current.grid.bounds)!==JSON.stringify(expected.grid.bounds))throw new Error("Geographic image access changed. Retry its authorized view before exporting.");
 }
}
