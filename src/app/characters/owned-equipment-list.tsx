"use client";

import { useState } from "react";
import type { CharacterAggregate, CharacterDraft } from "@/features/characters/models";
import { EQUIPMENT_STATES, type EquipmentState, type CharacterEquipmentStateView, type StackEquipmentState } from "@/features/items/equipment-state";
import { getCharacterWeaponDamageSummary } from "@/features/characters/character-sheet-rules";
import { getItemChargeDisplay } from "@/features/items/item-ownership";
import type { ActiveEffectsView } from "@/features/active-state/active-effects";
import { getItemUseActivatability } from "@/features/items/item-use";
import { readyOwnedWeaponAction, setInstanceEquipmentStateAction, setStackEquipmentRoleAction } from "./equipment-state-actions";
import { OwnerInventoryControl } from "./owner-inventory-control";
import { ItemUseDialog } from "./item-use-dialog";

type Props = {
  aggregate: CharacterAggregate;
  draft: CharacterDraft;
  equipment: CharacterEquipmentStateView;
  disabled: boolean;
  useDisabled: boolean;
  ownerDisabled: boolean;
  useDisabledReason?: string;
  includeEffectHistory: boolean;
  onEquipmentChange: (state: CharacterEquipmentStateView) => void;
  onEffectsChange: (state: ActiveEffectsView) => void;
  onUseComplete: () => void | Promise<void>;
};

