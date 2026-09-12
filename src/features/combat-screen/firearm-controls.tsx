"use client";
import { useRef, useState } from "react";
import { initializeFirearmState, startFirearmPreparation } from "@/app/heavens/tabletop/firearm-readiness-actions";
import { startPlayerFirearmPreparation } from "@/app/realms/tabletop/player-combat-actions";
import { FIREARM_PREPARATION_OPERATIONS, resolveFirearmPreparationTiming, planFirearmAmmunitionTransition, type FirearmPreparationOperation } from "@/features/tabletop-operations/firearm-readiness";
import { initiativeAffordabilityIssue } from "@/features/tabletop-operations/initiative-affordability";
import type { FirearmInstanceView } from "@/features/tabletop-operations/firearm-readiness-service";
import type { CombatEntity, CombatScreenScope } from "./screen-types";
import { combatMessage } from "./form-controls";
import styles from "./combat-screen.module.css";
export function FirearmControls({ scope, entity, firearm, disabled, refresh }: { scope: CombatScreenScope; entity: CombatEntity; firearm: FirearmInstanceView; disabled: boolean; refresh: () => Promise<void> }) {
  const [operation, setOperation] = useState<FirearmPreparationOperation>("load"), [rounds, setRounds] = useState(""), [mode, setMode] = useState("");
  const [cost, setCost] = useState(""), [reason, setReason] = useState(""), [capacity, setCapacity] = useState(""), [relationship, setRelationship] = useState("");
  const [magazine, setMagazine] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const request = useRef<{ fingerprint: string; key: string } | null>(null), running = useRef(false);
  async function run(value: unknown, action: (key: string) => Promise<unknown>) {
    if (running.current) return; running.current = true; setBusy(true);
    const fingerprint = JSON.stringify(value); if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, key: crypto.randomUUID().replaceAll("-", "") };
    try { await action(request.current.key); setMessage("Firearm command committed."); await refresh(); request.current = null; }
    catch (error) { setMessage(combatMessage(error instanceof Error ? error.message : "The command was not confirmed. Retry preserves this request.")); await refresh(); }
    finally { running.current = false; setBusy(false); }
  }
  const input = { characterId: entity.participantId, itemInstanceId: firearm.itemInstanceId, operation, requestedRounds: rounds === "" ? undefined : Number(rounds),
    magazineInstanceId: Number(magazine) || undefined,
    partialLoadDisposition: operation === "unload" ? "retain" as const : undefined,
    targetFiringModeId: Number(mode) || firearm.state?.selectedFiringModeId || firearm.modes[0]?.id || undefined,
    ...(scope.role === "god" ? { godInitiativeCost: cost === "" ? undefined : Number(cost), godReason: reason } : {}) };
  const state = firearm.state;
  const magazineOperation = firearm.canonical.reloadType === "Magazine" && ["load", "reload", "unload"].includes(operation)
    && (operation !== "unload" || firearm.attachedMagazineInstanceId !== null);
  const guidanceId = `firearm-preparation-${firearm.itemInstanceId}`;
  let preparationIssue = !state ? scope.role === "god" ? "Open Missing firearm mechanics ruling, enter an initialization reason, select a firing mode, then confirm this copy as empty and not readied." : "Ask the G.O.D. to confirm the initial state of this firearm copy."
    : disabled ? "Resolve the combat's current pause or blocking choice before preparation."
      : !entity.canControl ? "This combatant's controller chooses their preparation."
        : !entity.canActNow ? entity.actionReason : firearm.preparation ? `Finish or resolve the ${firearm.preparation.status} ${firearm.preparation.operation} preparation first.` : "";
  let preparationCost: number | null = null;
  try {
    if (state && !preparationIssue) {
      if (operation === "draw" && firearm.equipmentState === "wielded" && (state.readied || state.readinessMode !== "draw-is-ready")) preparationIssue = "This copy is already drawn. Choose ready if it still needs readying.";
      else if (operation === "ready" && firearm.equipmentState !== "wielded") preparationIssue = "Choose draw and complete it before readying this firearm.";
      else if (operation === "ready" && state.readinessMode !== "separate-ready-action") preparationIssue = "This firearm is readied as part of drawing. Choose draw if it is not wielded.";
      else if (operation === "cycle" && !state.requiresCycling) preparationIssue = "No cycling step is currently required. Choose the preparation this firearm still needs.";
      else if (operation === "recover-recoil" && !state.requiresRecoilRecovery) preparationIssue = "No recoil recovery is currently required.";
      else if (operation === "change-mode" && input.targetFiringModeId === state.selectedFiringModeId) preparationIssue = "Select a different Preparation firing mode first.";
      const selectedMode = firearm.modes.find((entry) => entry.id === (operation === "change-mode" ? input.targetFiringModeId : state.selectedFiringModeId)) ?? null;
      const timing = resolveFirearmPreparationTiming({ authored: { ...firearm.canonical, selectedMode }, ...input });
      if (timing.status === "requires-god-ruling") preparationIssue ||= `${timing.reason} Set that cost in Heavens → Items → Weapon Profile, or ask the G.O.D. for a cost and reason below.`;
      else { preparationCost = timing.initiativeCost * (["load", "reload"].includes(operation) && firearm.canonical.reloadType === "Single" ? Number(rounds) : 1); preparationIssue ||= initiativeAffordabilityIssue(preparationCost, entity.currentInitiative) ?? ""; }
      if (magazineOperation && operation !== "unload") {
        const replacement = firearm.magazines.find((entry) => entry.instanceId === input.magazineInstanceId);
        preparationIssue ||= !replacement ? "Choose a compatible owned magazine. Acquire a magazine copy in Character equipment if none is listed."
          : replacement.attachedWeaponInstanceId ? "That copy is already attached. Choose a detached magazine."
            : replacement.loadedRounds > 0 && replacement.ammunitionItemId !== firearm.canonical.ammunitionItemId ? "That magazine fits but contains different ammunition. Select a copy with this weapon's ammunition."
              : !firearm.attachedMagazineInstanceId && state.loadedRounds > 0 ? "Unload the existing internal rounds before attaching a magazine." : "";
      } else if (["load", "reload"].includes(operation) && firearm.canonical.reloadType !== "Single") preparationIssue ||= "Set Reload Type in Heavens → Items → Weapon Profile before loading this firearm.";
      if (!magazineOperation && ["load", "reload", "unload"].includes(operation) && !preparationIssue) planFirearmAmmunitionTransition({ operation: operation as "load" | "reload" | "unload",
        loadedRounds: state.loadedRounds, inventoryRounds: firearm.inventoryAmmunitionQuantity, capacityRounds: state.capacityRounds, requestedRounds: input.requestedRounds,
        disposition: input.partialLoadDisposition, loadedAmmunitionItemId: state.loadedAmmunitionItemId, requestedAmmunitionItemId: operation === "unload" ? null : firearm.canonical.ammunitionItemId, canonicalAmmunitionItemId: firearm.canonical.ammunitionItemId });
    }
  } catch (error) { preparationIssue ||= combatMessage(error instanceof Error ? error.message : "Review the preparation values."); }
  return <details><summary>Ammunition &amp; preparation · {firearm.state?.loadedRounds ?? "?"} loaded</summary><p>{firearm.canonical.ammunitionName ?? "Ammunition requires review"} · {firearm.inventoryAmmunitionQuantity} in inventory</p>
    {firearm.canonical.reloadType === "Magazine" ? <><p>{firearm.attachedMagazineInstanceId ? `Attached magazine copy #${firearm.attachedMagazineInstanceId}. Its remaining rounds stay in that copy when removed.` : "No magazine attached. The selected replacement becomes usable when the swap completes."}</p><label className="st-field">Replacement magazine<select className="st-control" value={magazine} onChange={(event) => setMagazine(event.target.value)}><option value="">Choose a detached compatible copy</option>{firearm.magazines.map((entry) => <option key={entry.instanceId} value={entry.instanceId} disabled={!!entry.attachedWeaponInstanceId}>{entry.name} · Copy #{entry.instanceId} · {entry.loadedRounds}/{entry.capacity}{entry.attachedWeaponInstanceId ? " · attached" : ""}</option>)}</select></label></> : null}
    {firearm.readiness.blockers.map((entry) => <p className={styles.muted} key={entry.code}>{combatMessage(entry.message)}</p>)}
    <div className={styles.fields}><label className="st-field">Preparation<select className="st-control" value={operation} onChange={(event) => setOperation(event.target.value as FirearmPreparationOperation)}>{FIREARM_PREPARATION_OPERATIONS.map((entry) => <option key={entry}>{entry}</option>)}</select></label><label className="st-field">Rounds to load<input className="st-control" type="number" min="1" value={rounds} onChange={(event) => setRounds(event.target.value)} /></label><label className="st-field">Preparation firing mode<select className="st-control" value={input.targetFiringModeId} onChange={(event) => setMode(event.target.value)}>{firearm.modes.map((entry) => <option key={entry.id} value={entry.id ?? ""}>{entry.name}</option>)}</select></label></div>
    {scope.role === "god" ? <details><summary>Missing firearm mechanics ruling</summary><div className={styles.fields}><label className="st-field">Preparation Initiative cost<input className="st-control" type="number" min="0" step="any" value={cost} onChange={(event) => setCost(event.target.value)} /></label><label className="st-field">Ruling reason<input className="st-control" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    {!firearm.state ? <><label className="st-field">Missing capacity (rounds)<input className="st-control" type="number" min="1" value={capacity} onChange={(event) => setCapacity(event.target.value)} /></label><label className="st-field">Missing drawing/readying relationship<select className="st-control" value={relationship} onChange={(event) => setRelationship(event.target.value)}><option value="">Use authored relationship</option><option value="draw-is-ready">Drawing also readies</option><option value="separate-ready-action">Separate ready action</option></select></label></> : null}</div></details> : null}
    {!firearm.state && scope.role === "god" ? <button className="st-button" disabled={disabled || busy || !reason.trim()} onClick={() => void run({ firearm: firearm.itemInstanceId, mode, reason, capacity, relationship }, (idempotencyKey) => initializeFirearmState(scope.encounterId, { characterId: entity.participantId, itemId: firearm.itemId, itemInstanceId: firearm.itemInstanceId,
      selectedFiringModeId: input.targetFiringModeId ?? 0, reason, idempotencyKey, ...(capacity ? { capacityRuling: Number(capacity) } : {}), ...(relationship ? { readinessModeRuling: relationship as "draw-is-ready" | "separate-ready-action" } : {}) }))}>Confirm initial firearm state</button> : null}
    <p id={guidanceId} role="status">{preparationIssue || `This preparation costs ${preparationCost} Initiative. You have ${entity.currentInitiative}.`}</p>
    <button className="st-button" aria-describedby={guidanceId} disabled={busy || !!preparationIssue} onClick={() => void run(input, (idempotencyKey) => scope.role === "god" ? startFirearmPreparation(scope.encounterId, { ...input, idempotencyKey }) : startPlayerFirearmPreparation(scope.characterId, scope.encounterId, { ...input, idempotencyKey }))}>Begin preparation</button>
    {firearm.preparation ? <p>{firearm.preparation.operation} · {firearm.preparation.status} · {firearm.preparation.remainingInitiativeCost} Initiative remaining</p> : null}{message ? <p role="status">{message}</p> : null}
  </details>;
}
