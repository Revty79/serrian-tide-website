"use client";
import {navigateNativeMap} from "./native-map-navigation";
import { createContext, useCallback, useContext, useEffect,useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import {WorldPermissionContext} from "./world-permission-context";
import { worldApi as request } from "./client-api";
import { nativeHistoryRecoveryScope, nativeHistoryUrl, type NativeCondition, type NativeHistoryScope } from "./native-map-history";
import {nativeOriginalRequestUuid} from "./native-map-history-transport-client";

export type NativeHistoryLeave = (name: string, proceed: () => void) => void;
export function requestNativeWorkspaceNavigation(name: string, proceed: () => void) {
  const event = new CustomEvent("atlas:request-navigation", { cancelable: true, detail: { name, proceed } });
  if (window.dispatchEvent(event)) proceed();
}
type NativeClient = { canEdit?:boolean; openRelated?:(objectId?:string)=>void;guardNavigation?:NativeHistoryLeave;conditions?:NativeCondition[];scope?: NativeHistoryScope; registerLeave?: (handler: NativeHistoryLeave) => () => void; openHistory?: () => void; reference?: boolean; timelineName?:string;branchMode?:string;referenceLabel?:string;requestedYear?:number };
const NativeHistoryContext = createContext<NativeClient>({});
export function NativeHistoryProvider({ canEdit,openRelated,guardNavigation,conditions,scope, registerLeave, openHistory, reference, timelineName,branchMode,referenceLabel,requestedYear,children }: NativeClient & { children: ReactNode }) {
  const value = useMemo(() => ({ canEdit,openRelated,guardNavigation,conditions,scope, registerLeave, openHistory, reference,timelineName,branchMode,referenceLabel,requestedYear }), [canEdit,openRelated,guardNavigation,conditions,scope, registerLeave, openHistory, reference,timelineName,branchMode,referenceLabel,requestedYear]);
  return <NativeHistoryContext.Provider value={value}>{children}</NativeHistoryContext.Provider>;
}
export function useNativeNavigationGuard(){
  const {guardNavigation}=useContext(NativeHistoryContext),current=useRef(guardNavigation),live=useRef(true);
  useLayoutEffect(()=>{current.current=guardNavigation;live.current=true;return()=>{live.current=false;};},[guardNavigation]);
  return useCallback((name:string,run:()=>void)=>{if(!live.current)return;const guard=current.current;if(guard)guard(name,run);else run();},[]);
}
export function useNativeConditions(){return useContext(NativeHistoryContext).conditions??[];}
export function useNativeCanEdit(){const context=useContext(NativeHistoryContext);return context.canEdit??(!context.reference&&(!context.scope||context.scope.edit));}
export function useNativeHistory() { return useContext(NativeHistoryContext).scope; }
export function useNativeExportContext() { const {scope,reference,requestedYear}=useContext(NativeHistoryContext);return {scope,reference,requestedYear}; }
export function useNativeRequestUuid(){const scope=useNativeHistory();return useCallback(()=>nativeOriginalRequestUuid(scope),[scope]);}
export function useNativeHistoryRecovery() { return nativeHistoryRecoveryScope(useNativeHistory()); }
export function NativeHistoryBadge() {
  const {scope,reference,timelineName,branchMode,referenceLabel,requestedYear}=useContext(NativeHistoryContext);
  if(!scope&&!reference)return null;
  const mode=reference?"Current reference, unknown":referenceLabel?"Retained reference, unknown":scope!.edit?"Editing":branchMode==="retained"?"Retained branch":"Read-only";
  const label=`Year ${scope?.year??requestedYear??"unknown"} | ${mode} | ${timelineName??"Selected timeline"}`;
  return <span data-testid="atlas-date-context" title={referenceLabel??label} style={{position:"absolute",zIndex:20,bottom:54,right:12,maxWidth:"calc(100% - 24px)",padding:"3px 6px",border:"1px solid var(--st-border)",borderRadius:4,background:"var(--st-surface)",color:"var(--st-text-strong)",fontSize:12,fontWeight:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"normal",overflowWrap:"anywhere",lineHeight:1.15,pointerEvents:"none"}}>{label}</span>;
}
export function NativeRelatedRecordsButton({objectId}:{objectId?:string}){const {openRelated}=useContext(NativeHistoryContext);return openRelated?<button type="button" data-native-history-action className="st-button is-secondary" onClick={()=>openRelated(objectId)}>Related Worlds Records</button>:null;}
export function NativeHistoryButton(){const {openHistory}=useContext(NativeHistoryContext),world=useContext(WorldPermissionContext);return <>{openHistory&&<><button type="button" data-native-history-action className="st-button" onClick={openHistory}>History / Era</button><NativeRelatedRecordsButton/></>}{world&&world.permission.role!=="administrator-review"&&<button type="button" data-native-history-action className="st-button is-secondary" onClick={()=>window.dispatchEvent(new CustomEvent("atlas:collaboration",{detail:{worldId:world.worldId}}))}>Editing control</button>}</>;}

export function useNativeHistoryLeave(handler: NativeHistoryLeave, enabled = true) {
  const { registerLeave } = useContext(NativeHistoryContext), current = useRef(handler);
  useEffect(() => { current.current = handler; });
  useEffect(() => enabled ? registerLeave?.((name, proceed) => current.current(name, proceed)) : undefined, [registerLeave, enabled]);
}
export function useNativeApiUrl() {
  const scope = useNativeHistory();
  return useCallback((url: string) => scope ? nativeHistoryUrl(url, scope) : url, [scope]);
}
/** Every asynchronous command closes over the mounted editor's explicit scope.
 * A later URL or date selection cannot retarget an old save or retry. */
export function useNativeWorldApi() {
  const scope = useNativeHistory();
  return useMemo(() => {const call=async <T,>(url: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> => {
    const parsed = new URL(url, "https://atlas.invalid");
    const content = /^\/api\/worlds\/[^/]+\/(?:terrain(?:\/|$)|towns$|town-maps$|building-floors$|underground$|crafts$|assets$)/.test(parsed.pathname);
    // Explicit creator-library operations have independent authority and never
    // invoke a map-content writer. Composition always uses the dated context.
    const library = /\/assets$/.test(parsed.pathname) && (method === "GET" ? !parsed.searchParams.has("kind") : !!body && typeof body === "object" && "action" in body && body.action !== "compose");
    const sharedTownProfile=/\/towns$/.test(parsed.pathname)&&method!=="GET"&&!!body&&typeof body==="object"&&"action" in body&&body.action==="save";
    return request<T>(scope && content && !library && !sharedTownProfile ? nativeHistoryUrl(url, scope) : url, method, body, signal);
  };return Object.assign(call,{newRequestId:()=>nativeOriginalRequestUuid(scope)});}, [scope]);
}
export function nativeRecoveryKey(value: string) {
  if (!value.includes("historicalAtlas=")) return value;
  const [path, query] = value.split("?"), q = new URLSearchParams(query), raw = q.get("historicalAtlas");
  if (!raw) return value;
  const scope = JSON.parse(raw) as NativeHistoryScope;
  q.delete("historicalAtlas");
  return path + (q.size ? "?" + q : "") + nativeHistoryRecoveryScope(scope);
}
export function replaceNativeAtlasUrl(url: string) {
  const current = new URL(location.href), next = new URL(url, current);
  const target = (q: URLSearchParams) => ["undergroundLevel", "interiorFloor", "craftDeck", "craft", "townMap", "terrainMap"].find(key => q.has(key));
  const a = target(current.searchParams), b = target(next.searchParams);
  const targetChanged = a !== b || !!a && current.searchParams.get(a) !== next.searchParams.get(a);
  if (targetChanged) {
    next.searchParams.delete("atlasState"); next.searchParams.delete("atlasVersion");next.searchParams.delete("atlasConnectionSource");next.searchParams.delete("atlasConnection");next.searchParams.delete("atlasGeographyVersion");
    next.searchParams.delete("worldSource");next.searchParams.delete("worldPlace");next.searchParams.delete("worldShopBranch");
  }
  if (next.href === current.href) return;
  window.history.replaceState(null, "", next.pathname + next.search);
  if (targetChanged || ["atlasYear", "atlasTimeline", "atlasState", "atlasVersion", "atlasEditing", "atlasConnectionSource", "atlasConnection", "atlasGeographyVersion"].some(key => current.searchParams.get(key) !== next.searchParams.get(key))) window.dispatchEvent(new Event("atlas:navigate"));
}
export function nativeBrowseUrl(input: string, scope?: Pick<NativeHistoryScope, "year" | "timelineId">) {
  if (!scope) return input;
  const url = new URL(input, location.href);
  if (url.origin !== location.origin || !/^\/worlds\/[^/]+/.test(url.pathname)) return input;
  url.searchParams.set("atlasYear", String(scope.year)); url.searchParams.set("atlasTimeline", scope.timelineId); url.searchParams.set("timeline", scope.timelineId);
  url.searchParams.delete("atlasState"); url.searchParams.delete("atlasVersion");url.searchParams.delete("atlasConnectionSource");url.searchParams.delete("atlasConnection");url.searchParams.delete("atlasGeographyVersion");
  return url.pathname + url.search;
}
export function useNativeNavigate() {
  const scope=useNativeHistory(),guard=useNativeNavigationGuard();
  return useCallback((url:string)=>guard("Open Selected Map",()=>navigateNativeMap(nativeBrowseUrl(url,scope))),[scope,guard]);
}
