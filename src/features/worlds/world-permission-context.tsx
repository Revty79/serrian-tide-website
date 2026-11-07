"use client";
import { createContext, useContext, useEffect } from "react";
import { hasWorldScope, type WorldPermission, type WorldScope } from "./world-permissions";
export const WorldPermissionContext=createContext<{worldId:string;permission:WorldPermission}|null>(null);
export function useWorldResourcePermission(worldId:string){const context=useContext(WorldPermissionContext);return context?.worldId===worldId?context.permission:undefined;}
export function useWorldScope(worldId:string,scope:WorldScope){const permission=useWorldResourcePermission(worldId);return permission?hasWorldScope(permission,scope):true;}
export function useWorldCanEdit(worldId:string){return useWorldResourcePermission(worldId)?.canEdit??true;}

/** Refresh authority before the lease is marked ready, retaining all local source
 * revisions and drawings. A failed fresh read keeps editing blocked. */
export function useRefreshWorldResourceAuthority<T>(worldId:string,read:()=>Promise<T>,accept:(fresh:T)=>void){
 useEffect(()=>{let active=true;const refresh=(event:Event)=>{const detail=(event as CustomEvent<{worldId:string;reads:Promise<void>[]}>).detail;if(detail?.worldId!==worldId)return;detail.reads.push(read().then(fresh=>{if(active)accept(fresh);}));};window.addEventListener("atlas:read-editor-source",refresh);return()=>{active=false;window.removeEventListener("atlas:read-editor-source",refresh);};},[worldId,read,accept]);
}
