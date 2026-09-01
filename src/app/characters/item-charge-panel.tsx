"use client";

import { useState } from "react";

import type { CharacterItemChargeStateView, ItemChargeState } from "@/features/items/item-charge";

import {
  restoreItemChargesAction,
  restoreItemChargesFullAction,
  setItemCurrentChargesAction,
} from "./item-charge-actions";
import "./item-charge-panel.css";

type Props = {
  state: CharacterItemChargeStateView;
  disabled?: boolean;
  onChange: (state: CharacterItemChargeStateView) => void;
};

function stateLabel(state: ItemChargeState["equipmentState"]) {
  return state[0].toUpperCase() + state.slice(1);
}

export function ItemChargePanel({ state, disabled = false, onChange }: Props) {
  const [restoreAmounts, setRestoreAmounts] = useState<Record<number, string>>({});
  const [exactValues, setExactValues] = useState<Record<number, string>>({});
  const [busyInstanceId, setBusyInstanceId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(instanceId: number, operation: () => Promise<CharacterItemChargeStateView>) {
    setBusyInstanceId(instanceId);
    setError(null);
    try {
      const next = await operation();
      onChange(next);
      const updated = next.instances.find((entry) => entry.instanceId === instanceId);
      if (updated) setExactValues((current) => ({ ...current, [instanceId]: String(updated.currentCharges) }));
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Item Charges could not be updated."); }
    finally { setBusyInstanceId(null); }
  }

  return <section className="item-charge-panel" aria-label="Owned Item Charge State">
    <header><div><p>STATEFUL ITEMS</p><h3>Charge Management</h3></div><span>Recharge rules are descriptive. The table decides when and how much to restore.</span></header>
    {error ? <p className="item-charge-panel__error" role="alert">{error}</p> : null}
    {!state.instances.length ? <p className="item-charge-panel__empty">No individually owned charged Item copies are present.</p> : null}
    <div className="item-charge-panel__grid">{state.instances.map((entry) => {
      const busy = busyInstanceId === entry.instanceId;
      const identity = { characterId: state.characterId, itemId: entry.itemId, instanceId: entry.instanceId };
      if (entry.definitionStatus === "definition-mismatch") return <article key={entry.instanceId} className="is-mismatch">
        <header><div><strong>{entry.itemName} · Copy #{entry.instanceId}</strong><span>State: {stateLabel(entry.equipmentState)}</span></div><b>{entry.currentCharges} stored Charges</b></header>
        <p>This stable instance is preserved, but its current Item definition no longer uses Charges. G.O.D./author resolution is required; no automatic conversion occurred.</p>
      </article>;
      return <article key={entry.instanceId}>
        <header><div><strong>{entry.itemName} · Copy #{entry.instanceId}</strong><span>State: {stateLabel(entry.equipmentState)} · Per Use: {entry.chargesPerUse}</span></div><b>{entry.currentCharges} / {entry.maximumCharges}</b></header>
        {entry.isAboveCurrentMaximum ? <p className="item-charge-panel__warning">Current Charges are above the current template Maximum. They were preserved; spending may reduce them, while Restore Full or exact correction can normalize them.</p> : null}
        <section><h4>Recharge Rule / Notes</h4><p>{entry.rechargeNotes || "No descriptive recharge rule is recorded."}</p></section>
        <div className="item-charge-panel__controls">
          <label><span>Restore Charges</span><input type="number" min={1} step={1} value={restoreAmounts[entry.instanceId] ?? "1"} disabled={disabled || busy} onChange={(event) => setRestoreAmounts((current) => ({ ...current, [entry.instanceId]: event.target.value }))} /></label>
          <button type="button" disabled={disabled || busy} onClick={() => void run(entry.instanceId, () => restoreItemChargesAction({ ...identity, amount: Number(restoreAmounts[entry.instanceId] ?? "1") }))}>Restore</button>
          <button type="button" disabled={disabled || busy} onClick={() => void run(entry.instanceId, () => restoreItemChargesFullAction(identity))}>Restore Full</button>
          <label><span>Set Current Charges</span><input type="number" min={0} max={entry.maximumCharges ?? undefined} step={1} value={exactValues[entry.instanceId] ?? String(entry.currentCharges)} disabled={disabled || busy} onChange={(event) => setExactValues((current) => ({ ...current, [entry.instanceId]: event.target.value }))} /></label>
          <button type="button" disabled={disabled || busy} onClick={() => void run(entry.instanceId, () => setItemCurrentChargesAction({ ...identity, currentCharges: Number(exactValues[entry.instanceId] ?? entry.currentCharges) }))}>Set Exact</button>
        </div>
      </article>;
    })}</div>
  </section>;
}
