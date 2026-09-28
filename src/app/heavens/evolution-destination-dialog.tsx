"use client";
import { useEffect, useRef, useState } from "react";
import { GuidedField } from "@/components/field-guidance";
import { createCreatureCanonicalIdentity } from "@/features/creatures/creature-canonical-ids";
import type { EvolutionOwner } from "@/features/evolutions/evolution-requirements";
import type { CreateEvolutionDestinationInput, CreatedEvolutionDestination } from "@/features/evolutions/evolution-destination";
import { createDestination, prepareDestination } from "./evolution-destination-actions";
import styles from "./creatures/creature-evolutions.module.css";

export function EvolutionDestinationDialog({kind,sourceId,onClose,onCreated}:{kind:EvolutionOwner;sourceId:number;onClose:()=>void;onCreated:(result:CreatedEvolutionDestination)=>Promise<void>}) {
  const dialog=useRef<HTMLDialogElement>(null), submitting=useRef(false);
  const requestKey=useRef<string | null>(null), storageKey=`evolution-destination:${kind}:${sourceId}`;
  const [input,setInput]=useState<CreateEvolutionDestinationInput|null>(null);
  const [pending,setPending]=useState<CreateEvolutionDestinationInput|null>(null);
  const [created,setCreated]=useState<CreatedEvolutionDestination|null>(null);
  const [busy,setBusy]=useState(false), [error,setError]=useState("");
  const [customPath,setCustomPath]=useState(false);
  const label=kind === "race" ? "Race" : "Creature";
  useEffect(()=> {
    dialog.current?.showModal();
    let current=true;
    async function initialize() {
      const stored=sessionStorage.getItem(storageKey);
      if(stored) {
        const previous=JSON.parse(stored) as CreateEvolutionDestinationInput;
        if(previous.kind===kind && previous.sourceId===sourceId) return {input:previous,resuming:true};
      }
      requestKey.current ??= createCreatureCanonicalIdentity();
      const prepared=await prepareDestination(kind,sourceId,requestKey.current);
      return {input:{...prepared,destinationName:"",pathName:"",description:"",notes:""},resuming:false};
    }
    void initialize().then(result=>{if(current){setInput(result.input);if(result.resuming)setPending(result.input);}})
      .catch(reason=>{if(current)setError(reason instanceof Error ? reason.message : "Could not preserve a retry-safe creation request.");});
    return ()=>{current=false;};
  },[kind,sourceId,storageKey]);

  async function submit() {
    if(!input || submitting.current) return;
    submitting.current=true;setBusy(true);setError("");
    try {
      if(created) { await onCreated(created);sessionStorage.removeItem(storageKey);return; }
      const request=pending ?? input;
      // Persist the exact request before sending. Reloads/uncertain responses resume it.
      sessionStorage.setItem(storageKey,JSON.stringify(request));setPending(request);
      const response=await createDestination(request);
      if(!response.ok) {
        if(!response.retrySameRequest) {sessionStorage.removeItem(storageKey);setPending(null);}
        setError(response.error);return;
      }
      setCreated(response.result);
      // Keep the receipt request until the normal full editor has opened successfully.
      await onCreated(response.result);
      sessionStorage.removeItem(storageKey);
    } catch(reason) { setError(`${reason instanceof Error ? reason.message : "The response could not be confirmed."} Retry to resume the same creation safely.`); }
    finally {submitting.current=false;setBusy(false);}
  }
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="create-evolution-title" onCancel={event=>{if(busy)event.preventDefault();else onClose();}}>
    <form onSubmit={event=>{event.preventDefault();void submit();}}>
      <h3 id="create-evolution-title">Create Evolution Destination</h3>
      <p>Create a complete independent {label} from {input?.sourceName ?? "this source"}, link its Evolution path, then open the new {label}&apos;s full editor.</p>
      <p>Normal mechanics, Forms and their rules are copied. Outgoing Evolutions are not copied. The new definition is user-created content, with no Variant parent.</p>
      {pending && !created ? <p role="status">A creation request is awaiting confirmation. Retry uses the same request and cannot create a second destination.</p> : null}
      {created ? <p role="status">{created.destinationName} was created and linked as path #{created.pathId}. Open its editor to continue.</p> : null}
      {!input && !error ? <p role="status">Reading the saved source…</p> : null}
      {input ? <fieldset className={styles.fields} disabled={busy || !!pending || !!created}>
        <GuidedField className="st-field" label={`Destination ${label} name`} help="Name the new complete definition. Its mechanics start as a copy of the saved source; edit the destination next to describe what changes.">
          <input className="st-control" required maxLength={200} value={input.destinationName} onChange={event=>setInput({...input,destinationName:event.target.value,...(!customPath ? {pathName:event.target.value.trim() ? `Evolve into ${event.target.value.trim()}`.slice(0,200) : ""} : {})})}/>
        </GuidedField>
        {kind === "creature" ? <GuidedField className="st-field" label="Destination canonical ID" help="Creature IDs are generated by the system. This new permanent ID is assigned to this creation request and cannot be edited.">
          <input className="st-control" readOnly value={input.canonicalId ?? ""}/>
        </GuidedField> : null}
        <GuidedField className="st-field" label="Evolution path name" help="Names the source-to-destination path. You can later edit its requirements, order, notes and permanent Race adjustments on the source's Evolutions tab.">
          <input className="st-control" required maxLength={200} value={input.pathName} onChange={event=>{setCustomPath(true);setInput({...input,pathName:event.target.value});}}/>
        </GuidedField>
        <GuidedField className="st-field" label="Path description" help="Optional explanation of this Evolution. It does not change requirements or mechanics."><textarea className="st-control" rows={3} maxLength={10000} value={input.description} onChange={event=>setInput({...input,description:event.target.value})}/></GuidedField>
        <GuidedField className="st-field" label="Path notes" help="Optional authoring notes. Add eligibility requirements and Race permanent adjustments on the resulting path afterward."><textarea className="st-control" rows={3} maxLength={10000} value={input.notes} onChange={event=>setInput({...input,notes:event.target.value})}/></GuidedField>
      </fieldset> : null}
      {error ? <p role="alert">{error}</p> : null}
      <div className={styles.actions}>
        <button className="st-button is-primary" type="submit" disabled={!input || busy}>{busy ? "Creating…" : created ? "Open destination editor" : pending ? "Retry creation" : "Create and open destination"}</button>
        <button className="st-button" type="button" disabled={busy} onClick={onClose}>Close</button>
      </div>
    </form>
  </dialog>;
}
