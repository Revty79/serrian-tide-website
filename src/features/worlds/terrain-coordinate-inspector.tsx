"use client";
import {useEffect,useLayoutEffect,useRef,useState} from "react";
import {GuidedField as Field} from "@/components/field-guidance";
import {worldApi,SaveError} from "./client-api";
import type {GeographicViewportStatus} from "./geographic";
import type {WorldAtlasContext} from "./world-atlas-context";
import {useWorldResourcePermission} from "./world-permission-context";
import {currentWorldDraftActor} from "./world-editor-credentials";
import {terrainReferenceCoordinate,terrainReferencePosition,terrainReferenceSourceFrame,type ReferenceBoundaryWorld} from "./terrain-reference-boundaries";
import type {TerrainFrame} from "./terrain-refinement";
import type {TerrainInspection} from "./terrain-units";

type Props={context:WorldAtlasContext;mapId:string;world:ReferenceBoundaryWorld;frame:TerrainFrame;inspection:string|TerrainInspection;onLocate:(frame:TerrainFrame)=>void};
/** Read-only coordinate declaration and camera control. No elevation or source writer. */
export function TerrainCoordinateInspector({context,mapId,world,frame,inspection,onLocate}:Props){
 const permission=useWorldResourcePermission(context.worldId),actor=permission?.actorId,
  [open,setOpen]=useState(false),[refresh,setRefresh]=useState(0),[result,setResult]=useState<{key:string;value?:GeographicViewportStatus;error?:string}>(),
  [fields,setFields]=useState<{key:string;longitude:string;latitude:string}>(),[locatingKey,setLocating]=useState<string>(),[locationError,setLocateError]=useState<{key:string;message:string}>();
 const identity=JSON.stringify([context.worldId,mapId,context.timelineId,context.review,context.ordinary,actor]),key=identity+":"+refresh,live=useRef(key),
  longitude=fields?.key===identity?fields.longitude:"",latitude=fields?.key===identity?fields.latitude:"",locating=locatingKey===key,locateError=locationError?.key===key?locationError.message:"";
 useLayoutEffect(()=>{live.current=key;return()=>{live.current="";};},[key]);
 const current=result?.key===key?result:undefined,reference=current?.value?.layer.surface,
  q=new URLSearchParams({map:mapId,timeline:context.timelineId,check:"1",...context.review?{review:"1"}:{},...context.ordinary?{ordinary:"1"}:{}}),url=`/api/worlds/${context.worldId}/terrain/geography?${q}`;
 useEffect(()=>{
  if(!open||!actor)return;
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  const read=async()=>{try{const value=await worldApi<GeographicViewportStatus>(url,"GET",undefined,controller.signal);if(!controller.signal.aborted){if(value.readerId!==actor||value.layer.mapId!==mapId)throw Error("The coordinate context changed. Check its current association.");setResult({key,value});timer=setTimeout(()=>void read(),30000);}}
   catch(error){if(!controller.signal.aborted)setResult({key,error:error instanceof SaveError&&error.status===404?"No readable coordinate surface is associated. Open Geography records and boundaries to review coordinate surfaces.":error instanceof Error?error.message:"Coordinate context is unavailable."});}};
  const visible=()=>{if(document.visibilityState==="visible"){if(timer)clearTimeout(timer);setResult(undefined);void read();}};
  void read();document.addEventListener("visibilitychange",visible);return()=>{controller.abort();if(timer)clearTimeout(timer);document.removeEventListener("visibilitychange",visible);};
 },[open,actor,key,url,mapId]);
 const angular=reference?.reference.kind==="sphere",coordinate=angular&&typeof inspection!=="string"?terrainReferenceCoordinate(world,inspection):null,
  nw=angular?terrainReferenceCoordinate(world,{x:frame.x,y:frame.y}):null,se=angular?terrainReferenceCoordinate(world,{x:frame.x+frame.width,y:frame.y+frame.height}):null;
 async function locate(){
  const point=terrainReferencePosition(world,{longitude:Number(longitude),latitude:Number(latitude)});
  if(!longitude.trim()||!latitude.trim()||!point){setLocateError({key,message:"Enter longitude from -180 to 180 and latitude from -90 to 90."});return;}
  setLocating(key);setLocateError(undefined);
  try{const value=await worldApi<GeographicViewportStatus>(url);
   if(live.current!==key||currentWorldDraftActor()!==actor)return;
   if(value.readerId!==actor||value.layer.mapId!==mapId||value.layer.surface.id!==reference?.id||value.layer.surface.reference.kind!=="sphere")throw Error("The coordinate association changed. Check its current reference before locating.");
   const focus=terrainReferenceSourceFrame([[Number(longitude),Number(latitude),Number(longitude),Number(latitude)]],world);if(focus)onLocate(focus);
  }catch(error){if(live.current===key){setResult(undefined);setLocateError({key,message:error instanceof Error?error.message:"Check current coordinate access before locating."});}}
  finally{if(live.current===key)setLocating(undefined);}
 }
 return <details onToggle={event=>setOpen(event.currentTarget.open)}><summary>Longitude and latitude</summary><section aria-label="Declared map coordinates">
  <p>This reads the current map coordinate declaration. The full World rectangle spans longitude -180 to 180 and latitude 90 to -90, using the same alignment as reference boundaries. Coordinates describe that declaration; terrain placement, ground distances and elevation datum still require geographic review.</p>
  {!current&&!locateError&&<p role="status">Checking coordinate association…</p>}{current?.error&&<p role="status">{current.error}</p>}{locateError&&<p role="alert">{locateError}</p>}
  {reference&&<p>{reference.name} · {reference.reference.crs} · {reference.reference.units}</p>}
  {reference&&!angular&&<p>This is a planar coordinate surface. Longitude and latitude need a spherical angular declaration.</p>}
  {nw&&se&&<output aria-label="Declared active source extent">Active source: northwest {nw.longitude.toFixed(6)}, {nw.latitude.toFixed(6)}; southeast {se.longitude.toFixed(6)}, {se.latitude.toFixed(6)}. Longitude first; wrapping edges may cross -180.</output>}
  {coordinate&&<output aria-label="Declared inspected coordinate">Inspected point: longitude {coordinate.longitude.toFixed(6)}°, latitude {coordinate.latitude.toFixed(6)}°.</output>}
  {angular&&<form onSubmit={event=>{event.preventDefault();void locate();}}><Field label="Longitude (degrees)" help="Position east or west within the declared angular surface, from -180 to 180 degrees." controlClassName="st-control"><input aria-label="Longitude (degrees)" type="number" min={-180} max={180} step="any" required value={longitude} onChange={e=>setFields({key:identity,longitude:e.target.value,latitude})}/></Field><Field label="Latitude (degrees)" help="Position north or south within the declared angular surface, from -90 to 90 degrees." controlClassName="st-control"><input aria-label="Latitude (degrees)" type="number" min={-90} max={90} step="any" required value={latitude} onChange={e=>setFields({key:identity,longitude,latitude:e.target.value})}/></Field><button type="submit" className="st-button is-secondary" disabled={locating}>Locate coordinate</button><p>Locating moves the camera. It does not change terrain, source selection or unfinished work. Distances shown elsewhere remain in the declared map plane.</p></form>}
  <button type="button" className="st-button is-secondary" onClick={()=>{setLocateError(undefined);setRefresh(n=>n+1);}}>Check coordinate association</button>
 </section></details>;
}
