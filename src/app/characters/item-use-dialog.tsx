"use client";

import { useState } from "react";

import {
  executeCharacterItemUse,
  prepareCharacterItemUse,
  type ItemUsePreparation,
} from "./item-use-actions";
import type {
  ItemUseEffectSelection,
  ItemUseExecutionResult,
  ItemUseRequest,
} from "@/features/items/item-use";

import "./item-use-dialog.css";

type Props = {
  sourceCharacterId: number;
  itemId: number;
  itemInstanceId: number | null;
  itemName: string;
  activationLabel: string;
  disabled?: boolean;
  onComplete: () => void | Promise<void>;
};

function displayNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function resourceSummary(preparation: ItemUsePreparation): string {
  const resource = preparation.plan.resource;
  if (!resource) return "No usable resource was found.";
  if (resource.kind === "instance") {
    return `${resource.consumed} Charge${resource.consumed === 1 ? "" : "s"}: ${resource.before} / ${resource.maximumCharges} → ${resource.after} / ${resource.maximumCharges}${resource.exceedsCurrentMaximum ? " · Current Charges exceed the current template maximum" : ""}`;
  }
  if (resource.useMode === "unlimited") return `Unlimited use; owned quantity remains ${resource.before}.`;
  return `${resource.consumed} Item${resource.consumed === 1 ? "" : "s"}: ${resource.before} → ${resource.after}`;
}

function resultResourceSummary(result: ItemUseExecutionResult): string {
  const resource = result.resource;
  if (resource.kind === "instance") {
    return `Copy #${resource.instanceId}: ${resource.before} / ${resource.maximumCharges} → ${resource.after} / ${resource.maximumCharges} Charges${resource.exceedsCurrentMaximum ? " · still above the current template maximum" : ""}`;
  }
  if (resource.useMode === "unlimited") return `Owned stack unchanged at ${resource.after}.`;
  return resource.after === 0
    ? `Consumed ${resource.consumed}; the empty owned stack was removed.`
    : `Owned quantity: ${resource.before} → ${resource.after}.`;
}

