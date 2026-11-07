"use client";
import { useWorldScope,useWorldCanEdit } from "./world-permission-context";
import { accountWorldStorage } from "./world-draft-storage";
import { useCallback, useEffect,useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {useSearchParams} from "next/navigation";
import { worldApi } from "./client-api";
import type { WorldBundle } from "./history";
import { mapStateDetailsSchema } from "./map-states";
import { nativeHistoryUrl,nativeHistoryCommandSchema, nativeMapTargetSchema, nativeTargetKey, type NativeHistoryBundle, type NativeHistoryCommand, type NativeHistoryScope, type NativeMapTarget } from "./native-map-history";
import { NativeHistoryProvider, replaceNativeAtlasUrl, type NativeHistoryLeave } from "./native-map-history-client";
import historyStyles from "./native-map-history.module.css";
import {floorRecoveryKey} from "./building-floor-recovery";
import {emptyNativeHistoryDetails,writeNativeDetails,listRetainedNativeDetails,nativeDetailsPrefix,readNativeDetails,retireNativeDetails,type NativeDetailsCandidate} from "./native-map-history-recovery";
import {NativeConditionPanel} from "./native-map-history-condition-panel";
import {NativeOriginalRequests} from "./native-map-history-requests-panel";
import {NativeMapComparisonPanel} from "./native-map-history-comparison-panel";
import {nativeObjectPresent} from "./native-map-history";
import {atlasId} from "./atlas";
import { yearSchema } from "./world-year";
import {worldAtlasSourceSchema} from "./world-atlas-discovery";
import {WorldAtlasDiscoveryPanel} from "./world-atlas-discovery-client";

type HistoryContext = Pick<WorldBundle, "timelines" | "selectedTimeline" | "eras">;
type LocationContext = { reopenMap?:"requested"|"history";anchorUrl?:string;invalidYear?:boolean;invalidSource?:boolean;connectionSourceVersionId?:string;connectionSourceId?:string;geographyVersionId?:string;target?: NativeMapTarget; year?: number; timelineId: string; stateId?: string; versionId?: string; edit: boolean };
function locationContext(timelineId: string,input?:string): LocationContext {
  const page=new URL(input??location.href,"https://atlas.invalid"),q=page.searchParams;
  const value = q.has("undergroundLevel") ? { kind: "underground", id: q.get("undergroundLevel") }
    : q.has("interiorFloor") ? { kind: "floor", id: q.get("interiorFloor") }
    : q.has("craftDeck") ? { kind: "deck", id: q.get("craftDeck") }
    : q.has("craft") ? { kind: "craft", id: q.get("craft") }
    : q.has("townMap") ? { kind: "town", id: q.get("townMap") } : { kind: "terrain", id: q.get("terrainMap") };
  const target = nativeMapTargetSchema.safeParse(value),rawYear=q.get("atlasYear"),integerYear=rawYear!==null&&/^-?\d+$/.test(rawYear), year = integerYear ? yearSchema.safeParse(Number(rawYear)) : undefined;
  const geography=q.get("atlasGeographyVersion"),validGeography=geography?atlasId.safeParse(geography):undefined;
  const connectionSource=q.get("atlasConnectionSource"),connectionId=q.get("atlasConnection"),validSource=connectionSource?atlasId.safeParse(connectionSource):undefined,validConnection=connectionId?atlasId.safeParse(connectionId):undefined;
  return {geographyVersionId:validGeography?.success?validGeography.data:undefined,connectionSourceId:validConnection?.success?validConnection.data:undefined, connectionSourceVersionId:validSource?.success?validSource.data:undefined,invalidSource:!!geography&&(!validGeography?.success||!year?.success)||!!connectionSource!==!!connectionId||!!connectionSource&&(!validSource?.success||!validConnection?.success),anchorUrl:typeof window==="undefined"?undefined:page.href,invalidYear:rawYear!==null&&(!integerYear||!year?.success),target: target.success ? target.data : undefined, year: year?.success ? year.data : undefined, timelineId: q.get("timeline") ?? q.get("atlasTimeline") ?? timelineId, stateId: q.get("atlasState") ?? undefined, versionId: q.get("atlasVersion") ?? undefined, edit: q.get("atlasEditing") === "1" };
}
const problem = (e: unknown) => e instanceof Error ? e.message : "This dated map could not be loaded. Your work remains retained.";
type NativeEditorOptions={review:boolean;canEdit:boolean;onDirty:(value:boolean)=>void};
function NativeEditorContent({children,options}:{children:(options:NativeEditorOptions)=>ReactNode;options:NativeEditorOptions}){return children(options);}

export function NativeHistoryWorkspace({ worldId, history, viewingContext, review, ordinary, onDirty, children }: {
  worldId: string; viewingContext?:import("./world-atlas-context").WorldAtlasContext; history?: HistoryContext; review: boolean; ordinary: boolean; onDirty: (v: boolean) => void;
  children: (options: { review: boolean; canEdit: boolean; onDirty: (v: boolean) => void }) => ReactNode;
}) {
 const localStorage=accountWorldStorage(),appearanceAllowed=useWorldScope(worldId,"appearances"),historyAllowed=useWorldScope(worldId,"history"),liveCanEdit=useWorldCanEdit(worldId);
  const primary = viewingContext?.timelineId ?? history?.selectedTimeline.id ?? "";
  const search=useSearchParams();
  const [context, setContext] = useState<LocationContext>(() => locationContext(primary,typeof window==="undefined"?`/worlds/${worldId}?${search}`:location.href));
  const [acceptedBundle, setBundle] = useState<NativeHistoryBundle>(), [error, setError] = useState(""), [loading, setLoading] = useState(context.year!==undefined&&!!context.target&&!context.invalidYear&&!context.invalidSource), [epoch, setEpoch] = useState(0),[contentEpoch,setContentEpoch]=useState(0);
  const bundle=useMemo(()=>acceptedBundle?{...acceptedBundle,canEdit:acceptedBundle.canEdit&&liveCanEdit}:undefined,[acceptedBundle,liveCanEdit]);
  const [yearText, setYearText] = useState(context.year?.toString() ?? ""), [timeline, setTimeline] = useState(context.timelineId), [reference, setReference] = useState(false);
  const [draft, setDraft] = useState(()=>emptyNativeHistoryDetails(context.year));
  const [form, setForm] = useState(false), [metadataDirty, setMetadataDirty] = useState(false), [pending, setPending] = useState<NativeHistoryCommand>(), [busy, setBusy] = useState(false);
  const [conditionDirty,setConditionDirty]=useState(false),[retainedReference,setRetainedReference]=useState(false);
  const [blocked, setBlocked] = useState<{ name: string; run: () => void }>(), [editorDirty, setEditorDirty] = useState(false);
  const preparing=useRef(false),approvedNavigation=useRef(false),handleLocation=useRef<((next:LocationContext)=>void)|undefined>(undefined),externalNavigation=useRef<NativeHistoryLeave|undefined>(undefined);
  function runApproved(run:()=>void){const old=approvedNavigation.current;approvedNavigation.current=true;try{run();}finally{approvedNavigation.current=old;}}
  const sourceGeneration=useRef(0);
  const protectedWork=useRef(false),loadedQuery=useRef(""),dirty = useRef(false), leaves = useRef(new Map<symbol, NativeHistoryLeave>());
  const dialog = useRef<HTMLDialogElement>(null),dialogViewport=useRef<{width:number;height:number}|undefined>(undefined),[historyOpen,setHistoryOpen]=useState(false);
  const openHistory=useCallback(()=>{setHistoryOpen(true);setEpoch(v=>v+1);},[]);
  const [related,setRelated]=useState<{objectId?:string}>(),relatedDialog=useRef<HTMLDialogElement>(null);
  const openRelated=useCallback((objectId?:string)=>setRelated({objectId}),[]);
  useEffect(()=>{if(related&&!relatedDialog.current?.open)relatedDialog.current?.showModal();if(!related&&relatedDialog.current?.open)relatedDialog.current.close();},[related]);
  useEffect(()=>{const node=dialog.current;if(!node)return;if(historyOpen&&!node.open){dialogViewport.current={width:innerWidth,height:innerHeight};node.showModal();}else if(!historyOpen&&node.open){node.close();const before=dialogViewport.current;if(before&&(before.width!==innerWidth||before.height!==innerHeight))window.dispatchEvent(new Event("resize"));}},[historyOpen]);
  const registerLeave = useCallback((handler: NativeHistoryLeave) => { const id = Symbol(); leaves.current.set(id, handler); return () => { leaves.current.delete(id); }; }, []);
  const markEditor = useCallback((value: boolean) => { dirty.current=value;setEditorDirty(value); }, []);
  useLayoutEffect(()=>{protectedWork.current=editorDirty||conditionDirty||metadataDirty||!!pending||busy;},[editorDirty,conditionDirty,metadataDirty,pending,busy]);
  useEffect(() => { onDirty(editorDirty || conditionDirty || metadataDirty || !!pending || busy); }, [editorDirty, conditionDirty,metadataDirty, pending, busy, onDirty]);
  const targetKey = context.target ? nativeTargetKey(context.target) : "";
  const [tabId]=useState(()=>floorRecoveryKey(worldId,"historical-details").split(":").at(-1)!);
  const prefix=context.target?nativeDetailsPrefix(worldId,context.timelineId,context.target):"st:native-map-history-details:unselected:";
  const storage=prefix+tabId, recoveryReady=useRef(""), recoveryOrigin=useRef<NativeDetailsCandidate|undefined>(undefined);
  const binding=`${storage}:${context.year??"current"}:${context.stateId??""}:${context.versionId??""}:${context.edit}`,lastWritten=useRef<string|null>(null),activeStorage=useRef(binding);
  useLayoutEffect(()=>{activeStorage.current=binding;return()=>{activeStorage.current="";};},[binding]);
  const [retained,setRetained]=useState<NativeDetailsCandidate[]>([]);
  const [unreadable,setUnreadable]=useState<NativeDetailsCandidate>(),[recoveryNotice,setRecoveryNotice]=useState("");
  const requestChange = (name: string, run: () => void) => {
    if (conditionDirty || metadataDirty || pending || busy) { setBlocked({ name, run });setHistoryOpen(true); return; }
    const leave = [...leaves.current.values()].at(-1);
    if (leave) leave(name, () => { if (dirty.current){setBlocked({ name, run });setHistoryOpen(true);} else runApproved(run); });
    else if (dirty.current){setBlocked({ name, run });setHistoryOpen(true);}
    else runApproved(run);
  };
  useLayoutEffect(()=>{externalNavigation.current=requestChange;});
  useEffect(()=>{
    const listener=(event:Event)=>{const request=event as CustomEvent<{name:string;proceed:()=>void}>;event.preventDefault();externalNavigation.current?.(request.detail.name,request.detail.proceed);};
    window.addEventListener("atlas:request-navigation",listener);
    return()=>window.removeEventListener("atlas:request-navigation",listener);
  },[]);
  useEffect(() => {
    const changed=(event:Event)=>{const next=locationContext(primary);if(event.type==="popstate")next.reopenMap="history";else if((event as CustomEvent).detail?.reopenMap)next.reopenMap="requested";handleLocation.current?.(next);};
    window.addEventListener("atlas:navigate", changed); window.addEventListener("popstate", changed);
    return () => { window.removeEventListener("atlas:navigate", changed); window.removeEventListener("popstate", changed); };
  }, [primary]);
  useLayoutEffect(()=>{handleLocation.current=next=>{
    const before=new URL(context.anchorUrl??location.href),after=new URL(next.anchorUrl??location.href),mapKeys=["terrainMap","townMap","townMapCreate","interiorBuilding","interiorFloor","undergroundLevel","undergroundNew","undergroundLibrary","undergroundSite","craft","craftNew","craftDeck","craftDeckNew","craftLibrary","craftRoute"];
    const reopen=next.reopenMap==="requested"||next.reopenMap==="history"&&before.pathname===after.pathname&&after.searchParams.get("tab")==="atlas"&&mapKeys.some(key=>before.searchParams.get(key)!==after.searchParams.get(key));
    const apply=()=>{if(reopen){setContentEpoch(value=>value+1);setEpoch(value=>value+1);}if(next.anchorUrl)window.history.replaceState(null,"",next.anchorUrl);setContext(next);setLoading(next.year!==undefined&&!!next.target&&!next.invalidYear&&!next.invalidSource);setReference(false);setRetainedReference(false);setConditionDirty(false);setBundle(undefined);setError("");setYearText(next.year?.toString()??"");setTimeline(next.timelineId);};
    if(approvedNavigation.current){apply();return;}
    // Current editors guard their own map/floor changes before updating the
    // URL. Synchronizing an accepted load must not start a second leave flow
    // after the destination editor has already begun receiving input.
    if(!reopen&&context.year===undefined&&next.year===undefined&&!context.invalidYear&&!next.invalidYear&&!context.invalidSource&&!next.invalidSource&&!metadataDirty&&!conditionDirty&&!pending&&!busy){apply();return;}
    if(context.anchorUrl)window.history.replaceState(null,"",context.anchorUrl);
    requestChange("Open Selected Map Context",apply);
  };});
  const query = useMemo(() => {
    if (!appearanceAllowed||!historyAllowed||!context.target || !context.timelineId || ordinary || context.invalidYear || context.invalidSource) return undefined;
    const q = new URLSearchParams({ kind: context.target.kind, id: context.target.id, timeline: context.timelineId });
    if (context.year !== undefined) q.set("year", String(context.year));
    if (context.stateId) q.set("state", context.stateId);
    if (context.versionId) q.set("version", context.versionId);
    if(context.geographyVersionId)q.set("geographyVersion",context.geographyVersionId);
    if (review) q.set("review", "1");
    return `/api/worlds/${worldId}/atlas-history?${q}`;
  }, [context, worldId, review, ordinary,appearanceAllowed,historyAllowed]);
  useEffect(() => {
    if (!query) return;
    const generation=++sourceGeneration.current,controller=new AbortController(),key=`${query}:${context.edit}:${context.connectionSourceVersionId??""}:${context.connectionSourceId??""}`;let alive=true;const foreground=loadedQuery.current!==key;
    if(foreground)queueMicrotask(()=>{if(alive)setLoading(true);});
    void worldApi<NativeHistoryBundle>(query,"GET",undefined,controller.signal).then(value=>{if(alive&&generation===sourceGeneration.current){loadedQuery.current=key;setBundle(previous=>!foreground&&protectedWork.current&&previous?{...value,selected:previous.selected,coverage:previous.coverage,canEdit:previous.canEdit,geographySource:previous.geographySource,conditions:previous.conditions}:value);setError("");}}).catch(e=>{if(alive&&generation===sourceGeneration.current)setError(problem(e));}).finally(()=>{if(alive&&generation===sourceGeneration.current)setLoading(false);});
    return () => { alive = false; controller.abort(); };
  }, [query,epoch,context.edit,context.connectionSourceVersionId,context.connectionSourceId]);
  useEffect(() => {
    if (review || ordinary || !context.target) return;
    recoveryReady.current=""; let live=true;
    queueMicrotask(()=>{
      if(!live)return;
      let candidate:NativeDetailsCandidate|undefined;try{candidate=readNativeDetails(localStorage,prefix,storage,context.timelineId,context.target!);}catch(e){setError(problem(e)+" Local history recovery could not be read. Keep this page open and retry after browser storage is available.");return;}
      lastWritten.current=localStorage.getItem(storage);setRetained(listRetainedNativeDetails(localStorage,prefix,context.timelineId,context.target!));
      setRecoveryNotice(candidate&&candidate.key!==storage?"A historical details draft from another tab was recovered into this tab. The original bytes remain protected against newer work.":"");
      recoveryOrigin.current=candidate;setUnreadable(undefined);setPending(undefined);setMetadataDirty(false);setBusy(false);setForm(false);setDraft(emptyNativeHistoryDetails(context.year));
      if(candidate?.value){if(candidate.value.draft){setDraft(candidate.value.draft);setForm(true);setMetadataDirty(true);}setPending(candidate.value.pending);}
      else if(candidate?.error){setUnreadable(candidate);setError(candidate.error+" Export the original bytes or retain them before choosing new details.");return;}
      recoveryReady.current=storage;
    });
    return()=>{live=false;};
  },[storage,prefix,targetKey,context.timelineId,context.target,context.year,review,ordinary,localStorage]);
  useEffect(() => {
    if (review || ordinary || !targetKey || recoveryReady.current!==storage || unreadable) return;
    try { if (metadataDirty || pending) lastWritten.current=writeNativeDetails(localStorage,storage,lastWritten.current,JSON.stringify({ version:1,draft, pending })); }
    catch { queueMicrotask(() => setError("Browser recovery is unavailable. Export the historical details and keep this page open until saved.")); }
  }, [storage, targetKey, draft, pending, metadataDirty, review, ordinary,unreadable,localStorage]);
  function chooseDate(year: number | undefined, selectedTimeline = timeline, stateId?: string, versionId?: string, edit = false) {
    const url = new URL(context.anchorUrl??location.href);
    url.searchParams.set("timeline",selectedTimeline);
    for (const key of ["atlasYear", "atlasTimeline", "atlasState", "atlasVersion", "atlasEditing", "atlasConnectionSource", "atlasConnection", "atlasGeographyVersion"]) url.searchParams.delete(key);
    if (year !== undefined) { url.searchParams.set("atlasYear", String(year)); url.searchParams.set("atlasTimeline", selectedTimeline); }
    if (stateId) url.searchParams.set("atlasState", stateId);
    if (versionId) url.searchParams.set("atlasVersion", versionId);
    if (edit) url.searchParams.set("atlasEditing", "1");
    setHistoryOpen(false);replaceNativeAtlasUrl(url.pathname + url.search);
  }
  async function submit(command: NativeHistoryCommand) {
    if (busy) return;
    setPending(command); setBusy(true); setError("");setHistoryOpen(true);
    try {
      if(unreadable||recoveryReady.current!==storage)throw Error("Review retained historical details before sending a new request.");
      const submittedBytes=JSON.stringify({version:1,draft,pending:command});
      lastWritten.current=writeNativeDetails(localStorage,storage,lastWritten.current,submittedBytes);
      const submittedOrigin=recoveryOrigin.current;
      await worldApi(`/api/worlds/${worldId}/atlas-history`, "POST", command);
      const origin=submittedOrigin;if(origin&&origin.key!==storage&&localStorage.getItem(origin.key)===origin.raw)localStorage.removeItem(origin.key);
      if(localStorage.getItem(storage)===submittedBytes)localStorage.removeItem(storage);
      if(activeStorage.current!==binding)return;
      recoveryOrigin.current=undefined;
      const newer=localStorage.getItem(storage);if(newer!==null){setPending(undefined);setUnreadable({key:storage,raw:newer,value:undefined,error:"Newer local details remain retained after the accepted save."});recoveryReady.current="";setError("The submitted historical request was accepted. Another tab's newer local details remain retained; review or export them before continuing.");return;}
      lastWritten.current=null;setPending(undefined);setMetadataDirty(false);setForm(false);setEpoch(v=>v+1);
      if(command.action==="create"||command.action==="split"){
        const run=()=>runApproved(()=>chooseDate(command.action==="create"?command.details.startYear:command.year,command.timelineId,undefined,undefined,true)),name="Open Saved Historical Appearance";
        const leave=[...leaves.current.values()].at(-1);
        if(leave)leave(name,()=>{if(dirty.current){setBlocked({name,run});setHistoryOpen(true);}else run();});
        else if(dirty.current){setBlocked({name,run});setHistoryOpen(true);}else run();
      }
    } catch (e) { if(activeStorage.current===binding)setError(problem(e) + " Retry Original Historical Request retains its exact destination and content."); }
    finally { if(activeStorage.current===binding)setBusy(false); }
  }
  async function create() {
    if (busy||preparing.current||!bundle||!query||!context.target)return;
    preparing.current=true;setBusy(true);
    try {
      const details = mapStateDetailsSchema.parse({ name: draft.name, startYear: Number(draft.startYear), endYear: Number(draft.endYear), account: draft.account, protected: draft.protected });
      if (!draft.startYear.trim() || !draft.endYear.trim()) throw Error("Enter both canonical years; year zero is valid.");
      const sourceQuery = new URL(query, location.origin);
      sourceQuery.searchParams.set("year", String(details.startYear)); sourceQuery.searchParams.delete("state"); sourceQuery.searchParams.delete("version");sourceQuery.searchParams.delete("geographyVersion");
      if (!draft.editing&&draft.source === "baseline") sourceQuery.searchParams.set("prepareBaseline", "1");
      const prepared = await worldApi<NativeHistoryBundle>(sourceQuery.pathname + sourceQuery.search);
      if (context.target.kind === "terrain" && context.target.id !== prepared.anchorMapId && !prepared.geographySource) throw Error("Create or explicitly retain the parent World appearance at this first canonical year before copying this Region. The draft is kept.");
      if(activeStorage.current!==binding)return;
      const command = nativeHistoryCommandSchema.parse(draft.editing?{action:"details",requestId:crypto.randomUUID(),timelineId:context.timelineId,target:context.target,stateId:draft.editing.stateId,revision:draft.editing.revision,geographyVersionId:prepared.geographySource?.versionId??null,details}:{ action: "create", requestId: crypto.randomUUID(), timelineId: context.timelineId, target: context.target, sourceVersionId: draft.source === "baseline" ? null : draft.source, baselinePin: prepared.baselinePin ?? null, geographyVersionId: prepared.geographySource?.versionId ?? null, details });
      await submit(command);
    }catch(e){if(activeStorage.current===binding)setError(problem(e));}
    finally{preparing.current=false;if(activeStorage.current===binding)setBusy(false);}
  }
  function exportDetails() { const a = document.createElement("a"), url = URL.createObjectURL(new Blob([unreadable?.raw??JSON.stringify({ version:1,draft, pending })], { type: "application/json" })); a.href = url; a.download = "historical-map-details-draft.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function retainOriginal(){
    try{const raw=localStorage.getItem(storage),candidate=raw?{key:storage,raw}:unreadable??recoveryOrigin.current;if(!candidate)throw Error("The original packet could not be found. Export its visible details before leaving.");
      retireNativeDetails(localStorage,storage,candidate,prefix+"retained:"+crypto.randomUUID());
      recoveryOrigin.current=undefined;setUnreadable(undefined);setPending(undefined);setDraft(emptyNativeHistoryDetails(context.year));setMetadataDirty(false);setForm(true);lastWritten.current=localStorage.getItem(storage);setRetained(listRetainedNativeDetails(localStorage,prefix,context.timelineId,context.target!));recoveryReady.current=storage;setError("");
    }catch(e){setError(problem(e));}
  }
  useEffect(()=>{
    const readSource=(event:Event)=>{const detail=(event as CustomEvent<{worldId:string;reads:Promise<void>[]}>) .detail;if(detail?.worldId!==worldId||!context.target)return;
      const generation=++sourceGeneration.current;detail.reads.push((async()=>{
        const target=context.target!,current=new URL(location.href),q=current.searchParams;
        const endpoint=target.kind==="terrain"?`terrain?terrainMap=${target.id}`:target.kind==="town"?`town-maps?map=${target.id}`:target.kind==="floor"?`building-floors?floor=${target.id}${q.get("townMap")?"&townMap="+q.get("townMap"):""}${q.get("interiorBuilding")?"&building="+q.get("interiorBuilding"):""}`:target.kind==="underground"?`underground?level=${target.id}`:`crafts?craft=${target.kind==="craft"?target.id:q.get("craft")??""}&surface=${target.kind==="deck"?target.id:"exterior"}`;
        let url=`/api/worlds/${worldId}/${endpoint}`;
        if(context.year!==undefined){
          if(!query||context.invalidYear||context.invalidSource)return;
          const fresh=await worldApi<NativeHistoryBundle>(query);
          // Read current accepted heads without replacing a retained packet's
          // original source or its editable drawing. Stale saves still fail.
          if(generation===sourceGeneration.current)setBundle(previous=>protectedWork.current&&previous?{...fresh,selected:previous.selected,coverage:previous.coverage,geographySource:previous.geographySource,conditions:previous.conditions}:fresh);
          if(!fresh.selected||fresh.coverage!=="established"&&!context.versionId)return;
          url=nativeHistoryUrl(url,{timelineId:context.timelineId,year:context.year,target,stateId:fresh.selected.id,edit:false,versionId:context.versionId,geographyStateId:target.kind==="terrain"?fresh.geographySource?.stateId:undefined,geographyVersionId:context.geographyVersionId,connectionSourceId:context.connectionSourceId,connectionSourceVersionId:context.connectionSourceVersionId});
        }
        await worldApi(url);
      })().finally(()=>{if(generation===sourceGeneration.current)setLoading(false);}));
    };window.addEventListener("atlas:read-editor-source",readSource);return()=>window.removeEventListener("atlas:read-editor-source",readSource);
  },[worldId,context,query]);
  const dated = context.year !== undefined||!!context.invalidYear||!!context.invalidSource, selected = bundle?.selected;
  const acceptedState=bundle?.states.find(state=>state.id===selected?.id);
  const selectedStateId=selected?.id,geographyStateId=context.target?.kind==="terrain"?bundle?.geographySource?.stateId:undefined,geographyVersionId=context.target?.kind==="terrain"?context.geographyVersionId??(context.edit&&!review?undefined:bundle?.geographySource?.versionId):undefined;
  const sourceCoverage=bundle?.coverage,canEditAppearance=!!bundle?.canEdit;
  const scope = useMemo<NativeHistoryScope | undefined>(() => dated && context.year!==undefined && context.target && selectedStateId && (sourceCoverage === "established" || context.versionId) ? {
    timelineId: context.timelineId, year: context.year!, target: context.target, stateId: selectedStateId, versionId: context.versionId, edit: context.edit && canEditAppearance && !review && !context.connectionSourceVersionId&&!context.geographyVersionId,
    connectionSourceVersionId:context.connectionSourceVersionId,connectionSourceId:context.connectionSourceId,geographyStateId,geographyVersionId,
  } : undefined, [dated,context,selectedStateId,sourceCoverage,canEditAppearance,geographyStateId,geographyVersionId,review]);
  const eras = history?.eras.filter(e => !e.archived && e.startYear !== null && e.endYear !== null) ?? [];
  const mapPresent=!context.target||nativeObjectPresent(bundle?.conditions??[],context.target.id);
  const sourceChoices=[...new Map([...(bundle?.states??[]),...(bundle?.revisions??[]),...selected?[selected]:[]].map(v=>[v.versionId,v])).values()];
  const content = (!dated || reference || scope)&& (mapPresent||retainedReference||reference);
  let relatedSource:import("./world-atlas-discovery").WorldAtlasSource|undefined;
  try{const parsed=worldAtlasSourceSchema.safeParse(JSON.parse(new URL(context.anchorUrl??location.href).searchParams.get("worldSource")??"null"));if(parsed.success)relatedSource=parsed.data;}catch{/* Invalid source hints never select a record. */}
  return <section aria-label="Historical Atlas">
    <dialog ref={relatedDialog} data-native-history className={historyStyles.dialog} aria-label="Related Worlds Records" onCancel={event=>{event.preventDefault();setRelated(undefined);}}><button type="button" className="st-button is-secondary" onClick={()=>setRelated(undefined)}>Close related records</button>{related&&context.target&&<WorldAtlasDiscoveryPanel key={`${targetKey}:${context.year}:${context.timelineId}:${scope?.versionId??scope?.stateId}:${related.objectId??""}`} context={{worldId,timelineId:context.timelineId,year:reference?undefined:context.year,review,ordinary}} subject={{kind:"map",target:context.target,scope:reference?undefined:scope,objectId:related.objectId,source:relatedSource}}/>}</dialog>
    {!ordinary&&history&&<div className={historyStyles.summary}><strong>{retainedReference?"Retained design reference":reference?"Current map reference":dated?`Year ${context.year??"invalid"} | ${bundle?.timelineName??"Selected timeline"} | ${scope?.edit?"editing appearance":selected?.mode==="retained"?"retained branch":context.versionId?"retained revision":"viewing appearance"}`:"Current map"}</strong><button data-native-history-action className="st-button" onClick={openHistory}>History / Era</button></div>}
    {error&&!historyOpen&&<p role="alert">{error}<button className="st-button" onClick={openHistory}>Review History</button></p>}
    <dialog data-native-history ref={dialog} className={historyStyles.dialog} aria-labelledby="native-map-history-title" onCancel={event=>{event.preventDefault();setHistoryOpen(false);}}><header className={historyStyles.dialogHeader}><h2 id="native-map-history-title">History / Era</h2><button className="st-button" onClick={()=>setHistoryOpen(false)}>Close History</button></header>
    {!ordinary && history && <div className={historyStyles.controls}>
      <strong>{dated ? `Year ${context.year} · ${bundle?.timelineName ?? "Historical Atlas"}${context.versionId ? " · retained revision" : context.edit ? " · editing appearance" : " · viewing appearance"}` : "Current map"}</strong>
      <label>Timeline<select className="st-control" aria-label="Atlas timeline" value={timeline} onChange={e => setTimeline(e.target.value)}>{history.timelines.map(t => <option key={t.id} value={t.id}>{t.name}{t.archived ? " · archived" : ""}</option>)}</select></label>
      <label>Canonical World year<input className="st-control" aria-label="Atlas year" inputMode="numeric" value={yearText} onChange={e => setYearText(e.target.value)}/></label>
      <button className="st-button" disabled={!context.target || loading} onClick={() => { try { if (!/^-?\d+$/.test(yearText)) throw Error("Enter an integer canonical World year."); const year = yearSchema.parse(Number(yearText)); requestChange(`Open Year ${year}`, () => chooseDate(year)); } catch (e) { setError(problem(e)); } }}>Open Year</button>
      {!!eras.length && <label>Era<select className="st-control" aria-label="Atlas era" defaultValue="" onChange={e => { const era = eras.find(v => v.id === e.target.value); if (era && era.startYear !== null) { setYearText(String(era.startYear)); requestChange(`Open ${era.name}`, () => chooseDate(era.startYear!)); } }}><option value="">Choose an established era</option>{eras.map(e => <option key={e.id} value={e.id}>{e.name} · {e.startYear}–{e.endYear}</option>)}</select></label>}
      {dated && <button className="st-button" onClick={() => requestChange("Return to Current Map", () => chooseDate(undefined))}>Return to Current Map</button>}
      {scope&&<button className="st-button" onClick={()=>requestChange("Reload Saved Appearance",()=>{setContentEpoch(v=>v+1);setEpoch(v=>v+1);setHistoryOpen(false);})}>Reload Saved Appearance</button>}
      {bundle?.canEdit && !review && <button className="st-button" disabled={loading || busy || !!pending || conditionDirty} onClick={() => { setForm(true);setMetadataDirty(true); setDraft(d => ({ ...d,editing:undefined, startYear: context.year?.toString() ?? d.startYear, endYear: context.year?.toString() ?? d.endYear, source: context.versionId?selected?.versionId??"baseline":acceptedState?.versionId??selected?.versionId??sourceChoices[0]?.versionId??"baseline" })); }}>Create / Copy Appearance</button>}
      {acceptedState&&!acceptedState.archived&&bundle?.canEdit&&!context.versionId&&<button className="st-button" disabled={busy||!!pending||metadataDirty||conditionDirty} onClick={()=>{setMetadataDirty(true);setDraft({name:acceptedState.name,startYear:String(acceptedState.startYear),endYear:String(acceptedState.endYear),account:acceptedState.account,protected:acceptedState.protected,source:acceptedState.versionId,editing:{stateId:acceptedState.id,revision:acceptedState.revision}});setForm(true);}}>Edit Appearance Details</button>}
      {scope&&acceptedState&&bundle?.canEdit&&!context.versionId&&context.year!>acceptedState.startYear&&context.year!<=acceptedState.endYear&&<button className="st-button" disabled={busy||editorDirty||conditionDirty||!!pending||metadataDirty} onClick={()=>void(async()=>{try{const prepared=await worldApi<NativeHistoryBundle>(query!);if(activeStorage.current!==binding)return;await submit({action:"split",requestId:crypto.randomUUID(),timelineId:context.timelineId,target:context.target!,stateId:acceptedState.id,revision:acceptedState.revision,year:context.year!,name:`${acceptedState.name} from ${context.year}`.slice(0,160),geographyVersionId:prepared.geographySource?.versionId??null});}catch(e){setError(problem(e));}})()}>Start Independent Appearance at Year {context.year}</button>}
      {scope && bundle?.canEdit && !context.versionId && <button className="st-button" onClick={() => requestChange(context.edit ? "View This Appearance" : "Edit This Appearance", () => chooseDate(context.year, context.timelineId, selected?.id, undefined, !context.edit))}>{context.edit ? "View This Appearance" : "Edit This Appearance"}</button>}
      {!!bundle?.states.length && <label>Saved appearances<select className="st-control" aria-label="Saved historical appearances" value={selected?.id ?? ""} onChange={e => { const state = bundle.states.find(s => s.id === e.target.value); if (state) requestChange(`Open ${state.name}`, () => chooseDate(state.startYear, context.timelineId, state.id, state.archived ? state.versionId : undefined)); }}><option value="">Choose an appearance</option>{bundle.states.map(s => <option key={s.id} value={s.id}>{s.name} · {s.startYear}–{s.endYear}{s.archived ? " · archived" : ""}</option>)}</select></label>}
      {selected && <label>Appearance revision<select className="st-control" aria-label="Historical appearance revision" value={context.versionId ?? ""} onChange={e => requestChange("Open retained appearance revision", () => chooseDate(context.year, context.timelineId, selected.id, e.target.value || undefined))}><option value="">Current accepted appearance</option>{bundle?.revisions.map(s => <option key={s.versionId} value={s.versionId}>{s.name} · {s.versionId.slice(0, 8)}</option>)}</select></label>}
      {acceptedState && bundle?.canEdit && (!context.versionId||acceptedState.archived) && <button className="st-button" disabled={editorDirty || conditionDirty || metadataDirty || busy || !!pending} onClick={() => void submit({ action: acceptedState.archived ? "restore" : "archive", requestId: crypto.randomUUID(), timelineId: context.timelineId, target: context.target!, stateId: acceptedState.id, revision: acceptedState.revision })}>{acceptedState.archived ? "Restore Appearance" : "Archive Appearance"}</button>}
    </div>}
    {scope&&<NativeConditionPanel key={`${scope.stateId}:${scope.edit}:${scope.geographyStateId??""}`} worldId={worldId} scope={scope} blocked={editorDirty||form||!!pending||busy} onDirty={setConditionDirty} onAccepted={()=>setEpoch(v=>v+1)}/>}
    {recoveryNotice&&<p role="status">{recoveryNotice}</p>}
    {context.invalidSource&&<p role="alert">This URL has an invalid retained source. Choose Open Year to clear it and review the selected dated map.</p>}
    {scope?.connectionSourceVersionId&&<p>Retained connection source: {scope.connectionSourceVersionId}. Map geometry and connection accounting retain separate exact sources.</p>}
    {context.invalidYear&&<p role="alert">The URL has an invalid canonical World year. Enter an integer year above, including zero or a negative year, and choose Open Year. Current content has not been presented as a dated map.</p>}
    {error && <p role="alert">{error} <button className="st-button" onClick={() => setEpoch(v => v + 1)}>Retry History Loading</button></p>}
    {form && bundle?.canEdit && <fieldset className={historyStyles.form} disabled={busy || !!pending || !!unreadable}><legend>{draft.editing?"Edit Historical Appearance Details":"Create Historical Appearance"}</legend><p>Copy one exact saved source, then edit this appearance independently. Existing maps and earlier dates retain their accepted content.</p><label>Name<input className="st-control" aria-label="Historical appearance name" value={draft.name} onChange={e => { setMetadataDirty(true); setDraft({ ...draft, name: e.target.value }); }}/></label><label>First canonical year<input className="st-control" aria-label="Appearance first year" value={draft.startYear} onChange={e => { setMetadataDirty(true); setDraft({ ...draft, startYear: e.target.value }); }}/></label><label>Last canonical year<input className="st-control" aria-label="Appearance last year" value={draft.endYear} onChange={e => { setMetadataDirty(true); setDraft({ ...draft, endYear: e.target.value }); }}/></label>{!draft.editing&&<label>Exact source<select className="st-control" aria-label="Historical appearance source" value={draft.source} onChange={e => { setMetadataDirty(true); setDraft({ ...draft, source: e.target.value }); }}><option value="baseline" disabled={bundle.baselineAvailable===false}>{bundle.baselineAvailable===false?"No current map; choose a retained appearance":"Explicit copy of current map"}</option>{sourceChoices.map(s => <option key={s.versionId} value={s.versionId}>{s.name} · {s.startYear}–{s.endYear} · {s.versionId.slice(0, 8)}</option>)}</select></label>}<label>Historical account<textarea className="st-control" aria-label="Historical appearance account" value={draft.account} onChange={e => { setMetadataDirty(true); setDraft({ ...draft, account: e.target.value }); }}/></label><label><input type="checkbox" checked={draft.protected} onChange={e=>{setMetadataDirty(true);setDraft({...draft,protected:e.target.checked});}}/>Protect this appearance as a retained source</label><button className="st-button is-primary" disabled={editorDirty||conditionDirty} onClick={() => void create()}>{draft.editing?"Save Appearance Details":"Create Historical Appearance"}</button><button className="st-button" onClick={exportDetails}>Export Historical Details</button><button className="st-button" onClick={() => { if (!metadataDirty || confirm("Discard only these unsaved historical details? Saved map appearances remain intact.")) { if(localStorage.getItem(storage)!==lastWritten.current){setError("Another tab changed these details. Newer bytes remain retained.");return;}localStorage.removeItem(storage);lastWritten.current=null;setForm(false);setMetadataDirty(false); } }}>Cancel Historical Details</button></fieldset>}
    {unreadable&&<p role="alert">The original historical details need review. <button className="st-button" onClick={exportDetails}>Export Original Historical Details</button><button className="st-button" onClick={retainOriginal}>Retain Original / Start New Details</button></p>}
    {pending && <p role="status">The exact historical request is retained. <button className="st-button" disabled={busy} onClick={() => void submit(pending)}>Retry Original Historical Request</button><button className="st-button" onClick={exportDetails}>Export Historical Request</button><button className="st-button" disabled={busy} onClick={retainOriginal}>Retain Original / Start New Details</button></p>}
    {!!retained.length&&<details><summary>Retained historical requests ({retained.length})</summary>{retained.map(candidate=><p key={candidate.key}>{candidate.value?.pending?.action??candidate.value?.draft?.name??"Unreadable original"}<button className="st-button" onClick={()=>{const a=document.createElement("a"),url=URL.createObjectURL(new Blob([candidate.raw],{type:"application/json"}));a.href=url;a.download="retained-historical-request.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>Export Retained Request</button><button className="st-button" disabled={busy||!!pending||metadataDirty||!candidate.value} onClick={()=>{try{if(localStorage.getItem(candidate.key)!==candidate.raw)throw Error("This retained request changed. Reload recovery before using it.");lastWritten.current=writeNativeDetails(localStorage,storage,lastWritten.current,candidate.raw);recoveryOrigin.current=candidate;setDraft(candidate.value!.draft??emptyNativeHistoryDetails(context.year));setPending(candidate.value!.pending);setMetadataDirty(!!candidate.value!.draft);setForm(!!candidate.value!.draft);}catch(e){setError(problem(e));}}}>Review Retained Request</button></p>)}</details>}
    {selected&&<p role="status">This appearance covers canonical years {selected.startYear} through {selected.endYear}, inclusive. Saving map content changes this whole period. Start an independent appearance at a later selected year to preserve earlier years before editing.</p>}
    {blocked && <aside aria-label="Historical navigation pending work"><p>Resolve the current map and historical details before {blocked.name}. Your selected destination is retained.</p><button className="st-button" onClick={() => setBlocked(undefined)}>Stay Here</button><button className="st-button" disabled={editorDirty || conditionDirty || metadataDirty || !!pending || busy} onClick={() => { const run = blocked.run; setBlocked(undefined); requestChange(blocked.name, run); }}>Continue to {blocked.name}</button></aside>}
    {!ordinary&&bundle&&history&&<NativeMapComparisonPanel key={targetKey+context.timelineId} worldId={worldId} bundle={bundle} timelines={history.timelines} review={review}/>}
    {!ordinary&&!review&&<NativeOriginalRequests worldId={worldId} scope={scope} disabled={editorDirty||conditionDirty||metadataDirty||busy||!!pending} onAccepted={()=>{setEpoch(v=>v+1);setContentEpoch(v=>v+1);}}/>}
    </dialog>
    {dated&&(!appearanceAllowed||!historyAllowed)?<section style={{minHeight:400}}><h3>Historical appearances are outside this grant</h3><p>This viewing year has not been replaced by current-day geography. Ask the owner to include History and historical appearances, or deliberately open the current reference.</p><button className="st-button" onClick={()=>chooseDate(undefined,context.timelineId)}>Open current reference</button></section>:loading && dated ? <div style={{ minHeight: 720 }} role="status">Loading the exact dated map source…</div> : !content ? <div style={{ minHeight: 720 }}><h3>{mapPresent?"Historical appearance unknown":"This map is not present in this appearance"}</h3><p>{mapPresent?`No active appearance establishes this map at Year ${context.year} in the selected timeline.`:"This appearance records absence, destruction or uncertainty; its geometry remains retained."} Connected maps resolve their own coverage at this same date.</p>{!mapPresent&&scope&&<><p>The saved whole-map condition is {bundle?.conditions?.find(v=>v.id===context.target?.id)?.condition}. Its design remains retained.</p><button className="st-button" onClick={()=>setRetainedReference(true)}>View Retained Design as Read-only Reference</button></>}{mapPresent&&!reference && bundle?.baselineAvailable!==false && <button className="st-button" onClick={() => setReference(true)}>View Current Map as Read-only Reference</button>}{bundle?.parentStates.map(s => <p key={s.id}>{s.name} · parent timeline · {s.startYear}–{s.endYear} {bundle.canEdit && <button className="st-button" disabled={busy || editorDirty || !!pending} onClick={() => void submit({ action: "retain", requestId: crypto.randomUUID(), timelineId: context.timelineId, target: context.target!, stateId: s.id, sourceVersionId: s.versionId, sourceRevision: s.revision })}>Explicitly Retain Parent Appearance</button>}</p>)}</div> : <NativeHistoryProvider canEdit={liveCanEdit&&(!dated||!!scope?.edit&&!reference&&!retainedReference)} openRelated={openRelated} guardNavigation={requestChange} conditions={bundle?.conditions} scope={reference ? undefined : retainedReference&&scope?{...scope,edit:false}:scope} registerLeave={registerLeave} openHistory={openHistory} reference={reference} requestedYear={context.year} timelineName={bundle?.timelineName??history?.timelines.find(t=>t.id===context.timelineId)?.name} branchMode={selected?.mode} referenceLabel={retainedReference?"Retained design reference; the map is not present at the selected date.":scope&&bundle?.coverage!=="established"?`Retained source ${selected?.startYear} to ${selected?.endYear}; Year ${context.year} coverage unknown | ${bundle?.timelineName}`:reference?`Current map reference; Year ${context.year} coverage unknown | ${bundle?.timelineName}`:undefined}><div key={dated?`${targetKey}:${scope?.stateId ?? "baseline"}:${scope?.versionId ?? "head"}:${scope?.edit ?? false}:${reference}:${contentEpoch}`:`current:${contentEpoch}`}>
      {retainedReference&&<p role="status">Retained design reference. The map condition does not establish its presence at this year.</p>}
      {reference && <p role="status">Current map reference. Historical coverage remains unknown; this view is read-only.</p>}
      <NativeEditorContent options={{review,canEdit:liveCanEdit&&(!dated||!!scope?.edit&&!reference&&!retainedReference),onDirty:markEditor}}>{children}</NativeEditorContent>
    </div></NativeHistoryProvider>}
  </section>;
}
