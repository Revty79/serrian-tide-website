"use client";
import {useEffect,useMemo,useState} from "react";
import type {TerrainGeometry} from "./terrain";
import {TerrainDetailCache} from "./terrain-refinement-cache";
import {detailViewPlan} from "./terrain-refinement-client";
import {frameGeometry,type RefinementMeta,type TerrainViewport} from "./terrain-refinement";
import type {TerrainDetailScene} from "./terrain-detail-renderer";
export type TerrainPreviewWorld={shape:TerrainGeometry;grid:Int16Array};

/** Existing operation previews keep the original World frame and shared renderer. */
export function useTerrainPreviewScene(meta:RefinementMeta|undefined,world:TerrainPreviewWorld|undefined,grid:Int16Array,preview?:{meta:RefinementMeta;grid:Int16Array}){
 const [view,setView]=useState<TerrainViewport>();
 const cache=useMemo(()=>new TerrainDetailCache(async()=>{throw Error("An operation preview uses its prepared numerical samples.");}),[]);
 useEffect(()=>()=>cache.dispose(),[cache]);
 const scene=useMemo<TerrainDetailScene|undefined>(()=>meta&&world?{cache,plans:view?detailViewPlan(preview?[meta,preview.meta]:[meta],view,world.shape):[],tick:0,active:{meta,grid,shape:frameGeometry(meta,world.shape)},...preview?{preview:{...preview,shape:frameGeometry(preview.meta,world.shape)}}:{}}:undefined,[meta,world,grid,view,cache,preview]);
 return {scene,onViewport:setView,frame:meta&&world?meta.frame:undefined,worldShape:meta?world?.shape:undefined,worldGrid:meta?world?.grid:undefined};
}
