"use client";
import { EvolutionDestinationDialog } from "../evolution-destination-dialog";
import type { CreatedEvolutionDestination } from "@/features/evolutions/evolution-destination";
import { RaceEvolutionTransitionEditor } from "./race-evolution-transition-editor";
import { useEffect, useRef, useState } from "react";
import { GuidedField } from "@/components/field-guidance";
import { evolutionDestinationLabel, type RaceEvolutionPath, type EvolutionDestination, type EvolutionPathInput } from "@/features/races/race-evolutions";
import { getRaceEvolutions, reorderEvolutionPaths, removeEvolutionPath, saveEvolutionPath, searchEvolutionDestinations } from "./evolution-actions";
import styles from "../creatures/creature-evolutions.module.css";
import { EvolutionEligibilityDialog, EvolutionRequirementsDialog } from "../evolution-requirements-editor";

export function RaceEvolutionsEditor({ sourceRaceId, dirty, archived, onDestinationCreated }: { sourceRaceId?: number; dirty: boolean; archived: boolean; onDestinationCreated: (result: CreatedEvolutionDestination) => Promise<void> }) {
  const [creating, setCreating] = useState(false);
  const [paths, setPaths] = useState<RaceEvolutionPath[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<{ path: RaceEvolutionPath | null } | null>(null);
  const [removing, setRemoving] = useState<RaceEvolutionPath | null>(null);
  const [requirements, setRequirements] = useState<RaceEvolutionPath | null>(null);
  const [preview, setPreview] = useState<RaceEvolutionPath | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!sourceRaceId) return;
    let current = true;
    void getRaceEvolutions(sourceRaceId).then(result => {
      if (current) { setPaths(result.paths); setCanEdit(result.canEdit); setError(""); }
    }).catch(reason => { if (current) setError(reason instanceof Error ? reason.message : "Could not load Evolutions."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [sourceRaceId, reload]);

  const disabled = busy || loading || dirty || archived || !canEdit;
  async function move(index: number, offset: number) {
    if (!sourceRaceId) return;
    const next = [...paths];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    setBusy(true); setError(""); setMessage("");
    try {
      setPaths(await reorderEvolutionPaths({ sourceRaceId, paths: next.map(({ id, version }) => ({ id, version })) }));
      setMessage("Evolution order saved.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not reorder Evolutions."); }
    finally { setBusy(false); }
  }
  function saved(next: RaceEvolutionPath[], message: string) {
    setPaths(next); setEditing(null); setRemoving(null); setRequirements(null); setError(""); setMessage(message);
  }

  return <section className={styles.area} aria-label="Evolution paths">
    <h3>Evolutions</h3>
    <p>Define possible progressions from this Race to another saved Race. Forms are alternate states within a definition; Evolutions connect different definitions.</p>
    <p>Create Evolution Destination makes a new full Race from this source and opens its editor. Link Existing Destination is the advanced option for a Race that already exists.</p>
    <p>Paths and requirements save separately. Eligibility previews check saved individual facts without changing them. Checking eligibility does not perform an Evolution.</p>
    {!sourceRaceId ? <p>Save this Race before adding Evolution paths.</p> : <>
      {dirty ? <p>Save your Race changes before editing Evolutions.</p> : null}
      {archived ? <p>Restore this Race to edit its Evolution paths.</p> : !loading && !canEdit ? <p>You can view these paths. Editing follows the source Race&apos;s authoring permissions.</p> : null}
      <div className={styles.actions}>
        <button className="st-button is-primary" type="button" disabled={disabled} onClick={() => setCreating(true)}>Create Evolution Destination</button>
        <button className="st-button" type="button" disabled={disabled} onClick={() => setEditing({ path: null })}>Link Existing Destination</button>
        <button className="st-button" type="button" disabled={busy || loading} onClick={() => { setLoading(true); setReload(value => value + 1); }}>Reload Evolutions</button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      {loading ? <p role="status">Loading Evolutions…</p> : !paths.length ? <p>No Evolution paths authored for this exact Race.</p> : <ol className={styles.paths}>
        {paths.map((path, index) => <li key={path.id} className={styles.card}>
          <h4>{path.name}</h4>
          <p>{evolutionDestinationLabel(path.destination)}</p>
          <small>Evolution path #{path.id}</small>
          <p>{path.requirementMode === "unrestricted" ? "Unrestricted" : "Has requirements"}</p>
          {path.destination.archived ? <p>This destination is archived. You may retain this reference, edit the path, choose an active destination, or remove the path.</p> : null}
          {path.description ? <p className={styles.prose}>{path.description}</p> : null}
          {path.notes ? <p className={styles.prose}>Notes: {path.notes}</p> : null}
          <div className={styles.actions}>
            <button className="st-button" type="button" disabled={disabled} onClick={() => setEditing({ path })} aria-label={`Edit ${path.name}`}>Edit</button>
            <button className="st-button" type="button" disabled={busy || loading || dirty} onClick={() => setRequirements(path)} aria-label={`Requirements for ${path.name}`}>Requirements</button>
            <button className="st-button" type="button" disabled={busy || loading || dirty} onClick={() => setPreview(path)} aria-label={`Preview eligibility for ${path.name}`}>Preview eligibility</button>
            <button className="st-button" type="button" disabled={disabled || index === 0} onClick={() => void move(index, -1)} aria-label={`Move ${path.name} up`}>Move up</button>
            <button className="st-button" type="button" disabled={disabled || index === paths.length - 1} onClick={() => void move(index, 1)} aria-label={`Move ${path.name} down`}>Move down</button>
            <button className="st-button is-danger" type="button" disabled={disabled} onClick={() => setRemoving(path)} aria-label={`Remove ${path.name}`}>Remove</button>
          </div>
        </li>)}
      </ol>}
      {creating ? <EvolutionDestinationDialog kind="race" sourceId={sourceRaceId} onClose={() => setCreating(false)} onCreated={onDestinationCreated} /> : null}
      {editing ? <EvolutionDialog sourceRaceId={sourceRaceId} path={editing.path} onClose={() => setEditing(null)} onSaved={next => saved(next, "Evolution path saved.")} /> : null}
      {removing ? <RemoveDialog path={removing} onClose={() => setRemoving(null)} onSaved={next => saved(next, "Evolution path removed.")} /> : null}
      {requirements ? <EvolutionRequirementsDialog kind="race" path={requirements} onClose={() => setRequirements(null)} onSaved={next => saved(next,"Evolution requirements saved.")} /> : null}
      {preview ? <EvolutionEligibilityDialog kind="race" path={preview} onClose={() => setPreview(null)} /> : null}
    </>}
  </section>;
}

function EvolutionDialog({ sourceRaceId, path, onClose, onSaved }: {
  sourceRaceId: number; path: RaceEvolutionPath | null; onClose: () => void; onSaved: (paths: RaceEvolutionPath[]) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [input, setInput] = useState<EvolutionPathInput>({
    sourceRaceId, id: path?.id, expectedVersion: path?.version, destinationRaceId: path?.destinationRaceId ?? 0,
    transition: path?.transition ?? null,
    name: path?.name ?? "", description: path?.description ?? "", notes: path?.notes ?? "",
  });
  const [selected, setSelected] = useState(path?.destination ?? null);
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<EvolutionDestination[]>([]);
  const [searchError, setSearchError] = useState("");
  const [searching, setSearching] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      void searchEvolutionDestinations(sourceRaceId, search).then(rows => {
        if (current) { setCandidates(rows); setSearchError(""); }
      }).catch(reason => { if (current) { setCandidates([]); setSearchError(reason instanceof Error ? reason.message : "Could not find Races."); } })
        .finally(() => { if (current) setSearching(false); });
    }, 200);
    return () => { current = false; clearTimeout(timer); };
  }, [sourceRaceId, search]);
  const choices = [selected, path?.destination, ...candidates].filter((row, index, all): row is EvolutionDestination => !!row && all.findIndex(other => other?.id === row.id) === index);
  async function save() {
    setBusy(true); setError("");
    try { onSaved(await saveEvolutionPath(input)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save Evolution."); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="evolution-dialog-title" onCancel={event => { if (busy) event.preventDefault(); else onClose(); }}>
    <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <h3 id="evolution-dialog-title">{path ? "Edit Evolution" : "Link Existing Destination"}</h3>
      <p>Use this when the evolved Race already exists. Most new Evolutions should use Create Evolution Destination instead.</p>
      <p>The current Race is excluded because an Evolution must lead to a different saved Race definition.</p>
      <fieldset disabled={busy} className={styles.fields}>
        <GuidedField className="st-field" label="Evolution name" help="Name this path, for example Awaken as an Ascended Human. The destination remains a separate saved Race.">
          <input className="st-control" required value={input.name} onChange={event => setInput({ ...input, name: event.target.value })} />
        </GuidedField>
        <GuidedField className="st-field" label="Find destination Race" help="Search by name. Results follow your Race catalog visibility and include active definitions and exact variants. Refine the search when there are more than 30 matches.">
          <input className="st-control" type="search" value={search} onChange={event => { setSearch(event.target.value); setSearching(true); setCandidates([]); }} />
        </GuidedField>
        {searchError ? <p role="alert">{searchError}</p> : null}
        {searching ? <p role="status">Finding Races…</p> : <small>Showing up to 30 active matches, plus your selected destination.</small>}
        <GuidedField className="st-field" label="Destination Race" help="Select the exact saved Race this path leads to. An existing archived or hidden reference remains available to retain; new destinations must be active and visible in your catalog.">
          <select className="st-control" required value={input.destinationRaceId || ""} onChange={event => {
            const target = choices.find(row => row.id === Number(event.target.value)) ?? null;
            setSelected(target); setInput({ ...input, destinationRaceId: target?.id ?? 0 });
          }}>
            <option value="">Choose a destination</option>
            {choices.map(target => <option key={target.id} value={target.id}>{evolutionDestinationLabel(target)}</option>)}
          </select>
        </GuidedField>
        {selected ? <p className={styles.prose}>{evolutionDestinationLabel(selected)}</p> : null}
        <GuidedField className="st-field" label="Description" help="Optional explanation of what this Evolution represents. Text does not create requirements or change mechanics.">
          <textarea className="st-control" rows={3} value={input.description} onChange={event => setInput({ ...input, description: event.target.value })} />
        </GuidedField>
        <GuidedField className="st-field" label="Notes" help="Optional authoring notes for this path. Author requirements separately using the Requirements control. Notes do not change eligibility.">
          <textarea className="st-control" rows={3} value={input.notes} onChange={event => setInput({ ...input, notes: event.target.value })} />
        </GuidedField>
        <RaceEvolutionTransitionEditor value={input.transition} onChange={transition => setInput({ ...input, transition })} />
      </fieldset>
      {error ? <p role="alert">{error}</p> : null}
      <div className={styles.actions}>
        <button className="st-button is-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save Evolution"}</button>
        <button className="st-button" type="button" disabled={busy} onClick={onClose}>Cancel</button>
      </div>
    </form>
  </dialog>;
}

function RemoveDialog({ path, onClose, onSaved }: { path: RaceEvolutionPath; onClose: () => void; onSaved: (paths: RaceEvolutionPath[]) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function remove() {
    setBusy(true); setError("");
    try { onSaved(await removeEvolutionPath({ sourceRaceId: path.sourceRaceId, id: path.id, expectedVersion: path.version })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not remove Evolution."); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="remove-evolution-title" onCancel={event => { if (busy) event.preventDefault(); else onClose(); }}>
    <h3 id="remove-evolution-title">Remove {path.name}?</h3>
    <p>This removes the authored path. Both Race definitions and all individual Races remain unchanged.</p>
    {error ? <p role="alert">{error}</p> : null}
    <div className={styles.actions}>
      <button className="st-button is-danger" type="button" disabled={busy} onClick={() => void remove()}>{busy ? "Removing…" : "Remove Evolution"}</button>
      <button className="st-button" type="button" disabled={busy} onClick={onClose}>Cancel</button>
    </div>
  </dialog>;
}
