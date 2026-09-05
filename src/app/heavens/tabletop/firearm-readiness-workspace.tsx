"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import type { FirearmInstanceView, FirearmWorkspaceView } from "@/features/tabletop-operations/firearm-readiness-service";
import type { FirearmPreparationOperation } from "@/features/tabletop-operations/firearm-readiness";

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
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [modeId, setModeId] = useState(String(state?.selectedFiringModeId ?? firearm.modes[0]?.id ?? ""));
  const [rounds, setRounds] = useState("");
  const [replace, setReplace] = useState(false);
  const [disposition, setDisposition] = useState<"none" | "retain" | "discard">("none");
  const [godCost, setGodCost] = useState("");
  const [reason, setReason] = useState("");
  const [capacity, setCapacity] = useState(state?.capacityRounds === null || state?.capacityRounds === undefined ? "" : String(state.capacityRounds));
  const [readinessMode, setReadinessMode] = useState<"" | "draw-is-ready" | "separate-ready-action">(
    state?.readinessMode === "draw-is-ready" || state?.readinessMode === "separate-ready-action" ? state.readinessMode : "",
  );
  const [correctedReadied, setCorrectedReadied] = useState(state?.readied ?? false);
  const [correctedCycling, setCorrectedCycling] = useState(state?.requiresCycling ?? false);
  const [correctedRecoil, setCorrectedRecoil] = useState(state?.requiresRecoilRecovery ?? false);
  const selectedMode = firearm.modes.find(({ id }) => id === Number(modeId)) ?? null;

  async function perform(work: () => Promise<unknown>, success: string): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      await work();
      setFeedback({ kind: "success", message: success });
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The firearm operation failed." });
    } finally {
      setBusy(false);
    }
  }

  async function prepare(operation: FirearmPreparationOperation): Promise<void> {
    await perform(async () => {
      await startFirearmPreparation(encounterId, {
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
      });
    }, `${operation.replaceAll("-", " ")} was recorded through the existing Initiative action workflow.`);
  }

  if (!state) return <article className="firearm-runtime-card">
    <header><div><span>UNINITIALIZED EXACT COPY #{firearm.itemInstanceId}</span><h4>{firearm.itemName}</h4><small>{firearm.canonicalId} · Weapon Profile #{firearm.weaponProfileId}</small></div><Link href="/heavens/equipment">Review canonical Equipment</Link></header>
    <p className="firearm-runtime-boundary">No loaded, empty, drawn, or ready state has been guessed for this copy. Initialization records an explicit empty and not-readied baseline.</p>
    {firearm.modes.length === 0 ? <p className="firearm-runtime-boundary">This firearm has no exact firing mode to select. Review its global canonical Equipment record before initialization.</p> : null}
    <div className="firearm-runtime-form">
      <label><span>Exact firing mode</span><select value={modeId} onChange={(event) => setModeId(event.target.value)}><option value="">Select mode</option>{firearm.modes.map((mode) => <option key={mode.id} value={mode.id ?? ""}>{mode.name}{mode.mechanicsReviewRequired ? " · review required" : ""}</option>)}</select></label>
      <label><span>Capacity ruling if missing</span><input type="number" min={1} step={1} value={capacity} placeholder={firearm.canonical.capacityRounds === null ? "Required ruling" : String(firearm.canonical.capacityRounds)} onChange={(event) => setCapacity(event.target.value)} /></label>
      <label><span>Readiness ruling if missing</span><select value={readinessMode} onChange={(event) => setReadinessMode(event.target.value as typeof readinessMode)}><option value="">Leave unresolved</option><option value="draw-is-ready">Drawing also readies</option><option value="separate-ready-action">Separate ready action</option></select></label>
      <label className="is-wide"><span>Initialization / ruling reason</span><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required for initialization and any G.O.D. value" /></label>
    </div>
    <footer><button type="button" disabled={busy || !modeId || !reason.trim()} onClick={() => void perform(() => initializeFirearmState(encounterId, {
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

    {pending ? <section className="firearm-runtime-pending"><h5>Pending {pending.operation}</h5><p>{pending.status} · Initiative {pending.initiativeCost} ({pending.timingSource}) · remaining {pending.remainingInitiativeCost ?? "awaiting runtime"} · expected {pending.expectedCompletionInitiative ?? "pending"}</p>{pending.reason ? <small>{pending.reason}</small> : null}<div>{pending.actionDeclarationId !== null && pending.status === "pending" ? <><button disabled={busy} onClick={() => { const why = window.prompt("Why interrupt this preparation?")?.trim(); if (why) void perform(() => interruptActionDeclaration(encounterId, pending.actionDeclarationId!, why), "Preparation interrupted; elapsed Initiative remains spent."); }}>Interrupt</button><button disabled={busy} onClick={() => void perform(() => cancelActionDeclaration(encounterId, pending.actionDeclarationId!, reason), "Preparation cancelled without falsely completing readiness.")}>Cancel</button></> : null}{pending.actionDeclarationId !== null && pending.status === "interrupted" ? <button disabled={busy} onClick={() => { const why = window.prompt("Why may this preparation resume?")?.trim(); if (why) void perform(() => resumeInterruptedActionDeclaration(encounterId, pending.actionDeclarationId!, why), "Preparation resumed through the existing Initiative action."); }}>Resume by ruling</button> : null}</div></section> : <>
      <div className="firearm-runtime-form">
        <label><span>Rounds for load / reload</span><input type="number" min={1} step={1} value={rounds} onChange={(event) => setRounds(event.target.value)} /></label>
        <label><span>Target firing mode</span><select value={modeId} onChange={(event) => setModeId(event.target.value)}>{firearm.modes.map((mode) => <option key={mode.id} value={mode.id ?? ""}>{mode.name}{mode.timing ? "" : " · review required"}</option>)}</select></label>
        <label><span>Partial-load handling</span><select value={disposition} onChange={(event) => setDisposition(event.target.value as typeof disposition)}><option value="none">No disposition</option><option value="retain">Retain rounds</option><option value="discard">Discard rounds</option></select></label>
        <label className="firearm-runtime-check"><input type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} /><span>Replace current partial load</span></label>
        <label><span>G.O.D. Initiative Cost if missing</span><input type="number" min={0} step={1} value={godCost} onChange={(event) => setGodCost(event.target.value)} placeholder="Blank uses canonical" /></label>
        <label className="is-wide"><span>G.O.D. timing / discard reason</span><input value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      </div>
      <div className="firearm-runtime-actions">
        <button disabled={busy || firearm.equipmentState === "wielded"} onClick={() => void prepare("draw")}>Draw</button>
        <button disabled={busy || firearm.equipmentState !== "wielded" || state.readied} onClick={() => void prepare("ready")}>Ready</button>
        <button disabled={busy || state.loadedRounds > 0 || !rounds} onClick={() => void prepare("load")}>Load</button>
        <button disabled={busy || !rounds} onClick={() => void prepare("reload")}>Reload</button>
        <button disabled={busy || state.loadedRounds === 0 || disposition === "none"} onClick={() => void prepare("unload")}>Unload</button>
        <button disabled={busy || Number(modeId) === state.selectedFiringModeId || !selectedMode?.timing} onClick={() => void prepare("change-mode")}>Change mode</button>
        <button disabled={busy || !state.requiresCycling} onClick={() => void prepare("cycle")}>Cycle</button>
        <button disabled={busy || !state.requiresRecoilRecovery} onClick={() => void prepare("recover-recoil")}>Recover recoil</button>
      </div>
    </>}

    <details className="firearm-runtime-ruling"><summary>Audited state correction</summary><div className="firearm-runtime-form"><label><span>Frozen capacity</span><input type="number" min={1} step={1} value={capacity} onChange={(event) => setCapacity(event.target.value)} /></label><label><span>Readiness relationship</span><select value={readinessMode} onChange={(event) => setReadinessMode(event.target.value as typeof readinessMode)}><option value="">Unresolved</option><option value="draw-is-ready">Drawing also readies</option><option value="separate-ready-action">Separate ready action</option></select></label><label className="firearm-runtime-check"><input type="checkbox" checked={correctedReadied} onChange={(event) => setCorrectedReadied(event.target.checked)} /><span>Readied</span></label><label className="firearm-runtime-check"><input type="checkbox" checked={correctedCycling} onChange={(event) => setCorrectedCycling(event.target.checked)} /><span>Cycling required</span></label><label className="firearm-runtime-check"><input type="checkbox" checked={correctedRecoil} onChange={(event) => setCorrectedRecoil(event.target.checked)} /><span>Recoil recovery required</span></label><label className="is-wide"><span>Required correction reason</span><input value={reason} onChange={(event) => setReason(event.target.value)} /></label></div><div className="firearm-runtime-actions"><button disabled={busy || !reason.trim()} onClick={() => void perform(() => correctFirearmState(encounterId, { characterId, itemInstanceId: firearm.itemInstanceId, capacityRounds: numberOrNull(capacity), readinessMode: readinessMode || null, readied: correctedReadied, requiresCycling: correctedCycling, requiresRecoilRecovery: correctedRecoil, reason }), "Audited firearm correction recorded without editing canonical Equipment.")}>Record correction</button><button disabled={busy || !reason.trim()} onClick={() => void perform(() => recordFirearmManualHandling(encounterId, { characterId, itemInstanceId: firearm.itemInstanceId, reason }), "Unsupported situation marked for manual handling.")}>Mark manual handling</button></div></details>

    <details className="firearm-runtime-history"><summary>Relevant history · {firearm.history.length}</summary><ol>{firearm.history.map((entry) => <li key={entry.id}><strong>{entry.eventKind}</strong><span>{new Date(entry.createdAt).toLocaleString()}</span>{entry.reason ? <small>{entry.reason}</small> : null}</li>)}</ol></details>
    {feedback ? <p className={`firearm-runtime-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}
  </article>;
}

export function FirearmReadinessWorkspace({ view }: { view: FirearmWorkspaceView }) {
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
    <header><div><span>PASS 9 · FIREARM RUNTIME</span><h3 className="font-sans">Readiness &amp; Ammunition</h3></div><small>Exact owned copies · existing Initiative actions · no attack resolution</small></header>
    <p className="firearm-runtime-boundary">This console records objective readiness and inventory state. It does not roll attacks, consume fired rounds, allocate bullets, or apply damage.</p>
    <div className="firearm-runtime-picker">
      <label><span>Encounter Character or NPC</span><select value={view.selectedCharacterId ?? ""} onChange={(event) => navigate(Number(event.target.value))}>{view.characters.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}{entry.participantKind === "creature" ? " · direct Creature" : entry.isNpc ? " · persistent NPC" : ""}</option>)}</select></label>
      {selectedCharacter && selectedCharacter.id > 0 ? <label><span>Exact owned firearm</span><select value={view.selectedItemInstanceId ?? ""} onChange={(event) => navigate(selectedCharacter.id, Number(event.target.value))}><option value="">Select exact copy</option>{view.firearms.map((entry) => <option key={entry.itemInstanceId} value={entry.itemInstanceId}>{entry.itemName} · copy #{entry.itemInstanceId}</option>)}</select></label> : null}
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
  return <article><div><strong>{stack.itemName}</strong><span>{stack.canonicalId} · {stack.quantity} legacy {stack.quantity === 1 ? "copy" : "copies"}</span>{stack.firingModes.length === 0 ? <small>No exact firing mode exists; review the global Equipment record before assigning an instance.</small> : null}</div><label><span>Exact mode</span><select value={modeId} onChange={(event) => setModeId(event.target.value)}><option value="">Select mode</option>{stack.firingModes.map((mode) => <option key={mode.id} value={mode.id}>{mode.name}</option>)}</select></label><label><span>Capacity ruling</span><input type="number" min={1} step={1} value={capacity} onChange={(event) => setCapacity(event.target.value)} /></label><label><span>Readiness ruling</span><select value={readinessMode} onChange={(event) => setReadinessMode(event.target.value as typeof readinessMode)}><option value="">Use canonical / unresolved</option><option value="draw-is-ready">Drawing also readies</option><option value="separate-ready-action">Separate ready action</option></select></label><label><span>Required reason</span><input value={reason} onChange={(event) => setReason(event.target.value)} /></label><button disabled={busy || !modeId || !reason.trim()} onClick={() => {
    setBusy(true); setFeedback(null);
    void initializeFirearmState(encounterId, { characterId, itemId: stack.itemId, itemInstanceId: null, selectedFiringModeId: Number(modeId), capacityRuling: numberOrNull(capacity), readinessModeRuling: readinessMode || null, reason, idempotencyKey: crypto.randomUUID() })
      .then(({ itemInstanceId }) => { setFeedback({ kind: "success", message: `Exact copy #${itemInstanceId} initialized.` }); router.refresh(); })
      .catch((error: unknown) => setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Initialization failed." }))
      .finally(() => setBusy(false));
  }}>Assign exact identity</button>{feedback ? <small className={`is-${feedback.kind}`}>{feedback.message}</small> : null}</article>;
}