export function OwnedEquipmentList({ aggregate, draft, equipment, disabled, ownerDisabled, useDisabled, useDisabledReason, includeEffectHistory, onEquipmentChange, onEffectsChange, onUseComplete }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const definitions = new Map(aggregate.authorizedItems.map(item => [item.id, item]));
  const rows = [
    ...draft.items.map(owned => ({ key: `stack-${owned.itemId}`, itemId: owned.itemId, instanceId: null as number | null, quantity: owned.quantity, name: aggregate.items.find(item => item.itemId === owned.itemId)?.name })),
    ...draft.itemInstances.map(owned => ({ key: `copy-${owned.draftId}`, itemId: owned.itemId, instanceId: owned.instanceId, quantity: 1, name: aggregate.itemInstances.find(item => item.id === owned.instanceId)?.name })),
  ];
  async function change(row: typeof rows[number], state: EquipmentState, quantity = 1) {
    if (disabled || busy) return;
    setBusy(true); setError(null);
    try {
      const stack = equipment.stacks.find(item => item.itemId === row.itemId);
      const copy = equipment.instances.find(item => item.instanceId === row.instanceId);
      const result = row.instanceId !== null
        ? copy?.equipmentGroup === "weapon" && !copy.isMagazine && state === "wielded"
          ? await readyOwnedWeaponAction({ characterId: equipment.characterId, itemId: row.itemId, instanceId: row.instanceId, wieldedQuantity: 1 })
          : await setInstanceEquipmentStateAction({ characterId: equipment.characterId, instanceId: row.instanceId, state, includeEffectHistory })
        : stack ? await setStackEquipmentRoleAction({ characterId: equipment.characterId, itemId: row.itemId, state, quantity, includeEffectHistory, expectedQuantities: { inactive: stack.inactiveQuantity, equipped: stack.equippedQuantity, worn: stack.wornQuantity, wielded: stack.wieldedQuantity } }) : null;
      if (result) { onEquipmentChange(result.equipmentState); onEffectsChange(result.activeEffects); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Equipment could not be changed."); }
    finally { setBusy(false); }
  }
  return <section className="character-owned-equipment" aria-label="Owned equipment">
    <header><h3>Owned Equipment</h3><p>Choose Wielded for a weapon or Worn for armor. Use opens the item’s existing preview and confirmation.</p></header>
    {aggregate.sheetAccess?.canAccessPrivateGod ? <OwnerInventoryControl characterId={aggregate.character.id} version={aggregate.profile.commerceVersion ?? 0} disabled={ownerDisabled || busy} onComplete={onUseComplete} /> : null}
    {disabled ? <p className="character-notice">{useDisabledReason ?? "Save pending Character changes before changing equipment."}</p> : null}
    {useDisabled && !disabled && useDisabledReason ? <p className="character-notice">{useDisabledReason}</p> : null}
    {error ? <p className="character-feedback is-error" role="alert">{error}</p> : null}
    {!rows.length ? <p>No owned items yet.</p> : null}
    {rows.map(row => {
      const definition = definitions.get(row.itemId);
      const name = definition?.name ?? row.name ?? `Item ${row.itemId}`;
      const stack = row.key.startsWith("stack-") ? equipment.stacks.find(item => item.itemId === row.itemId) : undefined;
      const copy = row.instanceId === null ? undefined : equipment.instances.find(item => item.instanceId === row.instanceId);
      const state = copy?.state ?? (stack ? EQUIPMENT_STATES.find(state => (state === "inactive" ? stack.inactiveQuantity : state === "equipped" ? stack.equippedQuantity : state === "worn" ? stack.wornQuantity : stack.wieldedQuantity) === stack.ownedQuantity) ?? "mixed" : "inactive");
      const activation = definition ? getItemUseActivatability(definition.runtimeProfile, definition.effectCount) : null;
      const saved = row.key.startsWith("stack-") || row.instanceId !== null;
      const persisted = aggregate.itemInstances.find(item => item.id === row.instanceId);
      const chargeDisplay = persisted && (definition?.powerResource || definition?.runtimeProfile.useMode === "charges") ? getItemChargeDisplay({ currentCharges: persisted.currentCharges, maximumCharges: definition.powerResource?.maximumCharges ?? definition.runtimeProfile.maximumCharges }) : null;
      const damage = definition?.equipmentGroup === "weapon" ? getCharacterWeaponDamageSummary(definition, draft.attributes) : null;
      return <article key={row.key} className="character-owned-equipment__row">
        <div><strong>{name}</strong><small>{row.instanceId !== null ? `Copy #${row.instanceId}` : `${row.quantity} owned`}{chargeDisplay ? ` · ${chargeDisplay.label}` : ""}</small>
          {chargeDisplay?.exceedsCurrentMaximum ? <small>Above current template maximum; saved charges preserved.</small> : null}
          {stack ? <small>{EQUIPMENT_STATES.map(state => [state, stackQuantity(stack, state)] as const).filter(([, quantity]) => quantity > 0).map(([state, quantity]) => `${quantity} ${state}`).join(" · ")}</small> : null}
        </div>
        <div className="character-owned-equipment__actions">
          {stack && stack.ownedQuantity > 1 ? <StackRoleControl key={`${row.key}:${stack.equippedQuantity}:${stack.wornQuantity}:${stack.wieldedQuantity}`} name={name} stack={stack} disabled={disabled || busy} onChange={(state, quantity) => void change(row, state, quantity)} /> : stack || copy ? <label className="st-field"><span>State</span><select className="st-control" aria-label={`Equipment state for ${name}${row.instanceId !== null ? ` copy ${row.instanceId}` : ""}`} disabled={disabled || busy} value={state} onChange={event => void change(row, event.target.value as EquipmentState)}>
            {state === "mixed" ? <option value="mixed" disabled>Mixed states</option> : null}
            {EQUIPMENT_STATES.map(state => <option key={state} value={state}>{state[0].toUpperCase() + state.slice(1)}</option>)}
          </select></label> : null}
          {definition && activation?.executable && saved ? <ItemUseDialog sourceCharacterId={aggregate.character.id} itemId={row.itemId} itemInstanceId={row.instanceId} itemName={name} activationLabel={definition.runtimeProfile.activationLabel} disabled={useDisabled || busy} onComplete={onUseComplete} /> : null}
          {aggregate.sheetAccess?.canAccessPrivateGod && saved ? <OwnerInventoryControl characterId={aggregate.character.id} version={aggregate.profile.commerceVersion ?? 0} disabled={ownerDisabled || busy} remove={{ itemId: row.itemId, name, instanceId: row.instanceId, charges: chargeDisplay?.label, states: stack ? EQUIPMENT_STATES.map(state => ({ state, quantity: stackQuantity(stack, state) })).filter(entry => entry.quantity > 0) : [{ state: copy?.state ?? "inactive", quantity: row.quantity }] }} onComplete={onUseComplete} /> : null}
        </div>
        <details className="character-owned-equipment__details"><summary>Details<span className="sr-only"> for {name}</span></summary>
          {definition && definition.runtimeProfile.useMode !== "none" && activation && !activation.executable ? <p>{activation.reason}</p> : null}
          <p>{definition?.description || "No description recorded."}</p>
          {definition ? <dl>
            <div><dt>Type</dt><dd>{definition.recordType}</dd></div>
            {definition.weight !== null ? <div><dt>Weight per item</dt><dd>{definition.weight} {definition.weightUnit}</dd></div> : null}
            {damage ? <div><dt>Weapon damage</dt><dd>{damage.totalDamage} {definition.damageType}</dd></div> : null}
            {definition.rangeText ? <div><dt>Range</dt><dd>{definition.rangeText}</dd></div> : null}
            {definition.reachText ? <div><dt>Reach</dt><dd>{definition.reachText}</dd></div> : null}
            {definition.handedness ? <div><dt>Handedness</dt><dd>{definition.handedness}</dd></div> : null}
            {definition.armorDamageModifiers ? <div><dt>Armor damage modifiers</dt><dd>{definition.armorDamageModifiers}</dd></div> : null}
            {definition.equipmentGroup === "armor" ? <><div><dt>Coverage</dt><dd>{definition.coverage || "Not recorded"}</dd></div><div><dt>Base Soak</dt><dd>{definition.baseSoak ?? "Not recorded"}</dd></div></> : null}
            {definition.durability !== null ? <div><dt>Durability</dt><dd>{definition.durability}</dd></div> : null}
          </dl> : null}
          {definition?.weaponRulesText || definition?.armorRulesText ? <p>{definition.weaponRulesText || definition.armorRulesText}</p> : null}
        </details>
      </article>;
    })}
  </section>;
}

function stackQuantity(stack: StackEquipmentState, state: EquipmentState) {
  return state === "inactive" ? stack.inactiveQuantity : state === "equipped" ? stack.equippedQuantity : state === "worn" ? stack.wornQuantity : stack.wieldedQuantity;
}

function StackRoleControl({ name, stack, disabled, onChange }: { name: string; stack: StackEquipmentState; disabled: boolean; onChange: (state: EquipmentState, quantity: number) => void }) {
  const initialState = EQUIPMENT_STATES.find(state => state !== "inactive" && stackQuantity(stack, state) > 0) ?? "inactive";
  const [state, setState] = useState<EquipmentState>(initialState);
  const [quantity, setQuantity] = useState(initialState === "inactive" ? 1 : stackQuantity(stack, initialState));
  return <form className="character-owned-equipment__stack" onSubmit={event => { event.preventDefault(); onChange(state, state === "inactive" ? 0 : quantity); }}>
    <label className="st-field"><span>State</span><select className="st-control" aria-label={`Equipment state for ${name}`} disabled={disabled} value={state} onChange={event => setState(event.target.value as EquipmentState)}>{EQUIPMENT_STATES.map(state => <option key={state} value={state}>{state[0].toUpperCase() + state.slice(1)}</option>)}</select></label>
    {state !== "inactive" ? <label className="st-field"><span>Active quantity</span><input className="st-control" aria-label={`Active quantity for ${name}`} type="number" required min={0} max={stack.ownedQuantity} step={1} disabled={disabled} value={quantity} onChange={event => setQuantity(Number(event.target.value))} /></label> : null}
    <button className="st-button" type="submit" disabled={disabled} aria-label={`Apply equipment state for ${name}`}>Apply</button>
    <small>{state === "inactive" ? "All copies become inactive." : `${quantity} of ${stack.ownedQuantity} become ${state}; the rest become inactive.`}</small>
  </form>;
}