export function ItemUseDialog({
  sourceCharacterId,
  itemId,
  itemInstanceId,
  itemName,
  activationLabel,
  disabled = false,
  onComplete,
}: Props) {
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState<ItemUseRequest | null>(null);
  const [preparation, setPreparation] = useState<ItemUsePreparation | null>(null);
  const [result, setResult] = useState<ItemUseExecutionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function preview(next: ItemUseRequest) {
    setBusy(true);
    setError(null);
    setResult(null);
    setRequest(next);
    try {
      setPreparation(await prepareCharacterItemUse(next));
    } catch (caught) {
      setPreparation(null);
      setError(caught instanceof Error ? caught.message : "This Item use could not be prepared.");
    } finally {
      setBusy(false);
    }
  }

  function begin() {
    const initial: ItemUseRequest = {
      sourceCharacterId,
      itemId,
      itemInstanceId,
      targetCharacterId: null,
      effectSelections: {},
    };
    setOpen(true);
    void preview(initial);
  }

  function selectTarget(value: string) {
    if (!request) return;
    void preview({
      ...request,
      targetCharacterId: Number(value),
      effectSelections: {},
    });
  }

  function selectEffect(effectId: number, value: string) {
    if (!request) return;
    let selection: ItemUseEffectSelection = {};
    if (value.startsWith("location:")) {
      selection = { hitLocationNumber: Number(value.slice("location:".length)), poolKey: null };
    } else if (value.startsWith("pool:")) {
      selection = { poolKey: value.slice("pool:".length), hitLocationNumber: null };
    }
    void preview({
      ...request,
      effectSelections: {
        ...request.effectSelections,
        [String(effectId)]: selection,
      },
    });
  }

  async function confirm() {
    if (!request || !preparation?.plan.ready) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await executeCharacterItemUse(request));
      setPreparation(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This Item use could not be completed.");
      try {
        setPreparation(await prepareCharacterItemUse(request));
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
    if (completed) await onComplete();
  }

  const anatomy = preparation?.plan.initialHealth.anatomy;
  return <>
    <button type="button" className="item-use-trigger" disabled={disabled} onClick={begin}>
      {activationLabel || "Use"}
    </button>
    {open ? <div className="item-use-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) void close(); }}>
      <section className="item-use-dialog" role="dialog" aria-modal="true" aria-labelledby={`item-use-title-${itemId}-${itemInstanceId ?? "stack"}`}>
        <header>
          <div><p>ACTIVATED ITEM</p><h2 id={`item-use-title-${itemId}-${itemInstanceId ?? "stack"}`}>{itemName}</h2></div>
          <button type="button" aria-label="Close Item use" disabled={busy} onClick={() => void close()}>×</button>
        </header>

        {busy && !preparation && !result ? <p className="item-use-loading">Preparing authoritative preview…</p> : null}
        {error ? <p className="item-use-feedback is-error" role="alert">{error}</p> : null}

        {preparation ? <div className="item-use-content">
          <section className="item-use-target">
            <label><span>Target</span>{preparation.canChooseTarget ? <select value={preparation.plan.target.characterId} disabled={busy} onChange={(event) => selectTarget(event.target.value)}>{preparation.targetOptions.map((target) => <option key={target.characterId} value={target.characterId}>{target.name}{target.isNpc ? ` · ${target.npcKind === "creature" ? "Creature NPC" : "NPC"}` : ""}</option>)}</select> : <strong>Self · {preparation.plan.target.name}</strong>}</label>
          </section>

          <section className="item-use-resource"><h3>Resource preview</h3><p>{resourceSummary(preparation)}</p>{preparation.plan.item.useNotes ? <small>{preparation.plan.item.useNotes}</small> : null}{preparation.plan.item.rechargeNotes ? <small>Recharge rule: {preparation.plan.item.rechargeNotes} · descriptive only</small> : null}</section>

          <section className="item-use-effects"><h3>Ordered effects</h3>{preparation.plan.effects.map((entry, index) => {
            const needsArea = entry.plan.requirements.includes("hp-pool");
            const needsLocalized = entry.plan.requirements.includes("hit-location-or-hp-pool");
            const selected = request?.effectSelections[String(entry.effectId)];
            const selectionValue = selected?.hitLocationNumber !== null && selected?.hitLocationNumber !== undefined
              ? `location:${selected.hitLocationNumber}`
              : selected?.poolKey ? `pool:${selected.poolKey}` : "";
            return <article key={entry.effectId} className={`is-${entry.plan.status}`}>
              <div><span>{index + 1}</span><div><strong>{entry.plan.summary}</strong><small>Effect #{entry.effectId} · {entry.plan.status.replace("-", " ")}</small></div></div>
              {needsArea || needsLocalized ? <label><span>{needsArea ? "Affected HP Pool" : "Hit Location or HP Pool"}</span><select value={selectionValue} disabled={busy} onChange={(event) => selectEffect(entry.effectId, event.target.value)}><option value="">Choose a target area…</option>{needsLocalized ? anatomy?.hitLocations.filter((location) => location.poolKey).map((location) => <option key={`location-${location.result}`} value={`location:${location.result}`}>Roll {location.result} · {location.name} → {location.poolName}</option>) : null}{anatomy?.pools.map((pool) => <option key={`pool-${pool.key}`} value={`pool:${pool.key}`}>HP Pool · {pool.name}</option>)}</select></label> : null}
              {entry.plan.healthResult ? <div className="item-use-health-preview"><span>Total Damage {displayNumber(entry.plan.healthResult.totalDamage.before)} → {displayNumber(entry.plan.healthResult.totalDamage.after)}</span><span>Maximum HP {entry.plan.healthResult.after.total.maximumHp === null ? "Unavailable" : displayNumber(entry.plan.healthResult.after.total.maximumHp)}</span>{entry.plan.healthResult.poolDamage.map((pool) => <span key={pool.poolKey}>{pool.poolName} {displayNumber(pool.before)} → {displayNumber(pool.after)}</span>)}</div> : null}
              {entry.effect?.kind === "manual" ? <p className="item-use-manual"><strong>{entry.effect.title}</strong>{entry.effect.description}</p> : null}
              {entry.plan.issues.map((issue) => <p className="item-use-issue" key={`${issue.code}-${issue.path}`}>{issue.message}</p>)}
            </article>;
          })}</section>

          {preparation.plan.issues.length ? <div className="item-use-feedback is-error">{preparation.plan.issues.map((issue) => <p key={issue}>{issue}</p>)}</div> : null}
          {preparation.plan.status === "needs-selection" ? <p className="item-use-feedback">Choose every required anatomy target before confirming.</p> : null}
          <footer><button type="button" disabled={busy} onClick={() => void close()}>Cancel</button><button type="button" className="is-primary" disabled={busy || !preparation.plan.ready} onClick={() => void confirm()}>{busy ? "Resolving…" : `Confirm ${preparation.plan.item.activationLabel}`}</button></footer>
        </div> : null}

        {result ? <div className="item-use-result" aria-live="polite"><strong>{result.item.activationLabel} completed.</strong><p>{result.item.name} affected {result.target.name}.</p><p>{resultResourceSummary(result)}</p>{result.automaticEffects.length ? <section><h3>Applied automatically</h3><ul>{result.automaticEffects.map((effect) => <li key={effect.effectId}>{effect.summary}</li>)}</ul></section> : null}{result.manualEffects.length ? <section className="item-use-result-manual"><h3>Manual G.O.D. Resolution Required</h3>{result.manualEffects.map((effect) => <article key={effect.effectId}><strong>{effect.title}</strong><p>{effect.description}</p></article>)}</section> : null}<button type="button" className="is-primary" onClick={() => void close()}>Done</button></div> : null}
      </section>
    </div> : null}
  </>;
}
