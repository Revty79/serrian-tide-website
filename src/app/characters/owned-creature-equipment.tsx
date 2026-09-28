"use client";
import { useEffect, useRef, useState } from "react";
import { GuidedField } from "@/components/field-guidance";
import type { CompanionEquipmentCommand } from "@/features/creatures/owned-creature-equipment-service";
import type { EquipmentState } from "@/features/items/equipment-state";
import { changeCompanionEquipment, readCompanionEquipment } from "./owned-creature-equipment-actions";
type View = Awaited<ReturnType<typeof readCompanionEquipment>>;
type Row = View["ownerEquipment"][number];
function rowKey(row: Row) { return row.instanceId === null ? `stack:${row.itemId}` : `copy:${row.instanceId}`; }

export function OwnedCreatureEquipment({ ownerCharacterId, creatureCharacterId, onChanged, disabled: blocked = false }: { ownerCharacterId: number; creatureCharacterId: number; disabled?: boolean; onChanged?: () => void | Promise<void> }) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const attempt = useRef<CompanionEquipmentCommand | null>(null);
  const [selected, setSelected] = useState("");
  const [state, setState] = useState<EquipmentState>("worn");
  const [quantity, setQuantity] = useState(1);
  useEffect(() => {
    let active = true;
    void readCompanionEquipment(ownerCharacterId, creatureCharacterId).then(result => { if (active) setView(result); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Could not load equipment."); });
    return () => { active = false; };
  }, [ownerCharacterId, creatureCharacterId]);
  async function refresh() { setView(await readCompanionEquipment(ownerCharacterId, creatureCharacterId)); }
  async function run(command: CompanionEquipmentCommand) {
    attempt.current = command; setBusy(true); setError("");
    try { await changeCompanionEquipment(command); attempt.current = null; setPending(false); await refresh(); await onChanged?.(); }
    catch (reason) { setPending(true); setError(reason instanceof Error ? reason.message : "Equipment could not be updated."); }
    finally { setBusy(false); }
  }
  function apply(row: Row, operation: CompanionEquipmentCommand["operation"], target: EquipmentState, count = 1) {
    if (!view) return;
    void run({ ownerCharacterId, creatureCharacterId, itemId: row.itemId, instanceId: row.instanceId, quantity: count, state: target, operation,
      expectedStates: { inactive: row.inactive, equipped: row.equipped, worn: row.worn, wielded: row.wielded },
      ownerVersion: view.ownerVersion, creatureVersion: view.creatureVersion, requestKey: Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, "0")).join("") });
  }
  const choices = view?.ownerEquipment.filter(row => row.eligible && row.transferable > 0) ?? [];
  const chosen = choices.find(row => rowKey(row) === selected);
  const disabled = blocked || busy || pending || !view?.canChange;
  return <section aria-label="Companion personal equipment">
    <h4>Personal equipment</h4><p>Gear moved here is held by this Creature and leaves your carried weight. These controls handle personal equipment outside combat.</p>
    {blocked ? <p>Save pending Character changes and use an active Character to manage companion equipment.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {pending ? <div><p>Retry the original action to confirm its result, or refresh the inventories before choosing another action.</p><button type="button" className="st-button is-secondary" disabled={busy} onClick={() => { if (attempt.current) void run(attempt.current); }}>Retry equipment action</button><button type="button" className="st-button is-secondary" disabled={busy} onClick={() => { void refresh().then(() => { attempt.current = null; setPending(false); setError(""); }).catch(reason => setError(String(reason))); }}>Refresh equipment</button></div> : null}
    {!view ? <p>Loading equipment…</p> : <>
      {view.creatureEquipment.length ? <ul>{view.creatureEquipment.map(row => <li key={rowKey(row)}><strong>{row.name}{row.instanceId ? ` · Copy #${row.instanceId}` : ` · ${row.quantity} owned`}</strong><p>{row.inactive} inactive · {row.equipped} equipped · {row.worn} worn · {row.wielded} wielded</p>
        {row.eligible ? <div><button className="st-button is-secondary" type="button" disabled={disabled} onClick={() => apply(row, "set-state", "worn", row.quantity)}>Wear</button><button className="st-button is-secondary" type="button" disabled={disabled} onClick={() => apply(row, "set-state", "wielded", row.quantity)}>Wield</button><button className="st-button is-secondary" type="button" disabled={disabled} onClick={() => apply(row, "set-state", "inactive", row.quantity)}>Unequip</button><button className="st-button is-secondary" type="button" disabled={disabled} onClick={() => apply(row, "to-character", "inactive", row.quantity)}>Unequip and return to Character</button></div> : <p>Manage this Item through the existing NPC inventory controls.</p>}
      </li>)}</ul> : <p>This Creature holds no personal equipment.</p>}
      <GuidedField className="st-field" label="Move personal equipment to Creature" help="Select your inactive, Loose Equipment. Retrieve contained gear and unequip worn gear on your Character first. Choose gear intended for this Creature; existing equipment restrictions still apply."><select className="st-control" value={selected} disabled={disabled} onChange={event => { setSelected(event.target.value); setQuantity(1); }}><option value="">Choose owned gear</option>{choices.map(row => <option key={rowKey(row)} value={rowKey(row)}>{row.name}{row.instanceId ? ` · Copy #${row.instanceId}` : ` · ${row.transferable} available`}</option>)}</select></GuidedField>
      <GuidedField className="st-field" label="Creature equipment state" help="Worn applies existing worn equipment rules; Wielded readies a weapon; Equipped marks available gear. Inactive moves it without activating equipment effects."><select className="st-control" value={state} disabled={disabled} onChange={event => setState(event.target.value as EquipmentState)}><option value="worn">Worn</option><option value="wielded">Wielded</option><option value="equipped">Equipped</option><option value="inactive">Inactive</option></select></GuidedField>
      {chosen?.instanceId === null ? <GuidedField className="st-field" label="Equipment quantity" help="Moves this many units from your inactive, Loose equipment stack."><input className="st-control" type="number" min={1} max={chosen.transferable} step={1} value={quantity} disabled={disabled} onChange={event => setQuantity(Number(event.target.value))} /></GuidedField> : null}
      <button type="button" className="st-button is-primary" disabled={disabled || !chosen || !Number.isInteger(quantity) || quantity < 1 || quantity > (chosen?.transferable ?? 0)} onClick={() => { if (chosen) apply(chosen, "to-creature", state, chosen.instanceId ? 1 : quantity); }}>Move gear to Creature</button>
    </>}
  </section>;
}
