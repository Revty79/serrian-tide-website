"use client";
import { decimalMultiply } from "@/lib/decimal";
import { useRef, useState } from "react";
import { initializeFirearmState, startFirearmPreparation } from "@/app/heavens/tabletop/firearm-readiness-actions";
import { startPlayerFirearmPreparation } from "@/app/realms/tabletop/player-combat-actions";
import { FIREARM_PREPARATION_OPERATIONS, resolveFirearmPreparationTiming, planFirearmAmmunitionTransition, type FirearmPreparationOperation } from "@/features/tabletop-operations/firearm-readiness";
import { initiativeAffordabilityIssue } from "@/features/tabletop-operations/initiative-affordability";
import type { FirearmInstanceView } from "@/features/tabletop-operations/firearm-readiness-service";
import type { CombatEntity, CombatScreenScope } from "./screen-types";
import { combatMessage } from "./form-controls";
import styles from "./combat-screen.module.css";
import { firearmGuidance, preparationLabels } from "./firearm-guidance";
import { applyCombatFirearmCatalog } from "./command-actions";
import { MagazineFillControls } from "./magazine-fill-controls";
import type { MagazineInventoryView } from "@/features/items/magazine-inventory-service";
export function FirearmControls({ scope, entity, firearm, selectedModeId, inventory, disabled, refresh }: { scope: CombatScreenScope; entity: CombatEntity; firearm: FirearmInstanceView; selectedModeId: number; inventory: MagazineInventoryView | null; disabled: boolean; refresh: () => Promise<void> }) {
  const guidance = firearmGuidance(firearm, selectedModeId);
  const [chosenOperation, setOperation] = useState<FirearmPreparationOperation | null>(null), [rounds, setRounds] = useState(""), [mode, setMode] = useState("");
  const [cost, setCost] = useState(""), [reason, setReason] = useState(""), [capacity, setCapacity] = useState(""), [relationship, setRelationship] = useState("");
  const [magazine, setMagazine] = useState("");
  const operation = chosenOperation ?? guidance.operation;
  const loadOperation = ["load", "reload"].includes(operation);
  const usableMagazines = firearm.magazines.filter((entry) => !entry.attachedWeaponInstanceId && entry.loadedRounds > 0 && entry.ammunitionItemId === firearm.canonical.ammunitionItemId);
  const selectedMagazine = magazine || (usableMagazines.length === 1 ? String(usableMagazines[0].instanceId) : "");
  const magazineInventory = inventory ? { ...inventory, magazines: inventory.magazines.filter((entry) => firearm.magazines.some((compatible) => compatible.instanceId === entry.instanceId)) } : null;
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const request = useRef<{ fingerprint: string; key: string } | null>(null), running = useRef(false);
  async function run(value: unknown, action: (key: string) => Promise<unknown>) {
    if (running.current) return; running.current = true; setBusy(true);
    const fingerprint = JSON.stringify(value); if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, key: crypto.randomUUID().replaceAll("-", "") };
    try { await action(request.current.key); setMessage("Saved. The weapon status below shows what happens next."); setOperation(null); await refresh(); request.current = null; }
    catch (error) { setMessage(combatMessage(error instanceof Error ? error.message : "The command was not confirmed. Retry preserves this request.")); await refresh(); }
    finally { running.current = false; setBusy(false); }
  }
  const input = { combineFollowUp: operation === "recover-recoil", characterId: entity.participantId, itemInstanceId: firearm.itemInstanceId, operation, requestedRounds: rounds === "" ? undefined : Number(rounds),
    magazineInstanceId: Number(selectedMagazine) || undefined,
    partialLoadDisposition: operation === "unload" ? "retain" as const : undefined,
    targetFiringModeId: Number(mode) || selectedModeId || firearm.state?.selectedFiringModeId || firearm.modes[0]?.id || undefined,
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
      else if (operation === "ready" && state.readinessMode !== "separate-ready-action") preparationIssue = state.readinessMode === null ? "Set the drawing/readying relationship in the item profile, then apply its settings to this copy." : "Drawing also readies this firearm. Choose Draw weapon to complete that step.";
      else if (operation === "cycle" && !state.requiresCycling) preparationIssue = "No cycling step is currently required. Choose the preparation this firearm still needs.";
      else if (operation === "recover-recoil" && !state.requiresRecoilRecovery && !state.requiresCycling) preparationIssue = "No cycling or recoil recovery is currently required.";
      else if (operation === "change-mode" && input.targetFiringModeId === state.selectedFiringModeId) preparationIssue = "Select a different Preparation firing mode first.";
      const selectedMode = firearm.modes.find((entry) => entry.id === (operation === "change-mode" ? input.targetFiringModeId : state.selectedFiringModeId)) ?? null;
      const timing = resolveFirearmPreparationTiming({ authored: { ...firearm.canonical, selectedMode }, ...input, ...(input.combineFollowUp ? { followUp: { requiresCycling: state.requiresCycling, requiresRecoilRecovery: state.requiresRecoilRecovery } } : {}) });
      if (timing.status === "requires-god-ruling") preparationIssue ||= `${timing.reason} Set that cost in Heavens → Items → Weapon Profile, or ask the G.O.D. for a cost and reason below.`;
      else { preparationCost = decimalMultiply(timing.initiativeCost, ["load", "reload"].includes(operation) && firearm.canonical.reloadType === "Single" ? Number(rounds) : 1); preparationIssue ||= initiativeAffordabilityIssue(preparationCost, entity.currentInitiative) ?? ""; }
      if (magazineOperation && operation !== "unload") {
        const replacement = firearm.magazines.find((entry) => entry.instanceId === input.magazineInstanceId);
        preparationIssue ||= !replacement ? "Choose a magazine below. If none is listed, check owned magazine copies and the weapon profile's compatible magazine models; matching ammunition alone does not establish physical fit."
          : replacement.attachedWeaponInstanceId ? "That copy is already attached. Choose a detached magazine."
            : replacement.loadedRounds > 0 && replacement.ammunitionItemId !== firearm.canonical.ammunitionItemId ? "That magazine fits but contains different ammunition. Select a copy with this weapon's ammunition."
              : !firearm.attachedMagazineInstanceId && state.loadedRounds > 0 ? "Unload the existing internal rounds before attaching a magazine." : "";
      } else if (["load", "reload"].includes(operation) && firearm.canonical.reloadType !== "Single") preparationIssue ||= "Set Reload Type in Heavens → Items → Weapon Profile before loading this firearm.";
      if (!magazineOperation && ["load", "reload", "unload"].includes(operation) && !preparationIssue) planFirearmAmmunitionTransition({ operation: operation as "load" | "reload" | "unload",
        loadedRounds: state.loadedRounds, inventoryRounds: firearm.inventoryAmmunitionQuantity, capacityRounds: state.capacityRounds, requestedRounds: input.requestedRounds,
        disposition: input.partialLoadDisposition, loadedAmmunitionItemId: state.loadedAmmunitionItemId, requestedAmmunitionItemId: operation === "unload" ? null : firearm.canonical.ammunitionItemId, canonicalAmmunitionItemId: firearm.canonical.ammunitionItemId });
    }
  } catch (error) { preparationIssue ||= combatMessage(error instanceof Error ? error.message : "Review the preparation values."); }
  const titleId = `firearm-status-${firearm.itemInstanceId}`;
  const actionLabel = loadOperation && firearm.canonical.reloadType === "Magazine" ? "Load magazine" : preparationLabels[operation];
  return <section className={styles.notice} aria-labelledby={titleId}>
    <div className={styles.header}><h3 id={titleId}>{guidance.next}</h3><button className="st-button" disabled={busy} onClick={() => void refresh().then(() => setMessage("Weapon settings refreshed.")).catch((error) => setMessage(combatMessage(error.message)))}>Refresh weapon</button></div>
    <dl className={styles.attackFacts}>
      <div><dt>Loaded</dt><dd>{state ? `${state.loadedRounds} / ${state.capacityRounds ?? "?"}` : "Unconfirmed"}</dd></div>
      <div><dt>Weapon</dt><dd>{firearm.equipmentState !== "wielded" ? "Stowed" : state?.readied ? "Readied" : "Not readied"}</dd></div>
      <div><dt>Your Initiative</dt><dd>{entity.currentInitiative}</dd></div>
    </dl>
    <p>{firearm.canonical.ammunitionName ?? "Ammunition needs configuration"} &middot; {firearm.inventoryAmmunitionQuantity} loose rounds</p>
    {guidance.setup.length ? <div role="status"><strong>Weapon setup needs attention</strong><ul>{guidance.setup.map((entry) => <li key={entry}>{entry}</li>)}</ul>
      {scope.role === "god" ? <a href={`/heavens/equipment?item=${firearm.itemId}&tab=weapon#firearm-firing-modes`} target="_blank" rel="noreferrer">Open this weapon&apos;s item settings in a new tab</a> : <p>The G.O.D. authors item settings. After they save, use Refresh weapon here.</p>}
    </div> : null}
    {guidance.catalogUpdate && state ? <div><p>Apply the configured item values: {firearm.canonical.capacityRounds !== null ? `capacity ${firearm.canonical.capacityRounds}; ` : ""}{firearm.canonical.readinessMode === "draw-is-ready" ? "drawing also readies" : firearm.canonical.readinessMode === "separate-ready-action" ? "a separate ready action" : "readiness remains unresolved"}. Ammunition and completed preparation stay as they are. Any previous capacity/readiness ruling on this copy is replaced.</p>
      <button className="st-button" disabled={busy || disabled || !!firearm.preparation} onClick={() => void run({ itemInstanceId: firearm.itemInstanceId, version: state.version }, () => applyCombatFirearmCatalog(scope, { characterId: entity.participantId, itemInstanceId: firearm.itemInstanceId, expectedVersion: state.version }))}>Apply updated item settings</button></div> : null}
    {firearm.preparation ? <p role="status">{preparationLabels[firearm.preparation.operation as FirearmPreparationOperation]}: {firearm.preparation.status}, {firearm.preparation.remainingInitiativeCost ?? "?"} Initiative remaining. {firearm.preparation.status === "pending" ? "Follow the shared combat prompt while this finishes." : "The G.O.D. must resolve or cancel this interrupted preparation."}</p> : null}
    {state?.readied && state.loadedRounds > 0 && !guidance.needsPreparation && !guidance.canFire ? <p>Your loaded magazine and readiness are saved. No reload or ready action is needed; finish the item settings listed above.</p> : null}
    {guidance.canFire ? <p>Choose your target and aim below, then use <strong>Fire &amp; Roll</strong>. After firing, any required cycling, recoil recovery or reload appears here.</p> : !guidance.setup.length && !firearm.preparation ? <p>Next: {guidance.next.toLowerCase()}. Choose the preparation below; its cost is shown before you commit.</p> : null}
    {firearm.canonical.reloadType === "Magazine" ? <p>{firearm.attachedMagazineInstanceId ? `Magazine copy #${firearm.attachedMagazineInstanceId} is attached. Removing it keeps its remaining rounds in that copy.` : "No magazine attached. Loose cartridges must go into a compatible magazine before you can use them in this weapon."}</p> : null}
    {guidance.needsPreparation || guidance.canFire ? <div className={styles.actions} aria-label="Weapon preparation choices">{(["draw", "ready", "reload", "recover-recoil"] as const).filter((entry) => entry === "reload" || entry === "draw" && (firearm.equipmentState !== "wielded" || !state?.readied && state?.readinessMode === "draw-is-ready") || entry === "ready" && !state?.readied && state?.readinessMode === "separate-ready-action" || entry === "recover-recoil" && (state?.requiresCycling || state?.requiresRecoilRecovery)).map((entry) => <button key={entry} className="st-button" aria-pressed={operation === entry} onClick={() => setOperation(entry)}>{entry === "reload" && firearm.canonical.reloadType === "Magazine" ? "Load / swap magazine" : preparationLabels[entry]}</button>)}</div> : null}
    <details><summary>Other weapon handling</summary><label className="st-field">Preparation<select className="st-control" value={operation} onChange={(event) => setOperation(event.target.value as FirearmPreparationOperation)}>{FIREARM_PREPARATION_OPERATIONS.filter((entry) => entry !== "cycle").map((entry) => <option key={entry} value={entry}>{preparationLabels[entry]}</option>)}</select></label></details>
    {guidance.needsPreparation || chosenOperation ? <>
      <h4>{actionLabel}</h4>
      {input.combineFollowUp ? <p>Cycling and recoil recovery are one preparation. {(() => { const timing = firearm.modes.find((entry) => entry.id === state?.selectedFiringModeId)?.timing; return timing ? `${state?.requiresCycling ? timing.effectiveCyclingInitiativeCost : 0} cycling + ${state?.requiresRecoilRecovery ? timing.effectiveRecoilResetInitiativeCost : 0} recoil recovery = ${preparationCost} Initiative. Both remaining requirements finish together.` : "The combined cost needs an authored value or a specific ruling."; })()}</p> : null}
      {magazineOperation && loadOperation ? <label className="st-field">Replacement magazine<select className="st-control" value={selectedMagazine} onChange={(event) => setMagazine(event.target.value)}><option value="">Choose a detached compatible copy</option>{firearm.magazines.map((entry) => <option key={entry.instanceId} value={entry.instanceId} disabled={!!entry.attachedWeaponInstanceId || entry.loadedRounds > 0 && entry.ammunitionItemId !== firearm.canonical.ammunitionItemId}>{entry.name} - Copy #{entry.instanceId} - {entry.loadedRounds}/{entry.capacity}{entry.attachedWeaponInstanceId ? " - attached" : entry.loadedRounds === 0 ? " - empty: fill before firing" : entry.ammunitionItemId !== firearm.canonical.ammunitionItemId ? " - different ammunition" : ""}</option>)}</select></label> : null}
      {loadOperation && firearm.canonical.reloadType === "Single" ? <label className="st-field">Rounds to load<input className="st-control" type="number" min="1" step="1" value={rounds} onChange={(event) => setRounds(event.target.value)} /></label> : null}
      {operation === "change-mode" ? <label className="st-field">Preparation firing mode<select className="st-control" value={input.targetFiringModeId} onChange={(event) => setMode(event.target.value)}>{firearm.modes.map((entry) => <option key={entry.id} value={entry.id ?? ""}>{entry.name}</option>)}</select></label> : null}
      <p id={guidanceId} role="status">{preparationIssue || `${actionLabel} costs ${preparationCost} Initiative. You have ${entity.currentInitiative}.`}</p>
      <button className="st-button is-primary" aria-describedby={guidanceId} disabled={busy || !!preparationIssue} onClick={() => void run(input, (idempotencyKey) => scope.role === "god" ? startFirearmPreparation(scope.encounterId, { ...input, idempotencyKey }) : startPlayerFirearmPreparation(scope.characterId, scope.encounterId, { ...input, idempotencyKey }))}>{actionLabel}{preparationCost === null ? "" : ` (${preparationCost} Initiative)`}</button>
    </> : null}
    {firearm.canonical.reloadType === "Magazine" && !usableMagazines.length ? <p>{firearm.magazines.length ? "No loaded, detached magazine is available. Fill a compatible copy here, or unload the attached magazine first." : "No owned magazine is linked to fit this weapon. Check the weapon's compatible magazine models and your owned magazine copies. Matching ammunition does not establish physical fit."}</p> : null}
    {magazineInventory?.magazines.length ? <MagazineFillControls scope={scope} entity={entity} inventory={magazineInventory} disabled={disabled} refresh={refresh} /> : null}
    {scope.role === "god" ? <details open={!state}><summary>Missing firearm mechanics ruling</summary><div className={styles.fields}><label className="st-field">Preparation Initiative cost<input className="st-control" type="number" min="0" step="any" value={cost} onChange={(event) => setCost(event.target.value)} /></label><label className="st-field">Ruling reason<input className="st-control" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      {!state ? <><label className="st-field">Missing capacity (rounds)<input className="st-control" type="number" min="1" value={capacity} onChange={(event) => setCapacity(event.target.value)} /></label><label className="st-field">Missing drawing/readying relationship<select className="st-control" value={relationship} onChange={(event) => setRelationship(event.target.value)}><option value="">Use authored relationship</option><option value="draw-is-ready">Drawing also readies</option><option value="separate-ready-action">Separate ready action</option></select></label></> : null}</div>
      {!state ? <><p>This confirms the copy as empty and not readied.</p><button className="st-button" disabled={disabled || busy || !reason.trim()} onClick={() => void run({ firearm: firearm.itemInstanceId, selectedModeId, reason, capacity, relationship }, (idempotencyKey) => initializeFirearmState(scope.encounterId, { characterId: entity.participantId, itemId: firearm.itemId, itemInstanceId: firearm.itemInstanceId, selectedFiringModeId: input.targetFiringModeId ?? 0, reason, idempotencyKey, ...(capacity ? { capacityRuling: Number(capacity) } : {}), ...(relationship ? { readinessModeRuling: relationship as "draw-is-ready" | "separate-ready-action" } : {}) }))}>Confirm initial firearm state</button></> : null}
    </details> : null}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
