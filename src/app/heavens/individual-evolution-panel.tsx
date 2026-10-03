"use client";
import { useEffect, useState } from "react";
import { individualEvolutionStorageKey, type PendingIndividualEvolution } from "@/features/evolutions/evolution-execution";
import { getIndividualEvolutionState } from "./evolution-execution-actions";
import { EvolutionExecutionDialog, EvolutionHistory, EvolutionEncounterSummary } from "./evolution-execution-dialog";
import styles from "./creatures/creature-evolutions.module.css";

type State = Awaited<ReturnType<typeof getIndividualEvolutionState>>;
type Review = { pathId: number; pathName: string; returning: boolean; resume?: PendingIndividualEvolution };
export function IndividualEvolutionPanel({ characterId, disabled, onChanged }: { characterId: number; disabled: boolean; onChanged: () => Promise<void> }) {
  const [state, setState] = useState<State | null>(null), [error, setError] = useState("");
  const [review, setReview] = useState<Review | null>(null), [pending, setPending] = useState<PendingIndividualEvolution | null>(null);
  async function load() {
    try {
      const data = await getIndividualEvolutionState(characterId);
      setState(data); setError("");
      const stored = sessionStorage.getItem(individualEvolutionStorageKey(characterId));
      const request = stored ? JSON.parse(stored) as PendingIndividualEvolution : null;
      setPending(request?.input.characterId === characterId ? request : null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Evolution state could not be loaded."); }
  }
  useEffect(() => {
    let current = true;
    void getIndividualEvolutionState(characterId).then(data => {
      if (!current) return;
      setState(data);
      const stored = sessionStorage.getItem(individualEvolutionStorageKey(characterId));
      const request = stored ? JSON.parse(stored) as PendingIndividualEvolution : null;
      setPending(request?.input.characterId === characterId ? request : null);
    }).catch(reason => { if (current) setError(reason instanceof Error ? reason.message : "Evolution state could not be loaded."); });
    return () => { current = false; };
  }, [characterId]);
  return <section className={styles.area} aria-label="Individual Evolution">
    <h3>Evolution</h3>
    <p>Review a permanent Evolution or return one recorded step. The same individual keeps its identity, possessions, damage and history.</p>
    {disabled ? <p>Save your sheet changes before reviewing Evolution or Return.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {!state && !error ? <p role="status">Loading current Evolution state…</p> : null}
    {state ? <>
      <p><strong>Current {state.kind === "race" ? "Race" : "Creature"}: {state.currentName ?? "Unassigned"}{state.currentId ? ` (#${state.currentId})` : ""}</strong>{state.currentArchived ? " — archived definition" : ""}</p>
      <p>{state.individualName} — persistent individual #{characterId}</p>
      <EvolutionEncounterSummary contexts={state.encounterContexts} />
      {state.blockers.map(blocker => <p key={blocker} role="note">{blocker}</p>)}
      {pending ? <div className={styles.card}><p>A previous transition still needs confirmation. Resume that exact request before starting another.</p><button className="st-button" type="button" disabled={disabled} onClick={() => setReview({ pathId: pending.preview.pathId, pathName: pending.preview.pathName, returning: pending.operation === "return", resume: pending })}>Resume pending transition</button></div> : null}
      <h4>Available Evolutions</h4>
      {state.paths.length ? <ul className={styles.paths}>{state.paths.map(path => <li className={styles.card} key={path.pathId}>
        <strong>{path.pathName}</strong><span>{path.destinationName} (#{path.destinationId})</span>
        <span>{path.requirementMode === "unrestricted" ? "Unrestricted — review current state" : "Requirements — checked during review"}{!path.available ? " · Archived definition" : ""}</span>
        <button className="st-button" type="button" disabled={disabled || !!pending || !path.available} onClick={() => setReview({ pathId: path.pathId, pathName: path.pathName, returning: false })}>Review Evolution — {path.destinationName}</button>
      </li>)}</ul> : <p>No outgoing Evolution paths are authored for this exact definition.</p>}
      <h4>Prior state</h4>
      {state.returnCandidate ? state.returnBlockers.map(blocker => <p key={blocker}>{blocker}</p>) : null}
      {state.returnCandidate ? <div className={styles.card}><p>{state.returnCandidate.priorName} (#{state.returnCandidate.priorId}) — Evolution Event #{state.returnCandidate.eventId}</p>
        <button className="st-button" type="button" disabled={disabled || !!pending} onClick={() => setReview({ pathId: 0, pathName: state.returnCandidate!.priorName, returning: true })}>Review Return to {state.returnCandidate.priorName}</button>
      </div> : <p>{state.returnStatus}</p>}
      <details><summary>Evolution history ({state.history.length})</summary>{state.history.length ? <EvolutionHistory entries={state.history} /> : <p>No Evolution events recorded.</p>}</details>
      {review ? <EvolutionExecutionDialog kind={state.kind} individualId={characterId} sourceId={state.currentId ?? 0} pathId={review.pathId} pathName={review.pathName} returning={review.returning} resume={review.resume}
        onExecuted={async () => { await onChanged(); await load(); }} onClose={() => { setReview(null); void load(); }} /> : null}
    </> : null}
    <button className="st-button" type="button" disabled={disabled || !!review} onClick={() => void load()}>Refresh Evolution state</button>
  </section>;
}
