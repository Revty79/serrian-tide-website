"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useCombatOperationState } from "@/components/tabletop/combat-operation-state";
import type { FirearmInstanceView, FirearmWorkspaceView, StartFirearmPreparationCommand } from "@/features/tabletop-operations/firearm-readiness-service";
import type { FirearmPreparationOperation } from "@/features/tabletop-operations/firearm-readiness";
import { isUncertainSubmissionError } from "@/features/tabletop-operations/submitted-attempt";

import {
  cancelActionDeclaration,
  interruptActionDeclaration,
  resumeInterruptedActionDeclaration,
} from "./action-declaration-actions";
import {
  correctFirearmState,
  initializeFirearmState,
  recordFirearmManualHandling,
  startFirearmPreparation,
} from "./firearm-readiness-actions";

type Feedback = { kind: "success" | "error"; message: string };

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error("Enter a whole number.");
  return parsed;
}

function label(value: string | null): string {
  return value ? value.replaceAll("-", " ") : "review required";
}

function FirearmRuntimeCard({
  firearm,
  characterId,
  encounterId,
}: {
  firearm: FirearmInstanceView;
  characterId: number;
  encounterId: number;
}) {
  const router = useRouter();
  const state = firearm.state;
  const operationKey = `firearm-preparation:${characterId}:${firearm.itemInstanceId}`;
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useCombatOperationState<Feedback | null>(`${operationKey}:feedback`, null);
  const [modeId, setModeId] = useCombatOperationState(`${operationKey}:mode`, String(state?.selectedFiringModeId ?? firearm.modes[0]?.id ?? ""));
  const [rounds, setRounds] = useCombatOperationState(`${operationKey}:rounds`, "");
  const [replace, setReplace] = useCombatOperationState(`${operationKey}:replace`, false);
  const [disposition, setDisposition] = useCombatOperationState<"none" | "retain" | "discard">(`${operationKey}:disposition`, "none");
  const [godCost, setGodCost] = useCombatOperationState(`${operationKey}:god-cost`, "");
  const [reason, setReason] = useCombatOperationState(`${operationKey}:reason`, "");
  const [capacity, setCapacity] = useCombatOperationState(`${operationKey}:capacity`, state?.capacityRounds === null || state?.capacityRounds === undefined ? "" : String(state.capacityRounds));
  const [readinessMode, setReadinessMode] = useCombatOperationState<"" | "draw-is-ready" | "separate-ready-action">(`${operationKey}:readiness-mode`,
    state?.readinessMode === "draw-is-ready" || state?.readinessMode === "separate-ready-action" ? state.readinessMode : "",
  );
  const [correctedReadied, setCorrectedReadied] = useCombatOperationState(`${operationKey}:corrected-readied`, state?.readied ?? false);
  const [correctedCycling, setCorrectedCycling] = useCombatOperationState(`${operationKey}:corrected-cycling`, state?.requiresCycling ?? false);
  const [correctedRecoil, setCorrectedRecoil] = useCombatOperationState(`${operationKey}:corrected-recoil`, state?.requiresRecoilRecovery ?? false);
  const [preparationAttempt, setPreparationAttempt] = useCombatOperationState<StartFirearmPreparationCommand | null>(`${operationKey}:attempt`, null);
  const preparationAttemptRef = useRef(preparationAttempt);
  useEffect(() => {
    preparationAttemptRef.current = preparationAttempt;
  }, [operationKey, preparationAttempt]);
  const selectedMode = firearm.modes.find(({ id }) => id === Number(modeId)) ?? null;

  async function perform(
    work: () => Promise<unknown>,
    success: string,
    onSuccess?: () => void,
    onError?: (error: unknown) => void,
  ): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      await work();
      onSuccess?.();
      setFeedback({ kind: "success", message: success });
      router.refresh();
    } catch (error) {
      onError?.(error);
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The firearm operation failed." });
    } finally {
      setBusy(false);
    }
  }

  async function prepare(operation: FirearmPreparationOperation): Promise<void> {
    let attempt = preparationAttemptRef.current;
    if (!attempt) {
      attempt = {
        characterId,
        itemInstanceId: firearm.itemInstanceId,
        operation,
        requestedRounds: operation === "load" || operation === "reload" ? numberOrNull(rounds) : null,
        replaceCurrentLoad: operation === "reload" && replace,
        partialLoadDisposition: operation === "unload" || (operation === "reload" && replace) ? disposition : "none",
        targetFiringModeId: operation === "change-mode" ? Number(modeId) : null,
        godInitiativeCost: numberOrNull(godCost),
        godReason: reason,
        idempotencyKey: crypto.randomUUID(),
      };
      preparationAttemptRef.current = attempt;
      setPreparationAttempt(attempt);
    }
    await perform(
      () => startFirearmPreparation(encounterId, attempt),
      `${attempt.operation.replaceAll("-", " ")} was recorded through the existing Initiative action workflow.`,
      () => {
        preparationAttemptRef.current = null;
        setPreparationAttempt(null);
      },
      (error) => {
        if (!isUncertainSubmissionError(error)) {
          preparationAttemptRef.current = null;
          setPreparationAttempt(null);
        }
      },
    );
  }

  if (!state) return <article className="firearm-runtime-card">
    <header><div><span>UNINITIALIZED EXACT COPY #{firearm.itemInstanceId}</span><h4>{firearm.itemName}</h4><small>{firearm.canonicalId} · Weapon Profile #{firearm.weaponProfileId}</small></div><Link href="/heavens/equipment">Review canonical Equipment</Link></header>
    <p className="firearm-runtime-boundary">No loaded, empty, drawn, or ready state has been guessed for this copy. Initialization records an explicit empty and not-readied baseline.</p>
    {firearm.modes.length === 0 ? <p className="firearm-runtime-boundary">This firearm has no exact firing mode to select. Review its global canonical Equipment record before initialization.</p> : null}
    <div className="firearm-runtime-form">
      <label className="st-field"><span>Firing mode</span><select className="st-control" value={modeId} onChange={(event) => setModeId(event.target.value)}><option value="">Select mode</option>{firearm.modes.map((mode) => <option key={mode.id} value={mode.id ?? ""}>{mode.name}{mode.mechanicsReviewRequired ? " · review required" : ""}</option>)}</select></label>
      <label className="st-field"><span>Capacity ruling, if needed</span><input className="st-control" type="number" min={1} step={1} value={capacity} placeholder={firearm.canonical.capacityRounds === null ? "Required ruling" : String(firearm.canonical.capacityRounds)} onChange={(event) => setCapacity(event.target.value)} /></label>
      <label className="st-field"><span>Readiness ruling, if needed</span><select className="st-control" value={readinessMode} onChange={(event) => setReadinessMode(event.target.value as typeof readinessMode)}><option value="">Leave unresolved</option><option value="draw-is-ready">Drawing also readies</option><option value="separate-ready-action">Separate ready action</option></select></label>
      <label className="st-field is-wide"><span>Reason</span><input className="st-control" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required for initialization and any G.O.D. ruling" /></label>
    </div>
    <footer><button type="button" className="st-button is-primary" disabled={busy || !modeId || !reason.trim()} onClick={() => void perform(() => initializeFirearmState(encounterId, {
      characterId,
      itemId: firearm.itemId,
      itemInstanceId: firearm.itemInstanceId,
      selectedFiringModeId: Number(modeId),
      capacityRuling: numberOrNull(capacity),
      readinessModeRuling: readinessMode || null,
      reason,
      idempotencyKey: crypto.randomUUID(),
    }), "Exact firearm runtime was initialized empty and not readied.")}>Initialize exact copy</button></footer>
    {feedback ? <p className={`firearm-runtime-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}
  </article>;

  const selectedStateMode = firearm.modes.find(({ id }) => id === state.selectedFiringModeId) ?? null;
  const remaining = state.capacityRounds === null ? null : state.capacityRounds - state.loadedRounds;
  const pending = firearm.preparation;
  return <article className={`firearm-runtime-card is-${firearm.readiness.status}`}>
    <header><div><span>EXACT COPY #{firearm.itemInstanceId} · {firearm.readiness.status.replaceAll("-", " ")}</span><h4>{firearm.itemName}</h4><small>{firearm.canonicalId} · Weapon Profile #{firearm.weaponProfileId}</small></div><Link href="/heavens/equipment">Review canonical Equipment</Link></header>
    <div className="firearm-runtime-columns">
      <section><h5>Canonical authored</h5><dl><div><dt>Ammunition</dt><dd>{firearm.canonical.ammunitionName ?? "Review required"}</dd></div><div><dt>Capacity</dt><dd>{firearm.canonical.capacityRounds ?? "Review required"}</dd></div><div><dt>Readiness</dt><dd>{label(firearm.canonical.readinessMode)}</dd></div><div><dt>Draw / ready</dt><dd>{firearm.canonical.drawInitiativeCost ?? "?"} / {firearm.canonical.readyInitiativeCost ?? "?"}</dd></div><div><dt>Load / unload</dt><dd>{firearm.canonical.reloadInitiativeCost ?? "?"} / {firearm.canonical.unloadInitiativeCost ?? "?"}</dd></div></dl></section>
      <section><h5>Frozen runtime</h5><dl><div><dt>Equipment</dt><dd>{firearm.equipmentState}</dd></div><div><dt>Readied</dt><dd>{state.readied ? "Yes" : "No"} · {label(state.readinessMode)} ({state.readinessModeSource ?? "unresolved"})</dd></div><div><dt>Mode</dt><dd>{selectedStateMode?.name ?? `Invalid #${state.selectedFiringModeId}`}</dd></div><div><dt>Loaded</dt><dd>{state.loadedRounds} / {state.capacityRounds ?? "?"}{remaining === null ? "" : ` · ${remaining} remaining`}</dd></div><div><dt>Ammo identity</dt><dd>{state.loadedAmmunitionName ?? (state.loadedRounds ? "Invalid" : "Empty")}</dd></div><div><dt>Follow-up</dt><dd>{state.requiresCycling ? "Cycling required" : "Cycled"} · {state.requiresRecoilRecovery ? "Recoil recovery required" : "Recoil recovered"}</dd></div></dl></section>
      <section><h5>Current inventory</h5><strong>{firearm.inventoryAmmunitionQuantity}</strong><span>{firearm.canonical.ammunitionName ?? "compatible rounds unresolved"}</span></section>
    </div>

    {firearm.readiness.blockers.length ? <ul className="firearm-runtime-blockers">{firearm.readiness.blockers.map((entry, index) => <li key={`${entry.code}:${index}`}><strong>{entry.code}</strong><span>{entry.message}</span></li>)}</ul> : <p className="firearm-runtime-ready">All objectively required readiness conditions are satisfied.</p>}

    {pending ? <section className="firearm-runtime-pending"><h5>{pending.operation} in progress</h5><p>Initiative cost {pending.initiativeCost} · {pending.remainingInitiativeCost ?? "timing complete"} remaining</p>{pending.reason ? <small>{pending.reason}</small> : null}<details><summary>Technical details</summary><small>{pending.status} · {pending.timingSource} · expected {pending.expectedCompletionInitiative ?? "pending"}</small></details><div>{pending.actionDeclarationId !== null && pending.status === "pending" ? <><button className="st-button" disabled={busy} onClick={() => { const why = window.prompt("Why interrupt this preparation?")?.trim(); if (why) void perform(() => interruptActionDeclaration(encounterId, pending.actionDeclarationId!, why), "Preparation interrupted; elapsed Initiative remains spent."); }}>Interrupt</button><button className="st-button is-danger" disabled={busy} onClick={() => void perform(() => cancelActionDeclaration(encounterId, pending.actionDeclarationId!, reason), "Preparation cancelled without falsely completing readiness.")}>Cancel</button></> : null}{pending.actionDeclarationId !== null && pending.status === "interrupted" ? <button className="st-button is-secondary" disabled={busy} onClick={() => { const why = window.prompt("Why may this preparation resume?")?.trim(); if (why) void perform(() => resumeInterruptedActionDeclaration(encounterId, pending.actionDeclarationId!, why), "Preparation resumed through the existing Initiative action."); }}>Resume</button> : null}</div></section> : <>
      <div className="firearm-runtime-form">
        <label className="st-field"><span>Rounds to load</span><input className="st-control" type="number" min={1} step={1} value={rounds} onChange={(event) => setRounds(event.target.value)} /></label>
        <label className="st-field"><span>Firing mode</span><select className="st-control" value={modeId} onChange={(event) => setModeId(event.target.value)}>{firearm.modes.map((mode) => <option key={mode.id} value={mode.id ?? ""}>{mode.name}{mode.timing ? "" : " · review required"}</option>)}</select></label>
        <label className="st-field"><span>Partial load</span><select className="st-control" value={disposition} onChange={(event) => setDisposition(event.target.value as typeof disposition)}><option value="none">No change</option><option value="retain">Keep rounds</option><option value="discard">Discard rounds</option></select></label>
        <label className="st-field firearm-runtime-check"><input type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} /><span>Replace current partial load</span></label>
        <label className="st-field"><span>Initiative cost, if needed</span><input className="st-control" type="number" min={0} step={1} value={godCost} onChange={(event) => setGodCost(event.target.value)} placeholder="Use authored cost" /></label>
        <label className="st-field is-wide"><span>Ruling reason</span><input className="st-control" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      </div>
      <div className="firearm-runtime-actions">
        <button className="st-button" disabled={busy || preparationAttempt !== null || firearm.equipmentState === "wielded"} onClick={() => void prepare("draw")}>Draw</button>
        <button className="st-button" disabled={busy || preparationAttempt !== null || firearm.equipmentState !== "wielded" || state.readied} onClick={() => void prepare("ready")}>Ready</button>
        <button className="st-button" disabled={busy || preparationAttempt !== null || state.loadedRounds > 0 || !rounds} onClick={() => void prepare("load")}>Load</button>
        <button className="st-button" disabled={busy || preparationAttempt !== null || !rounds} onClick={() => void prepare("reload")}>Reload</button>
        <button className="st-button" disabled={busy || preparationAttempt !== null || state.loadedRounds === 0 || disposition === "none"} onClick={() => void prepare("unload")}>Unload</button>
        <button className="st-button" disabled={busy || preparationAttempt !== null || Number(modeId) === state.selectedFiringModeId || !selectedMode?.timing} onClick={() => void prepare("change-mode")}>Change mode</button>
        <button className="st-button" disabled={busy || preparationAttempt !== null || !state.requiresCycling} onClick={() => void prepare("cycle")}>Cycle</button>
        <button className="st-button" disabled={busy || preparationAttempt !== null || !state.requiresRecoilRecovery} onClick={() => void prepare("recover-recoil")}>Recover recoil</button>
      </div>
    </>}

    {preparationAttempt && feedback?.kind === "error" ? <aside className="action-declaration-recovery"><strong>We couldn’t confirm whether your action finished.</strong><span>Check and retry.</span><div><button className="st-button is-primary" type="button" disabled={busy} onClick={() => void prepare(preparationAttempt.operation)}>Retry action</button></div><details><summary>Saved retry details</summary><small>The same operation, rounds, disposition, timing ruling, firearm, actor, and submission identity will be used.</small></details></aside> : null}

    <details className="firearm-runtime-ruling"><summary>Correct firearm state</summary><div className="firearm-runtime-form"><label className="st-field"><span>Capacity</span><input className="st-control" type="number" min={1} step={1} value={capacity} onChange={(event) => setCapacity(event.target.value)} /></label><label className="st-field"><span>Readiness</span><select className="st-control" value={readinessMode} onChange={(event) => setReadinessMode(event.target.value as typeof readinessMode)}><option value="">Unresolved</option><option value="draw-is-ready">Drawing also readies</option><option value="separate-ready-action">Separate ready action</option></select></label><label className="st-field firearm-runtime-check"><input type="checkbox" checked={correctedReadied} onChange={(event) => setCorrectedReadied(event.target.checked)} /><span>Readied</span></label><label className="st-field firearm-runtime-check"><input type="checkbox" checked={correctedCycling} onChange={(event) => setCorrectedCycling(event.target.checked)} /><span>Cycling required</span></label><label className="st-field firearm-runtime-check"><input type="checkbox" checked={correctedRecoil} onChange={(event) => setCorrectedRecoil(event.target.checked)} /><span>Recoil recovery required</span></label><label className="st-field is-wide"><span>Reason</span><input className="st-control" value={reason} onChange={(event) => setReason(event.target.value)} /></label></div><div className="firearm-runtime-actions"><button className="st-button is-secondary" disabled={busy || !reason.trim()} onClick={() => void perform(() => correctFirearmState(encounterId, { characterId, itemInstanceId: firearm.itemInstanceId, capacityRounds: numberOrNull(capacity), readinessMode: readinessMode || null, readied: correctedReadied, requiresCycling: correctedCycling, requiresRecoilRecovery: correctedRecoil, reason }), "Audited firearm correction recorded without editing canonical Equipment.")}>Record correction</button><button className="st-button" disabled={busy || !reason.trim()} onClick={() => void perform(() => recordFirearmManualHandling(encounterId, { characterId, itemInstanceId: firearm.itemInstanceId, reason }), "Unsupported situation marked for manual handling.")}>Use manual handling</button></div></details>

    <details className="firearm-runtime-history"><summary>Relevant history · {firearm.history.length}</summary><ol>{firearm.history.map((entry) => <li key={entry.id}><strong>{entry.eventKind}</strong><span>{new Date(entry.createdAt).toLocaleString()}</span>{entry.reason ? <small>{entry.reason}</small> : null}</li>)}</ol></details>
    {feedback ? <p className={`firearm-runtime-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}
  </article>;
}

export function FirearmReadinessWorkspace({
  view,
  lockCharacterSelection = false,
}: {
  view: FirearmWorkspaceView;
  lockCharacterSelection?: boolean;
}) {
  const router = useRouter();
  const selectedCharacter = view.characters.find(({ id }) => id === view.selectedCharacterId) ?? null;
  const selectedFirearm = view.firearms.find(({ itemInstanceId }) => itemInstanceId === view.selectedItemInstanceId) ?? null;

  function navigate(characterId: number, itemInstanceId?: number): void {
    const params = new URLSearchParams(window.location.search);
    params.set("firearmCharacter", String(characterId));
    if (itemInstanceId) params.set("firearmInstance", String(itemInstanceId));
    else params.delete("firearmInstance");
    router.push(`/heavens/tabletop?${params}`, { scroll: false });
  }

  return <section className="firearm-readiness-workspace" aria-label="Firearm readiness and ammunition state">
    <header><div><span>FIREARM READINESS</span><h3 className="font-sans">Readiness &amp; Ammunition</h3></div><small>Owned copies · Initiative actions · no attack resolution</small></header>
    <p className="firearm-runtime-boundary">This console records objective readiness and inventory state. It does not roll attacks, consume fired rounds, allocate bullets, or apply damage.</p>
    <div className="firearm-runtime-picker">
      {lockCharacterSelection
        ? <div><span>Selected encounter actor</span><strong>{selectedCharacter?.name ?? "No current actor"}</strong></div>
        : <label className="st-field"><span>Combatant</span><select className="st-control" value={view.selectedCharacterId ?? ""} onChange={(event) => navigate(Number(event.target.value))}>{view.characters.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}{entry.participantKind === "creature" ? " · Creature" : entry.isNpc ? " · NPC" : ""}</option>)}</select></label>}
      {selectedCharacter && selectedCharacter.id > 0 ? <label className="st-field"><span>Firearm</span><select className="st-control" value={view.selectedItemInstanceId ?? ""} onChange={(event) => navigate(selectedCharacter.id, Number(event.target.value))}><option value="">Select firearm</option>{view.firearms.map((entry) => <option key={entry.itemInstanceId} value={entry.itemInstanceId}>{entry.itemName} · copy #{entry.itemInstanceId}</option>)}</select></label> : null}
    </div>

    {selectedCharacter?.participantKind === "creature" ? <p className="firearm-runtime-warning">Direct encounter Creatures have no Character inventory or owned Item instances. Natural attacks remain outside this system; manufactured firearm use requires an explicit G.O.D. ruling and manual handling.</p> : null}

    {selectedCharacter && selectedCharacter.id > 0 && view.legacyStacks.length ? <section className="firearm-runtime-legacy"><h4>Owned firearm copies awaiting exact identity</h4><p>Each action below atomically moves one audited legacy stack copy into its own exact Item-instance identity. It does not guess prior firearm state.</p>{view.legacyStacks.map((stack) => <LegacyFirearmInitialization key={stack.itemId} stack={stack} characterId={selectedCharacter.id} encounterId={view.context.encounterId} />)}</section> : null}

    {selectedFirearm && selectedCharacter && selectedCharacter.id > 0 ? <FirearmRuntimeCard key={`${selectedFirearm.itemInstanceId}:${selectedFirearm.state?.version ?? 0}`} firearm={selectedFirearm} characterId={selectedCharacter.id} encounterId={view.context.encounterId} /> : selectedCharacter && selectedCharacter.id > 0 && !view.legacyStacks.length ? <p className="tabletop-empty">This participant has no exact or legacy owned firearm copies.</p> : null}
  </section>;
}

function LegacyFirearmInitialization({ stack, characterId, encounterId }: {
  stack: FirearmWorkspaceView["legacyStacks"][number];
  characterId: number;
  encounterId: number;
}) {
  const router = useRouter();
  const [modeId, setModeId] = useState(String(stack.firingModes[0]?.id ?? ""));
  const [capacity, setCapacity] = useState("");
  const [readinessMode, setReadinessMode] = useState<"" | "draw-is-ready" | "separate-ready-action">("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  return <article><div><strong>{stack.itemName}</strong><span>{stack.canonicalId} · {stack.quantity} legacy {stack.quantity === 1 ? "copy" : "copies"}</span>{stack.firingModes.length === 0 ? <small>No firing mode exists; review the Equipment record before assigning a copy.</small> : null}</div><label className="st-field"><span>Firing mode</span><select className="st-control" value={modeId} onChange={(event) => setModeId(event.target.value)}><option value="">Select mode</option>{stack.firingModes.map((mode) => <option key={mode.id} value={mode.id}>{mode.name}</option>)}</select></label><label className="st-field"><span>Capacity ruling</span><input className="st-control" type="number" min={1} step={1} value={capacity} onChange={(event) => setCapacity(event.target.value)} /></label><label className="st-field"><span>Readiness ruling</span><select className="st-control" value={readinessMode} onChange={(event) => setReadinessMode(event.target.value as typeof readinessMode)}><option value="">Use authored value</option><option value="draw-is-ready">Drawing also readies</option><option value="separate-ready-action">Separate ready action</option></select></label><label className="st-field"><span>Reason</span><input className="st-control" value={reason} onChange={(event) => setReason(event.target.value)} /></label><button className="st-button is-primary" disabled={busy || !modeId || !reason.trim()} onClick={() => {
    setBusy(true); setFeedback(null);
    void initializeFirearmState(encounterId, { characterId, itemId: stack.itemId, itemInstanceId: null, selectedFiringModeId: Number(modeId), capacityRuling: numberOrNull(capacity), readinessModeRuling: readinessMode || null, reason, idempotencyKey: crypto.randomUUID() })
      .then(({ itemInstanceId }) => { setFeedback({ kind: "success", message: `Exact copy #${itemInstanceId} initialized.` }); router.refresh(); })
      .catch((error: unknown) => setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Initialization failed." }))
      .finally(() => setBusy(false));
  }}>Assign exact identity</button>{feedback ? <small className={`is-${feedback.kind}`}>{feedback.message}</small> : null}</article>;
}
