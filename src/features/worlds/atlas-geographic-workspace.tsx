"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {GuidedField} from "@/components/field-guidance";
import {SaveError,worldApi} from "./client-api";
import {geographicPages,GeographicPageError} from "./geographic-pages";
import {geographicProvenanceLabel,isAuthoredProvenance,automaticGeographicDetail,focusedGeographicExtent,surfaceBounds,sameGeographicViewport,type GeographicViewportStatus,type GeographicBounds,type GeographicLayer,type GeographicReading,type GeographicViewport} from "./geographic";
import {GEOGRAPHIC_THEMES} from "./geographic-themes";
import {atlasGeographicFrame,moveGeographicExtent,projectionExtent} from "./atlas-geographic-frame";
import type {ProjectionKind} from "./geographic-projection";
import {useElevation} from "./elevation-workspace";
import {useLandCover} from "./land-cover-workspace";
import {StudioPanel,useMapStudio} from "./map-studio";
import styles from "./atlas.module.css";

export type AtlasGeographicContext={worldId:string;timelineId:string;ordinary:boolean;review:boolean;historical:boolean};
export function useAtlasGeography(context:AtlasGeographicContext|undefined,mapId:string){
 const studio=useMapStudio();
 const {worldId="",timelineId="",ordinary=false,review=false,historical=false}=context??{},enabled=!!context&&!historical;
 const base=`${worldId}:${timelineId}:${mapId}:${ordinary}:${review}:${enabled}`,api=`/api/worlds/${worldId}/geography`;
 const query=useMemo(()=>new URLSearchParams({map:mapId,timeline:timelineId,...ordinary?{ordinary:"1"}:{},...review?{review:"1"}:{}}).toString(),[mapId,timelineId,ordinary,review]);
 const [layerResult,setLayer]=useState<{key:string;value:GeographicLayer}|null>(null),[viewDraft,setViewDraft]=useState<{key:string;bounds:GeographicBounds|null;projection:ProjectionKind|null}>({key:base,bounds:null,projection:null}),[themes,setThemes]=useState(GEOGRAPHIC_THEMES.map(t=>t.id)),[labels,setLabels]=useState(true),[refresh,setRefresh]=useState(0);
 const bounds=viewDraft.key===base?viewDraft.bounds:null,projection=viewDraft.key===base?viewDraft.projection:null;
 const setBounds=(value:GeographicBounds|null)=>setViewDraft({key:base,bounds:value?projectionExtent(value,projection??"equirectangular"):null,projection});
 const setProjection=(value:ProjectionKind)=>setViewDraft({key:base,bounds:bounds?projectionExtent(bounds,value):null,projection:value});
 const layer=enabled&&layerResult?.key===base?layerResult.value:null,reference=layer?.surface.reference;
 const key=`${base}:${JSON.stringify(bounds)}:${projection}:${refresh}`;
 const [result,setResult]=useState<{key:string;value:GeographicViewport|null;loading:boolean;error:string}|null>(null),current=result?.key===key?result:null;
 const [selection,setSelection]=useState({key:base,id:""}),[readingResult,setReading]=useState<{key:string;value:GeographicReading|null;error:string}|null>(null),selected=selection.key===base?selection.id:"",readKey=`${base}:${selected}:${refresh}`,reading=readingResult?.key===readKey?readingResult:null;
 const setSelected=(id:string)=>setSelection({key:base,id});
 const live=useRef(key);useEffect(()=>{live.current=key;},[key]);
 useEffect(()=>{
  if(!enabled)return;const controller=new AbortController(),pages=geographicPages(mapId);
  const timer=setTimeout(()=>{void(async()=>{
   setResult({key,value:null,loading:true,error:""});const q=new URLSearchParams(query);if(bounds)q.set("bounds",JSON.stringify(bounds));if(projection)q.set("projection",projection);q.set("themes",GEOGRAPHIC_THEMES.map(t=>t.id).join(","));q.set("lod",reference&&bounds?automaticGeographicDetail(bounds,reference):"overview");
   let after="",lastPaint=0;
   do{if(after)q.set("cursor",after);else q.delete("cursor");const value=await worldApi<GeographicViewport>(`${api}?${q}`,"GET",undefined,controller.signal);if(controller.signal.aborted||live.current!==key)return;pages.append(value,after);setLayer({key:base,value:value.layer});if(!value.nextCursor||performance.now()-lastPaint>250){setResult({key,value:pages.value(),loading:!!value.nextCursor,error:""});lastPaint=performance.now();}after=value.nextCursor??"";}while(after);
  })().catch(e=>{if(controller.signal.aborted||live.current!==key)return;const denied=e instanceof SaveError&&[401,403,404].includes(e.status)||e instanceof GeographicPageError&&e.clear;if(denied)setLayer(null);setResult({key,value:denied?null:pages.value(),loading:false,error:e instanceof SaveError&&e.status===404?"":e.message});});},100);
  return()=>{clearTimeout(timer);controller.abort();};
  // Reference comes from this very request; adding it would cancel its initial pages.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[enabled,api,query,base,key,refresh]);
 useEffect(()=>{
  if(!enabled||current?.loading!==false||!current.value)return;
  const view=current.value,controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
  const check=async()=>{try{
   const q=new URLSearchParams(query);q.set("check","1");q.set("lod",view.lod);q.set("themes",GEOGRAPHIC_THEMES.map(t=>t.id).join(","));
   const status=await worldApi<GeographicViewportStatus>(`${api}?${q}`,"GET",undefined,controller.signal);
   if(controller.signal.aborted||live.current!==key)return;
   if(!sameGeographicViewport(view,status)){setRefresh(n=>n+1);return;}
   timer=setTimeout(()=>void check(),30000);
  }catch{if(!controller.signal.aborted&&live.current===key)setRefresh(n=>n+1);}};
  timer=setTimeout(()=>void check(),30000);return()=>{clearTimeout(timer);controller.abort();};
 },[enabled,api,query,key,current]);
 useEffect(()=>{if(!enabled||!selected)return;const controller=new AbortController();worldApi<GeographicReading>(`${api}?${query}&feature=${selected}`,"GET",undefined,controller.signal).then(value=>{if(!controller.signal.aborted)setReading({key:readKey,value,error:""});}).catch(e=>{if(!controller.signal.aborted)setReading({key:readKey,value:null,error:e.message});});return()=>controller.abort();},[enabled,api,query,selected,readKey]);
 const extent=bounds??(reference?surfaceBounds(reference):null),kind=projection??(reference?.kind==="plane"?"planar":"equirectangular");
 const frame=useMemo(()=>reference&&extent?atlasGeographicFrame(reference,extent,kind):null,[reference,extent,kind]);
 const viewport:GeographicViewport|null=current?.value??(layer&&extent?{layer,bounds:extent,projection:kind,lod:automaticGeographicDetail(extent,layer.surface.reference),canEdit:false,context:"loading",shapes:[],attributions:[],nextCursor:null}:null);
 const rasterProps={worldId,timelineId,mapId:enabled?mapId:"",ordinary,review,viewport};
 const elevation=useElevation(rasterProps),landCover=useLandCover(rasterProps);
 function move(dx=0,dy=0,factor=1){if(reference&&extent)setBounds(moveGeographicExtent(reference,extent,dx,reference.kind==="plane"?-dy:dy,factor));}
 return {context,layer,frame,viewport,loading:enabled&&(!current||current.loading),error:current?.error??"",retry:()=>setRefresh(n=>n+1),themes,setThemes,labels,setLabels,kind,setProjection,move,setExtent:setBounds,restoreView:(value:GeographicBounds|null,kind:ProjectionKind)=>setViewDraft({key:base,bounds:value?projectionExtent(value,kind):null,projection:kind}),fit:()=>setBounds(null),extent,choose:(id:string)=>{setSelected(id);studio?.show("geography");},reading,selected,focus:()=>{if(reference&&reading?.value)setBounds(focusedGeographicExtent(reading.value.bounds,reference));},closeSource:()=>setSelected(""),elevation,landCover,dirty:elevation.dirty||landCover.dirty};
}
export type AtlasGeography=ReturnType<typeof useAtlasGeography>;

export function AtlasGeographicControls({geo,disabled=false}:{geo:AtlasGeography;disabled?:boolean}){
 const [search,setSearch]=useState("");
 if(geo.context?.historical)return <StudioPanel section="geography"><p data-geographic-historical>Modern geographic references and dated land cover are hidden for this historical view. Its authored artwork and selected timeline remain authoritative.</p></StudioPanel>;
 if(!geo.layer)return geo.error?<p role="alert">{geo.error} Editable artwork remains available. <button className="st-button is-secondary" onClick={geo.retry}>Retry geographic layers</button></p>:geo.loading?<p role="status">Checking this map&apos;s geographic layers…</p>:null;
 const choices=[...new Map(geo.viewport?.shapes.map(s=>[s.id,s])).values()].filter(s=>s.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).sort((a,b)=>a.name.localeCompare(b.name));
 return <><StudioPanel section="display"><section aria-label="Geographic map layers" className={styles.geographicControls}>
  <h3>Geographic reference layers</h3><p>{geo.layer.surface.name}. {geo.layer.surface.reference.kind==="sphere"?"Spherical longitude and latitude; this flat display keeps the original coordinates.":"Original planar surface coordinates."} Shared references do not establish conditions in a historical year.</p>
  <fieldset disabled={disabled} className={styles.inspectorFields}>
   <GuidedField label="Map display projection" help="Choose how this surface is drawn. Flat rectangular shows the entire spherical Earth, including the poles. Mercator enlarges high latitudes and omits the poles. Artwork stays anchored to the same source coordinates; its saved points do not change."><select className="st-control" value={geo.kind} onChange={e=>geo.setProjection(e.target.value as ProjectionKind)}>{geo.layer.surface.reference.kind==="sphere"?<><option value="equirectangular">Flat rectangular (equirectangular)</option><option value="mercator">Mercator</option></>:<option value="planar">Planar source coordinates</option>}</select></GuidedField>
   <details><summary>Geographic visibility</summary>{GEOGRAPHIC_THEMES.map(t=><GuidedField key={t.id} label={t.label} help={t.help}><input type="checkbox" checked={geo.themes.includes(t.id)} onChange={e=>geo.setThemes(current=>e.target.checked?[...current,t.id]:current.filter(id=>id!==t.id))}/></GuidedField>)}<GuidedField label="Geographic labels" help="Show a bounded selection of readable source names. Hiding labels keeps their geometry and identities."><input type="checkbox" checked={geo.labels} onChange={e=>geo.setLabels(e.target.checked)}/></GuidedField></details>
   <details><summary>Elevation and bathymetry</summary>{geo.elevation.controls}</details>
   <details><summary>Dated classified land cover</summary>{geo.landCover.controls}</details>
  </fieldset>
  <p data-atlas-geographic-status>{geo.loading?"Loading bounded geographic detail…":`${geo.viewport?.shapes.length??0} source components · ${geo.viewport?.lod??"overview"} detail`}. Source resolution limits accuracy; zoom does not create finer data.</p>
  {geo.error&&<p role="alert">{geo.error} <button className="st-button is-secondary" onClick={geo.retry}>Retry geographic layers</button></p>}
  <details><summary>Source credit and map coordinates</summary><p>Atlas positions remain on their original 2000 × 1200 canvas. Left/right follow the full source x domain; spherical top/bottom follow north/south, while planar maps retain their original x/y orientation. Pan and projection transform only the display. Geographic presentation saves separately from map artwork.</p>{geo.viewport?.attributions.map(c=><p key={JSON.stringify(c)}>{c.label} · {c.url?<a href={c.url} target="_blank" rel="noreferrer">{c.license}</a>:c.license}</p>)}</details>
 </section></StudioPanel><StudioPanel section="geography"><fieldset disabled={disabled} className={styles.inspectorFields}>   <details><summary>Find and read a source</summary><GuidedField label="Find a geographic source" help="Search the sources loaded in the visible area by name. Choose a result to read its retained coordinates and provenance. Focus this source zooms the map to it without changing your artwork."><input className="st-control" value={search} onChange={e=>setSearch(e.target.value)}/></GuidedField><div className={styles.featureList}>{choices.slice(0,12).map(s=><button className="st-button is-secondary" key={s.id} onClick={()=>geo.choose(s.id)}>Read source: {s.name}</button>)}</div><p>{choices.length} matches in this view. Refine the search for other names.</p></details>
<AtlasGeographicReading geo={geo}/></fieldset></StudioPanel></>;
}
export function AtlasGeographicReading({geo}:{geo:AtlasGeography}){
 if(!geo.layer||!geo.selected)return null;const value=geo.reading?.value;
 return <section className={styles.geographicReading} aria-label="Atlas geographic source reader"><button className="st-button is-secondary" onClick={geo.closeSource}>Close source reading</button>{geo.reading?.error?<p role="alert">{geo.reading.error} <button className="st-button is-secondary" onClick={geo.retry}>Read source again</button></p>:value?<><h3>{value.name}</h3><button className="st-button is-secondary" onClick={geo.focus}>Focus this source</button><p>{value.semantic} · retained revision {value.revision}. This shared source does not establish dated historical conditions.</p>{value.source?<p>{geographicProvenanceLabel(value.source)} {!isAuthoredProvenance(value.source)&&<a href={value.source.licenseUrl} target="_blank" rel="noreferrer">{value.source.license}</a>}</p>:<p>Detailed provenance is withheld in ordinary viewing.</p>}<details><summary>Original source coordinates</summary><pre className={styles.sourceCoordinates}>{JSON.stringify(value.geometry)}</pre></details></>:<p role="status">Loading the selected source…</p>}</section>;
}
