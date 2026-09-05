"use client";

import { useMemo, useState } from "react";

import type {
  CharacterDerivedAbilityStatus,
  DerivedAbilityDefinition,
} from "@/features/derived-abilities/models";
import type {
  CharacterDerivedAbilityUsePreparation,
  DerivedAbilityUseEffectSelection,
} from "@/features/derived-abilities/character-derived-ability-service";
import { formatDerivedAbilityMechanicalEffectSummary } from "@/features/derived-abilities/derived-ability-effects";
import { getDerivedAbilityRequirementSummary } from "@/features/derived-abilities/derived-ability-rules";

import {
  grantDerivedAbility,
  learnDerivedAbility,
  prepareDerivedAbilityUse,
  rechargeDerivedAbility,
  revokeDerivedAbility,
  useDerivedAbility as executeDerivedAbilityUse,
} from "./derived-ability-actions";

type Props = {
  characterId: number;
  abilities: readonly DerivedAbilityDefinition[];
  statuses: readonly CharacterDerivedAbilityStatus[];
  skillNames: ReadonlyMap<number, string>;
  godMode: boolean;
  disabled: boolean;
  runtimeDisabled: boolean;
  onComplete: () => void | Promise<void>;
};

function statusLabel(status: CharacterDerivedAbilityStatus): string {
  return ({
    "automatic-active": "Automatic · Active",
    "automatic-inactive": "Automatic · Inactive",
    "automatic-manual-review": "Automatic · G.O.D. review",
    "owned-available": "Known · Available",
    "owned-unavailable": "Known · Unavailable",
    "owned-manual-review": "Known · G.O.D. review",
    "eligible-to-learn": "Eligible to Learn",
    "manual-review": "G.O.D. Review Required",
    "not-eligible": "Not Eligible",
    "awarded-not-owned": "Not Awarded",
  } as const)[status.status];
}

function abilityEffectSelections(
  ability: DerivedAbilityDefinition,
  characterId: number,
): Record<string, DerivedAbilityUseEffectSelection> {
  return Object.fromEntries(ability.effects.flatMap((effect, sortOrder) =>
    effect.kind === "manual"
      ? []
      : [[String(sortOrder), { targetCharacterId: characterId }]],
  ));
}

