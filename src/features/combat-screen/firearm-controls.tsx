"use client";
import { useRef, useState } from "react";
import { initializeFirearmState, startFirearmPreparation } from "@/app/heavens/tabletop/firearm-readiness-actions";
import { startPlayerFirearmPreparation } from "@/app/realms/tabletop/player-combat-actions";
import { FIREARM_PREPARATION_OPERATIONS, type FirearmPreparationOperation } from "@/features/tabletop-operations/firearm-readiness";
import type { FirearmInstanceView } from "@/features/tabletop-operations/firearm-readiness-service";
import type { CombatEntity, CombatScreenScope } from "./screen-types";
import { combatMessage } from "./form-controls";
import styles from "./combat-screen.module.css";
export function FirearmControls({ scope, entity, firearm, disabled, refresh }: { scope: CombatScreenScope; entity: CombatEntity; firearm: FirearmInstanceView; disabled: boolean; refresh: () => Promise<void> }) {
  const [operation, setOperation] = useState<FirearmPreparationOperation>("load"), [rounds, setRounds] = useState(""), [mode, setMode] = useState("");
  const [cost, setCost] = useState(""), [reason, setReason] = useState(""), [capacity, setCapacity] = useState(""), [relationship, setRelationship] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const request = useRef<{ fingerprint: string; key: string } | null>(null), running = useRef(false);
  async function run(value: unknown, action: (key: string) => Promise<unknown>) {
    if (running.current) return; running.current = true; setBusy(true);
    const fingerprint = JSON.stringify(value); if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, key: crypto.randomUUID() };
    try { await action(request.current.key); setMessage("Firearm command committed."); await refresh(); request.current = null; }
    catch (error) { setMessage(combatMessage(error instanceof Error ? error.message : "The command was not confirmed. Retry preserves this request.")); await refresh(); }
    finally { running.current = false; setBusy(false); }
  }
  const input = { characterId: entity.participantId, itemInstanceId: firearm.itemInstanceId, operation, requestedRounds: rounds === "" ? undefined : Number(rounds),
    targetFiringModeId: Number(mode) || firearm.state?.selectedFiringModeId || firearm.modes[0]?.id || undefined,
    ...(scope.role === "god" ? { godInitiativeCost: cost === "" ? undefined : Number(cost), godReason: reason } : {}) };
  return <details><summary>Ammunition &amp; preparation · {firearm.state?.loadedRounds ?? "?"} loaded</summary><p>{firearm.canonical.ammunitionName ?? "Ammunition requires review"} · {firearm.inventoryAmmunitionQuantity} in inventory</p>
    {firearm.readiness.blockers.map((entry) => <p className={styles.muted} key={entry.code}>{combatMessage(entry.message)}</p>)}
    <div className={styles.fields}><label className="st-field">Preparation<select className="st-control" value={operation} onChange={(event) => setOperation(event.target.value as FirearmPreparationOperation)}>{FIREARM_PREPARATION_OPERATIONS.map((entry) => <option key={entry}>{entry}</option>)}</select></label><label className="st-field">Rounds to load<input className="st-control" type="number" min="1" value={rounds} onChange={(event) => setRounds(event.target.value)} /></label><label className="st-field">Preparation firing mode<select className="st-control" value={input.targetFiringModeId} onChange={(event) => setMode(event.target.value)}>{firearm.modes.map((entry) => <option key={entry.id} value={entry.id ?? ""}>{entry.name}</option>)}</select></label></div>
    {scope.role === "god" ? <details><summary>Missing firearm mechanics ruling</summary><div className={styles.fields}><label className="st-field">Preparation Initiative cost<input className="st-control" type="number" min="0" step="any" value={cost} onChange={(event) => setCost(event.target.value)} /></label><label className="st-field">Ruling reason<input className="st-control" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    {!firearm.state ? <><label className="st-field">Missing capacity (rounds)<input className="st-control" type="number" min="1" value={capacity} onChange={(event) => setCapacity(event.target.value)} /></label><label className="st-field">Missing drawing/readying relationship<select className="st-control" value={relationship} onChange={(event) => setRelationship(event.target.value)}><option value="">Use authored relationship</option><option value="draw-is-ready">Drawing also readies</option><option value="separate-ready-action">Separate ready action</option></select></label></> : null}</div></details> : null}
    {!firearm.state && scope.role === "god" ? <button className="st-button" disabled={disabled || busy || !reason.trim()} onClick={() => void run({ firearm: firearm.itemInstanceId, mode, reason, capacity, relationship }, (idempotencyKey) => initializeFirearmState(scope.encounterId, { characterId: entity.participantId, itemId: firearm.itemId, itemInstanceId: firearm.itemInstanceId,
      selectedFiringModeId: input.targetFiringModeId ?? 0, reason, idempotencyKey, ...(capacity ? { capacityRuling: Number(capacity) } : {}), ...(relationship ? { readinessModeRuling: relationship as "draw-is-ready" | "separate-ready-action" } : {}) }))}>Confirm initial firearm state</button> : null}
    <button className="st-button" disabled={disabled || busy || !entity.canControl || !entity.canActNow || !firearm.state} onClick={() => void run(input, (idempotencyKey) => scope.role === "god" ? startFirearmPreparation(scope.encounterId, { ...input, idempotencyKey }) : startPlayerFirearmPreparation(scope.characterId, scope.encounterId, { ...input, idempotencyKey }))}>Begin preparation</button>
    {firearm.preparation ? <p>{firearm.preparation.operation} · {firearm.preparation.status} · {firearm.preparation.remainingInitiativeCost} Initiative remaining</p> : null}{message ? <p role="status">{message}</p> : null}
  </details>;
}
