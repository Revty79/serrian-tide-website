"use client";

import { useState } from "react";

import {
  ACTIVE_EQUIPMENT_STATES,
  EQUIPMENT_STATES,
  type ActiveEquipmentState,
  type CharacterEquipmentStateView,
  type EquipmentState,
} from "@/features/items/equipment-state";
import type { ActiveEffectsView } from "@/features/active-state/active-effects";
import type { EquipmentStateMutationResult } from "@/features/items/equipment-state-service";

import {
  setInstanceEquipmentStateAction,
  setStackEquipmentStateAction,
} from "./equipment-state-actions";
import "./equipment-state-panel.css";

type Props = {
  state: CharacterEquipmentStateView;
  disabled?: boolean;
  includeEffectHistory?: boolean;
  onChange: (state: CharacterEquipmentStateView) => void;
  onActiveEffectsChange: (state: ActiveEffectsView) => void;
};

function stateLabel(state: EquipmentState) {
  return state[0].toUpperCase() + state.slice(1);
}

export function EquipmentStatePanel({ state, disabled = false, includeEffectHistory = false, onChange, onActiveEffectsChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(operation: () => Promise<EquipmentStateMutationResult>) {
    setBusy(true); setError(null);
    try {
      const result = await operation();
      onChange(result.equipmentState);
      onActiveEffectsChange(result.activeEffects);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Equipment State could not be updated."); }
    finally { setBusy(false); }
  }
  function quantityFor(entry: CharacterEquipmentStateView["stacks"][number], equipmentState: ActiveEquipmentState) {
    return equipmentState === "equipped" ? entry.equippedQuantity : equipmentState === "worn" ? entry.wornQuantity : entry.wieldedQuantity;
  }
  function changeStack(itemId: number, equipmentState: ActiveEquipmentState, quantity: number) {
    void run(() => setStackEquipmentStateAction({ characterId: state.characterId, itemId, state: equipmentState, quantity, includeEffectHistory }));
  }
  return <section className="equipment-state-panel" aria-label="Equipment State">
    <header><div><p>RUNTIME EQUIPMENT</p><h3>Equipment State</h3></div><span>State is explicit. No slots, armor stacking, attacks, or Initiative spending are inferred.</span></header>
    {error ? <p className="equipment-state-panel__error" role="alert">{error}</p> : null}
    {!state.stacks.length && !state.instances.length ? <p className="equipment-state-panel__empty">No owned Equipment is available for an active role.</p> : null}
    <div className="equipment-state-panel__owned">
      {state.stacks.map((entry) => <article key={`stack-${entry.itemId}`}>
        <header><div><strong>{entry.itemName} ×{entry.ownedQuantity}</strong><span>{entry.equipmentGroup} · Stack-owned</span></div><b>Inactive: {entry.inactiveQuantity}</b></header>
        <div className="equipment-state-panel__quantity-grid">{ACTIVE_EQUIPMENT_STATES.map((equipmentState) => {
          const quantity = quantityFor(entry, equipmentState);
          return <div key={equipmentState}><span>{stateLabel(equipmentState)}</span><button type="button" disabled={disabled || busy || quantity <= 0} onClick={() => changeStack(entry.itemId, equipmentState, quantity - 1)}>−</button><strong>{quantity}</strong><button type="button" disabled={disabled || busy || entry.inactiveQuantity <= 0} onClick={() => changeStack(entry.itemId, equipmentState, quantity + 1)}>+</button></div>;
        })}</div>
      </article>)}
      {state.instances.map((entry) => <article key={`instance-${entry.instanceId}`}>
        <header><div><strong>{entry.itemName} · Copy #{entry.instanceId}</strong><span>{entry.equipmentGroup} · {entry.currentCharges} Charges</span></div></header>
        <label>Equipment State<select disabled={disabled || busy} value={entry.state} onChange={(event) => void run(() => setInstanceEquipmentStateAction({ characterId: state.characterId, instanceId: entry.instanceId, state: event.target.value as EquipmentState, includeEffectHistory }))}>{EQUIPMENT_STATES.map((equipmentState) => <option key={equipmentState} value={equipmentState}>{stateLabel(equipmentState)}</option>)}</select></label>
      </article>)}
    </div>
    {state.wornArmor.length ? <section className="equipment-state-panel__context"><h4>Worn Armor Context</h4><p>Armor contributions remain individual; Base Soak is not summed.</p>{state.wornArmor.map((armor) => <article key={armor.ownershipKey}><strong>{armor.itemName}{armor.activeQuantity > 1 ? ` ×${armor.activeQuantity}` : ""}</strong><span>Base Soak: {armor.baseSoak ?? "Not recorded"} · Coverage: {armor.coverage || "Not recorded"}</span><small>Locations: {armor.coveredLocationKeys.join(", ") || "Not recorded"}{armor.armorType ? ` · ${armor.armorType}` : ""}</small>{armor.rulesText ? <p>{armor.rulesText}</p> : null}</article>)}</section> : null}
    {state.wieldedWeapons.length ? <section className="equipment-state-panel__context"><h4>Wielded Weapon Context</h4><p>Profiles are exposed for future Combat; nothing is rolled, spent, or applied.</p>{state.wieldedWeapons.map((weapon) => <article key={weapon.ownershipKey}><strong>{weapon.itemName}{weapon.activeQuantity > 1 ? ` ×${weapon.activeQuantity}` : ""}</strong><span>Damage: {weapon.damage || "Not recorded"}{weapon.damageType ? ` ${weapon.damageType}` : ""} · Initiative Cost: {weapon.initiativeCost ?? "Not recorded"}</span><small>{[weapon.weaponType, weapon.handedness, weapon.range, weapon.reach].filter(Boolean).join(" · ") || "No additional structured profile"}</small>{weapon.rulesText ? <p>{weapon.rulesText}</p> : null}</article>)}</section> : null}
    {state.activeManualPassives.length ? <section className="equipment-state-panel__manual"><h4>Manual Passive Effects · G.O.D. Resolution Required</h4>{state.activeManualPassives.map((entry) => <article key={entry.passiveEffectId}><strong>{entry.title}</strong><span>{entry.itemName} · {entry.lifecycleLabel}</span><p>{entry.description}</p></article>)}</section> : null}
  </section>;
}