export function DerivedAbilityPanel({
  characterId,
  abilities,
  statuses,
  skillNames,
  godMode,
  disabled,
  runtimeDisabled,
  onComplete,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [usingId, setUsingId] = useState<number | null>(null);
  const [selections, setSelections] = useState<Record<string, DerivedAbilityUseEffectSelection>>({});
  const [preparation, setPreparation] = useState<CharacterDerivedAbilityUsePreparation | null>(null);
  const [manualConfirmed, setManualConfirmed] = useState(false);
  const statusById = useMemo(
    () => new Map(statuses.map((status) => [status.abilityId, status])),
    [statuses],
  );
  const abilityNames = useMemo(
    () => new Map(abilities.map((ability) => [ability.id, ability.name])),
    [abilities],
  );
  const refs = { skillNames, derivedAbilityNames: abilityNames };
  const available = abilities.filter((ability) => statusById.get(ability.id)?.available);
  const knownUnavailable = abilities.filter((ability) => {
    const status = statusById.get(ability.id);
    return status?.ownershipId !== null && !status?.available;
  });
  const learnable = abilities.filter((ability) => {
    const status = statusById.get(ability.id);
    return !ability.archived
      && ability.acquisitionType === "learned"
      && (status?.status === "eligible-to-learn" || status?.status === "manual-review");
  });
  const awardable = godMode
    ? abilities.filter((ability) =>
        !ability.archived
        && ability.acquisitionType === "awarded"
        && statusById.get(ability.id)?.status === "awarded-not-owned")
    : [];

  async function mutate(operation: () => Promise<unknown>, success: string) {
    setBusy(true);
    setFeedback("");
    try {
      await operation();
      await onComplete();
      setFeedback(success);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Derived Ability action failed.");
    } finally {
      setBusy(false);
    }
  }

  function beginUse(ability: DerivedAbilityDefinition) {
    if (runtimeDisabled) return;
    setUsingId(ability.id);
    setSelections(abilityEffectSelections(ability, characterId));
    setPreparation(null);
    setManualConfirmed(false);
    setFeedback("");
  }

  async function planUse(confirmManual = manualConfirmed) {
    if (usingId === null || runtimeDisabled) return;
    setBusy(true);
    setFeedback("");
    try {
      const next = await prepareDerivedAbilityUse({
        characterId,
        derivedAbilityId: usingId,
        effectSelections: selections,
        manualConfirmed: confirmManual,
      });
      setManualConfirmed(confirmManual);
      setPreparation(next);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Use could not be planned.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmUse() {
    if (usingId === null || runtimeDisabled || preparation?.plan.status !== "ready") return;
    await mutate(async () => {
      await executeDerivedAbilityUse({
        characterId,
        derivedAbilityId: usingId,
        effectSelections: selections,
        manualConfirmed,
      });
      setUsingId(null);
      setPreparation(null);
    }, "Derived Ability use resolved and recorded.");
  }

  function renderStructuredEffects(ability: DerivedAbilityDefinition) {
    return ability.effects.length ? <ul className="character-sheet__derived-effect-list">
      {ability.effects.map((effect, sortOrder) => (
        <li key={sortOrder}>
          {formatDerivedAbilityMechanicalEffectSummary(effect)}
          {effect.kind === "manual" ? ` — ${effect.description}` : ""}
        </li>
      ))}
    </ul> : null;
  }

  function renderCard(ability: DerivedAbilityDefinition, actions = true) {
    const status = statusById.get(ability.id);
    if (!status) return null;
    const canUse = status.available && ability.activationType === "activated";
    return (
      <article key={ability.id} className={!status.available && status.ownershipId ? "is-unavailable" : undefined}>
        <header>
          <h4>{ability.name}</h4>
          <strong>{statusLabel(status)}</strong>
        </header>
        <p className="character-sheet__derived-meta">
          {ability.acquisitionType} · {ability.activationType} · {getDerivedAbilityRequirementSummary(ability, refs)}
        </p>
        {ability.description ? <p>{ability.description}</p> : null}
        {ability.mechanicalEffect ? <p><b>Effect:</b> {ability.mechanicalEffect}</p> : null}
        {renderStructuredEffects(ability)}
        {actions ? <div className="character-sheet__derived-actions">
          {canUse ? <button type="button" disabled={disabled || runtimeDisabled || busy} onClick={() => beginUse(ability)}>Use Ability</button> : null}
          {godMode && status.ownershipId !== null ? <button type="button" disabled={disabled || busy} onClick={() => {
            if (window.confirm(`Revoke ${ability.name}? Ownership history and use history will remain.`)) {
              void mutate(() => revokeDerivedAbility({ characterId, derivedAbilityId: ability.id }), `${ability.name} was revoked.`);
            }
          }}>Revoke</button> : null}
          {godMode ? ability.useLimits.filter((limit) => limit.refreshScope === "manual" || limit.refreshScope === "event").map((limit) => (
            <button key={`${limit.refreshScope}:${limit.sortOrder}`} type="button" disabled={disabled || runtimeDisabled || busy} onClick={() => void mutate(() => rechargeDerivedAbility({
              characterId,
              derivedAbilityId: ability.id,
              refreshScope: limit.refreshScope as "manual" | "event",
              refreshKey: limit.refreshScope === "event" ? limit.refreshKey : null,
              notes: "Confirmed from Character Derived Ability controls.",
            }), `${ability.name} ${limit.refreshScope} recharge was recorded.`)}>
              {limit.refreshScope === "manual" ? "Reset / Recharge" : `Report ${limit.refreshKey} Recharge`}
            </button>
          )) : null}
        </div> : null}
      </article>
    );
  }

  const using = usingId === null ? null : abilities.find(({ id }) => id === usingId) ?? null;

  return (
    <section className="character-sheet__section character-sheet__derived-abilities">
      <div className="character-sheet__section-heading">
        <p>DERIVED ABILITIES</p>
        <h3>Character Abilities</h3>
        <span>Ownership persists; live requirements determine current availability.</span>
      </div>
      {feedback ? <p role="status" className="character-sheet__derived-feedback">{feedback}</p> : null}

      <h4>Available / Active</h4>
      <div className="character-sheet__derived-ability-grid">
        {available.length ? available.map((ability) => renderCard(ability)) : <p>No Derived Abilities are currently available.</p>}
      </div>

      {knownUnavailable.length ? <>
        <h4>Known but Unavailable</h4>
        <div className="character-sheet__derived-ability-grid">
          {knownUnavailable.map((ability) => renderCard(ability))}
        </div>
      </> : null}

      {learnable.length ? <>
        <h4>Available to Learn</h4>
        <div className="character-sheet__derived-ability-grid">
          {learnable.map((ability) => {
            const status = statusById.get(ability.id)!;
            return <article key={ability.id}>
              <header><h4>{ability.name}</h4><strong>{statusLabel(status)}</strong></header>
              <p className="character-sheet__derived-meta">{getDerivedAbilityRequirementSummary(ability, refs)}</p>
              {ability.description ? <p>{ability.description}</p> : null}
              {ability.mechanicalEffect ? <p><b>Effect:</b> {ability.mechanicalEffect}</p> : null}
              {renderStructuredEffects(ability)}
              {status.status === "eligible-to-learn" || godMode ? <button type="button" disabled={disabled || busy} onClick={() => void mutate(() => learnDerivedAbility({
                characterId,
                derivedAbilityId: ability.id,
                manualConfirmed: status.acquisitionResult === "manual" && godMode,
                notes: status.acquisitionResult === "manual" ? "Manual Acquisition Requirements confirmed by G.O.D." : "Explicitly learned; no acquisition resource price is defined.",
              }), `${ability.name} was learned.`)}>Learn Ability</button> : <strong>G.O.D. Review Required</strong>}
            </article>;
          })}
        </div>
      </> : null}

      {awardable.length ? <>
        <h4>G.O.D. Award Controls</h4>
        <div className="character-sheet__derived-ability-grid">
          {awardable.map((ability) => {
            const status = statusById.get(ability.id)!;
            const permitted = status.acquisitionResult !== "unsatisfied";
            return <article key={ability.id}>
              <header><h4>{ability.name}</h4><strong>{status.acquisitionResult === "manual" ? "Manual confirmation" : status.acquisitionResult}</strong></header>
              <p className="character-sheet__derived-meta">{getDerivedAbilityRequirementSummary(ability, refs)}</p>
              {ability.description ? <p>{ability.description}</p> : null}
              {ability.mechanicalEffect ? <p><b>Effect:</b> {ability.mechanicalEffect}</p> : null}
              {renderStructuredEffects(ability)}
              <button type="button" disabled={disabled || busy || !permitted} onClick={() => void mutate(() => grantDerivedAbility({
                characterId,
                derivedAbilityId: ability.id,
                manualConfirmed: status.acquisitionResult === "manual",
                notes: status.acquisitionResult === "manual" ? "Manual Acquisition Requirements confirmed by G.O.D." : "Awarded by the owning G.O.D.",
              }), `${ability.name} was awarded.`)}>Grant Awarded Ability</button>
              {!permitted ? <p>Machine-evaluable Acquisition Requirements are not satisfied.</p> : null}
            </article>;
          })}
        </div>
      </> : null}

      {using ? <div className="character-sheet__derived-use" role="dialog" aria-modal="true" aria-labelledby="derived-use-title">
        <div className="character-sheet__derived-use-card">
          <header><div><p>DERIVED ABILITY USE</p><h3 id="derived-use-title">{using.name}</h3></div><button type="button" onClick={() => setUsingId(null)}>Close</button></header>
          {using.effects.map((effect, sortOrder) => effect.kind === "manual" ? (
            <p key={sortOrder}><b>Manual effect:</b> {effect.title} — {effect.description}</p>
          ) : (
            <fieldset key={sortOrder}>
              <legend>Effect {sortOrder + 1} · {effect.kind}</legend>
              <label>Target
                <select value={selections[String(sortOrder)]?.targetCharacterId ?? characterId} onChange={(event) => {
                  setSelections((current) => ({ ...current, [String(sortOrder)]: { ...current[String(sortOrder)], targetCharacterId: Number(event.target.value) } }));
                  setPreparation(null);
                }}>
                  {(preparation?.targetOptions ?? [{ characterId, name: "Self" }]).map((target) => <option key={target.characterId} value={target.characterId}>{target.name}</option>)}
                </select>
              </label>
              {effect.kind === "health.heal" && effect.scope === "area" ? <label>HP Pool key<input value={selections[String(sortOrder)]?.poolKey ?? ""} onChange={(event) => {
                setSelections((current) => ({ ...current, [String(sortOrder)]: { ...current[String(sortOrder)], poolKey: event.target.value } }));
                setPreparation(null);
              }} /></label> : null}
              {effect.kind === "health.damage" ? <><label>HP Pool key<input value={selections[String(sortOrder)]?.poolKey ?? ""} onChange={(event) => {
                setSelections((current) => ({ ...current, [String(sortOrder)]: { ...current[String(sortOrder)], poolKey: event.target.value, hitLocationNumber: null } }));
                setPreparation(null);
              }} /></label><label>or Hit location<input type="number" value={selections[String(sortOrder)]?.hitLocationNumber ?? ""} onChange={(event) => {
                setSelections((current) => ({ ...current, [String(sortOrder)]: { ...current[String(sortOrder)], hitLocationNumber: event.target.value ? Number(event.target.value) : null, poolKey: "" } }));
                setPreparation(null);
              }} /></label></> : null}
            </fieldset>
          ))}
          <button type="button" disabled={busy} onClick={() => void planUse(false)}>Plan Use</button>
          {preparation ? <div className="character-sheet__derived-plan">
            <strong>Status: {preparation.plan.status}</strong>
            {preparation.plan.conditions.map((condition) => <p key={`condition-${condition.sortOrder}`}>{condition.summary}: {condition.result}</p>)}
            {preparation.plan.costs.map((cost) => <p key={`cost-${cost.sortOrder}`}>{cost.summary} ({cost.status})</p>)}
            {preparation.plan.limits.map((limit) => <p key={`limit-${limit.sortOrder}`}>{limit.summary}</p>)}
            {preparation.plan.missingSelections.map((missing) => <p key={missing}>{missing}</p>)}
            {preparation.plan.manualSteps.map((step) => <p key={step}>Manual: {step}</p>)}
            {preparation.plan.issues.map((issue) => <p key={issue}>{issue}</p>)}
            {preparation.plan.status === "manual" ? <button type="button" disabled={busy} onClick={() => void planUse(true)}>Confirm Manual Table Steps</button> : null}
            {preparation.plan.status === "ready" ? <button type="button" disabled={busy} onClick={() => void confirmUse()}>Confirm Use</button> : null}
          </div> : null}
        </div>
      </div> : null}
    </section>
  );
}
