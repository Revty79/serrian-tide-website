"use client";
import { decimalMultiply } from "@/lib/decimal";
import { useRef, useState } from "react";
import type { MagazineInventoryView } from "@/features/items/magazine-inventory-service";
import type { CombatEntity, CombatScreenScope } from "./screen-types";
import { fillCombatMagazine } from "./command-actions";
import { initiativeAffordabilityIssue } from "@/features/tabletop-operations/initiative-affordability";

export function MagazineFillControls({ scope, entity, inventory, disabled, refresh }: { scope: CombatScreenScope; entity: CombatEntity; inventory: MagazineInventoryView;
  disabled: boolean; refresh: () => Promise<void> }) {
  const [selectedId, setSelectedId] = useState(""), [ammoId, setAmmoId] = useState(""), [rounds, setRounds] = useState("1");
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const running = useRef(false), request = useRef<{ fingerprint: string; key: string } | null>(null);
  const selected = inventory.magazines.find((entry) => entry.instanceId === Number(selectedId));
  const ammunitionItemId = selected?.ammunitionItemId ?? (Number(ammoId) || selected?.ammunition[0]?.id);
  const ammo = selected?.ammunition.find((entry) => entry.id === ammunitionItemId), count = Number(rounds);
  const cost = selected?.fillInitiativeCostPerRound === null || !selected || !Number.isSafeInteger(count) ? null : decimalMultiply(selected.fillInitiativeCostPerRound, count);
  const issue = disabled ? "Resolve the current combat pause or blocking choice first." : !entity.canControl || !entity.canActNow ? entity.actionReason
    : !selected ? "Choose an owned, detached magazine copy." : selected.attachedWeaponInstanceId ? "Remove this magazine from its firearm before filling it."
      : selected.archived ? "Restore this magazine model in Items before filling it." : cost === null ? "Set Fill Initiative per Round in Heavens → Items → Magazine."
        : !Number.isSafeInteger(count) || count <= 0 ? "Enter a positive whole number of rounds." : !ammo || ammo.archived || ammo.quantity < count ? "Choose compatible ammunition and no more rounds than are available."
          : selected.loadedRounds + count > selected.capacity ? "Add fewer rounds to fit this magazine's capacity." : initiativeAffordabilityIssue(cost, entity.currentInitiative);
  async function run() {
    if (running.current || issue || !selected || !ammunitionItemId) return;
    running.current = true; setBusy(true);
    const command = { characterId: entity.participantId, instanceId: selected.instanceId, ammunitionItemId, rounds: count }, fingerprint = JSON.stringify(command);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, key: crypto.randomUUID() };
    try { await fillCombatMagazine(scope, { ...command, requestKey: request.current.key }); request.current = null; setMessage("Magazine filling started. Each completed insertion stays loaded if the action is interrupted."); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Filling was not confirmed. Retry preserves the request."); await refresh(); }
    finally { running.current = false; setBusy(false); }
  }
  return <details><summary>Fill magazine</summary><p>Fill a detached copy using its authored cost per round. Swapping it into a weapon is a separate preparation.</p>
    <label className="st-field">Magazine to fill<select className="st-control" value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setAmmoId(""); }}><option value="">Choose a magazine</option>{inventory.magazines.map((entry) => <option key={entry.instanceId} value={entry.instanceId} disabled={!!entry.attachedWeaponInstanceId}>{entry.name} · Copy #{entry.instanceId} · {entry.loadedRounds}/{entry.capacity}{entry.attachedWeaponInstanceId ? " · attached" : ""}</option>)}</select></label>
    {selected ? <label className="st-field">Fill ammunition<select className="st-control" disabled={selected.loadedRounds > 0} value={ammunitionItemId ?? ""} onChange={(event) => setAmmoId(event.target.value)}>{selected.ammunition.map((entry) => <option key={entry.id} value={entry.id} disabled={entry.archived}>{entry.name} · {entry.quantity} loose</option>)}</select></label> : null}
    <label className="st-field">Rounds to insert<input className="st-control" type="number" min={1} step={1} value={rounds} onChange={(event) => setRounds(event.target.value)} /></label>
    <p role="status">{issue || `${count} rounds × ${selected?.fillInitiativeCostPerRound} Initiative = ${cost}. You have ${entity.currentInitiative} Initiative.`}</p>
    <button className="st-button" disabled={busy || !!issue} onClick={() => void run()}>Begin magazine filling</button>{message ? <p role="status">{message}</p> : null}
  </details>;
}
