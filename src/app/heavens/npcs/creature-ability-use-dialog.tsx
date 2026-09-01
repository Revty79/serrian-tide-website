"use client";

import { useState } from "react";

import type { CreatureAbilityDefinition } from "@/features/creatures/creature-ability";
import type {
  CreatureAbilityEffectSelection,
  CreatureAbilityUseRequest,
  CreatureAbilityUseResult,
} from "@/features/creatures/creature-ability-runtime";
import type { CreatureAbilityUsePreparation } from "@/features/creatures/creature-ability-runtime-service";

import {
  executeCreatureAbilityUseAction,
  prepareCreatureAbilityUse,
} from "./creature-ability-actions";
import "./creature-ability-use-dialog.css";

type Props = {
  sourceCharacterId: number;
  ability: CreatureAbilityDefinition;
  disabled?: boolean;
  onComplete: () => void | Promise<void>;
};

function displayNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function CreatureAbilityUseDialog({ sourceCharacterId, ability, disabled = false, onComplete }: Props) {
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState<CreatureAbilityUseRequest | null>(null);
  const [preparation, setPreparation] = useState<CreatureAbilityUsePreparation | null>(null);
  const [result, setResult] = useState<CreatureAbilityUseResult | null>(null);
  const [targetChoice, setTargetChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function preview(next: CreatureAbilityUseRequest) {
    setBusy(true);
    setError(null);
    setResult(null);
    setRequest(next);
    try {
      setPreparation(await prepareCreatureAbilityUse({ ...next, previewFingerprint: null }));
    } catch (caught) {
      setPreparation(null);
      setError(caught instanceof Error ? caught.message : "This Creature Ability could not be prepared.");
    } finally {
      setBusy(false);
    }
  }

  function begin() {
    const initial: CreatureAbilityUseRequest = {
      sourceCharacterId,
      abilityCanonicalId: ability.canonicalId,
      targetCharacterIds: [],
      effectSelections: {},
      previewFingerprint: null,
    };
    setOpen(true);
    void preview(initial);
  }

  function changeTargets(targetCharacterIds: number[]) {
    if (!request) return;
    void preview({ ...request, targetCharacterIds, effectSelections: {}, previewFingerprint: null });
  }

  function addTarget() {
    if (!request || !targetChoice) return;
    const targetId = Number(targetChoice);
    if (request.targetCharacterIds.includes(targetId)) return;
    setTargetChoice("");
    changeTargets([...request.targetCharacterIds, targetId]);
  }

  function moveTarget(index: number, direction: -1 | 1) {
    if (!request) return;
    const target = index + direction;
    if (target < 0 || target >= request.targetCharacterIds.length) return;
    const next = [...request.targetCharacterIds];
    [next[index], next[target]] = [next[target], next[index]];
    changeTargets(next);
  }

  function selectEffect(applicationKey: string, value: string) {
    if (!request) return;
    let selection: CreatureAbilityEffectSelection = {};
    if (value.startsWith("location:")) {
      selection = { hitLocationNumber: Number(value.slice("location:".length)), poolKey: null };
    } else if (value.startsWith("pool:")) {
      selection = { poolKey: value.slice("pool:".length), hitLocationNumber: null };
    }
    void preview({
      ...request,
      previewFingerprint: null,
      effectSelections: { ...request.effectSelections, [applicationKey]: selection },
    });
  }

  async function confirm() {
    if (!request || !preparation?.plan.ready) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await executeCreatureAbilityUseAction({
        ...request,
        previewFingerprint: preparation.plan.fingerprint,
      }));
      setPreparation(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This Creature Ability could not be resolved.");
      try {
        setPreparation(await prepareCreatureAbilityUse({ ...request, previewFingerprint: null }));
      } catch {
        setPreparation(null);
      }
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    const completed = result !== null;
    setOpen(false);
    setRequest(null);
    setPreparation(null);
    setResult(null);
    setError(null);
    setTargetChoice("");
    if (completed) await onComplete();
  }

  return <>
    <button type="button" className="creature-ability-use-trigger" disabled={disabled} onClick={begin}>Use Ability</button>
    {open ? <div className="creature-ability-use-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) void close(); }}>
      <section className="creature-ability-use-dialog" role="dialog" aria-modal="true" aria-labelledby={`creature-ability-${sourceCharacterId}-${ability.canonicalId}`}>
        <header><div><p>CREATURE NPC ABILITY</p><h2 id={`creature-ability-${sourceCharacterId}-${ability.canonicalId}`}>{ability.abilityName}</h2></div><button type="button" aria-label="Close Ability use" disabled={busy} onClick={() => void close()}>×</button></header>
        {busy && !preparation && !result ? <p>Preparing authoritative current-snapshot preview…</p> : null}
        {error ? <p className="creature-ability-use-feedback is-error" role="alert">{error}</p> : null}
        {preparation ? <div className="creature-ability-use-content">
          <section className="creature-ability-use-description"><h3>{preparation.plan.sourceCreature.name}</h3><dl><div><dt>Type</dt><dd>{preparation.plan.ability.abilityType || "Not specified"}</dd></div><div><dt>Activation</dt><dd>{preparation.plan.ability.activation || "Not specified"}</dd></div><div><dt>Requirements</dt><dd>{preparation.plan.ability.requirements || "None recorded"}</dd></div><div><dt>Recharge / Uses</dt><dd>{preparation.plan.ability.usesRecharge || "None recorded"} · descriptive only</dd></div></dl>{preparation.plan.ability.description ? <p>{preparation.plan.ability.description}</p> : null}{preparation.plan.ability.mechanicalEffect ? <p><strong>Mechanical Notes:</strong> {preparation.plan.ability.mechanicalEffect}</p> : null}</section>
          <section className="creature-ability-use-targets"><h3>Explicit affected targets</h3><div><select value={targetChoice} disabled={busy} onChange={(event) => setTargetChoice(event.target.value)}><option value="">Choose Campaign entity…</option>{preparation.targetOptions.filter(({ characterId }) => !request?.targetCharacterIds.includes(characterId)).map((target) => <option key={target.characterId} value={target.characterId}>{target.name}{target.characterId === sourceCharacterId ? " · Source Creature" : target.isNpc ? ` · ${target.npcKind === "creature" ? "Creature NPC" : "Race NPC"}` : " · PC"}</option>)}</select><button type="button" disabled={!targetChoice || busy} onClick={addTarget}>Add Target</button></div><ol>{request?.targetCharacterIds.map((targetId, index) => { const target = preparation.targetOptions.find(({ characterId }) => characterId === targetId); return <li key={targetId}><span>{index + 1}. {target?.name ?? `Character ${targetId}`}</span><div><button type="button" disabled={busy || index === 0} onClick={() => moveTarget(index, -1)}>Up</button><button type="button" disabled={busy || index === request.targetCharacterIds.length - 1} onClick={() => moveTarget(index, 1)}>Down</button><button type="button" disabled={busy} onClick={() => changeTargets(request.targetCharacterIds.filter((id) => id !== targetId))}>Remove</button></div></li>; })}</ol></section>
          <section className="creature-ability-use-effects"><h3>Automatic effects</h3>{!preparation.plan.automaticApplications.length ? <p>No automatic Active State changes.</p> : preparation.plan.automaticApplications.map((application, index) => {
            const target = preparation.plan.targets.find(({ characterId }) => characterId === application.targetCharacterId);
            const needsArea = application.plan.requirements.includes("hp-pool");
            const needsLocalized = application.plan.requirements.includes("hit-location-or-hp-pool");
            const selected = request?.effectSelections[application.applicationKey];
            const selectionValue = selected?.hitLocationNumber !== null && selected?.hitLocationNumber !== undefined ? `location:${selected.hitLocationNumber}` : selected?.poolKey ? `pool:${selected.poolKey}` : "";
            return <article key={application.applicationKey} className={`is-${application.plan.status}`}><header><span>{index + 1}</span><div><strong>{application.plan.summary}</strong><small>{application.effectKey} → {application.targetName}</small></div></header>{needsArea || needsLocalized ? <label><span>{needsArea ? "Affected HP Pool" : "Hit Location or HP Pool"}</span><select value={selectionValue} disabled={busy} onChange={(event) => selectEffect(application.applicationKey, event.target.value)}><option value="">Choose target anatomy…</option>{needsLocalized ? target?.anatomy.hitLocations.filter(({ poolKey }) => poolKey).map((location) => <option key={`location-${location.result}`} value={`location:${location.result}`}>Roll {location.result} · {location.name} → {location.poolName}</option>) : null}{target?.anatomy.pools.map((pool) => <option key={`pool-${pool.key}`} value={`pool:${pool.key}`}>HP Pool · {pool.name}</option>)}</select></label> : null}{application.plan.healthResult ? <div><span>Total Damage {displayNumber(application.plan.healthResult.totalDamage.before)} → {displayNumber(application.plan.healthResult.totalDamage.after)}</span>{application.plan.healthResult.poolDamage.map((pool) => <span key={pool.poolKey}>{pool.poolName} {displayNumber(pool.before)} → {displayNumber(pool.after)}</span>)}</div> : null}{application.plan.issues.map((issue) => <p key={`${issue.code}-${issue.path}`}>{issue.message}</p>)}</article>;
          })}</section>
          <section className="creature-ability-use-manual"><h3>Manual G.O.D. resolution</h3>{!preparation.plan.manualEffects.length ? <p>No Manual instructions.</p> : preparation.plan.manualEffects.map((effect) => <article key={effect.effectKey}><strong>{effect.title}</strong><p>{effect.description}</p>{effect.compatibilityFallback ? <small>Temporary compatibility instruction from legacy descriptive fields; not persisted as a structured effect.</small> : null}</article>)}</section>
          {preparation.plan.issues.length ? <div className="creature-ability-use-feedback">{preparation.plan.issues.map((issue) => <p key={issue}>{issue}</p>)}</div> : null}
          {preparation.plan.status === "needs-selection" ? <p className="creature-ability-use-feedback">Select affected targets and every required anatomy location before confirming.</p> : null}
          <footer><button type="button" disabled={busy} onClick={() => void close()}>Cancel</button><button type="button" className="is-primary" disabled={busy || !preparation.plan.ready} onClick={() => void confirm()}>{busy ? "Resolving…" : "Confirm Use Ability"}</button></footer>
        </div> : null}
        {result ? <div className="creature-ability-use-result" aria-live="polite"><strong>{result.ability.abilityName} resolved.</strong>{result.automaticEffects.length ? <section><h3>Applied automatically</h3><ul>{result.automaticEffects.map((effect) => <li key={effect.applicationKey}>{effect.targetName}: {effect.summary}</li>)}</ul></section> : <p>No automatic Active State changes were made.</p>}{result.manualEffects.length ? <section><h3>Manual G.O.D. Resolution Required</h3>{result.manualEffects.map((effect) => <article key={effect.effectKey}><strong>{effect.title}</strong><p>{effect.description}</p></article>)}</section> : null}<button type="button" className="is-primary" onClick={() => void close()}>Done</button></div> : null}
      </section>
    </div> : null}
  </>;
}
