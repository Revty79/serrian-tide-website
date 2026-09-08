"use client";

import { startTransition, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { CombatRunnerSnapshot } from "@/features/tabletop-operations/combat-runner-service";
import type { CombatTask } from "@/features/tabletop-operations/combat-progression";
import type { CombatRunnerDecision, CombatRunnerSubmission } from "@/features/tabletop-operations/combat-runner-decision";
import type { ActionDeclarationWorkspaceView } from "@/features/tabletop-operations/action-declaration-service";
import type { DefenseInterventionWorkspaceView } from "@/features/tabletop-operations/defense-intervention-service";
import { canAutomaticallyProgressCombat, canControlCombatTask, selectRunnerTask } from "@/features/tabletop-operations/combat-runner-presentation";
import { parsePhysicalPercentileInput } from "@/features/tabletop-operations/roll-runtime";
import styles from "./combat-runner-workspace.module.css";

type DecisionResult = { changed: boolean; stale: boolean; rollTotal?: number | null; message?: string };
type ContinueInput = { revision: string; command: "continue" | "round"; automatic?: boolean };
export type RunnerCombatant = ActionDeclarationWorkspaceView["participants"][number] & { health?: string; movementMode?: string };

/** Both roles use the server's task order. Inspecting another combatant cannot
 * change roll ownership, skip a decision, or change the action a roll belongs to. */
export function CombatRunnerWorkspace({ title, round, timeline, combatants, declarations, defenses,
  controlledIds, readSnapshot, submitDecision, continueCombat, refreshKey, headerActions, reference, renderException,
}: {
  title: string; round: number; timeline: number;
  combatants: readonly RunnerCombatant[];
  declarations: ActionDeclarationWorkspaceView["declarations"];
  defenses: DefenseInterventionWorkspaceView;
  controlledIds: readonly number[];
  readSnapshot: () => Promise<CombatRunnerSnapshot>;
  submitDecision: (input: CombatRunnerSubmission) => Promise<DecisionResult>;
  continueCombat?: (input: ContinueInput) => Promise<DecisionResult>;
  refreshKey: string; headerActions: ReactNode; reference?: ReactNode;
  renderException?: (task: CombatTask) => ReactNode;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<CombatRunnerSnapshot | null>(null);
  const [requestedTask, setRequestedTask] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const autoAttempted = useRef<string | null>(null);
  const sequence = useRef(0);
  const reload = useCallback(() => {
    const request = ++sequence.current;
    return readSnapshot().then((next) => {
      if (request === sequence.current) { setSnapshot(next); setLoadError(null); }
    }).catch((error: unknown) => {
      if (request === sequence.current) setLoadError(error instanceof Error ? error.message : "Combat could not refresh.");
    });
  }, [readSnapshot]);
  useEffect(() => { void reload(); return () => { sequence.current += 1; }; }, [reload, refreshKey]);
  const perform = useCallback(async (work: () => Promise<DecisionResult>, automatic = false) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try {
      const result = await work();
      if (!automatic) setFeedback({ error: false, text: result.stale
        ? "Combat changed before this submission. Review the refreshed choice; nothing was submitted twice."
        : result.message ?? (result.rollTotal != null ? `Roll: ${result.rollTotal} — saved for this combat action.` : "Choice saved.") });
      await reload();
    } catch (error) {
      setFeedback({ error: true, text: error instanceof Error ? error.message : "The choice could not be confirmed. Refresh before retrying." });
      if (automatic) setPaused(true);
      await reload();
    } finally { inFlight.current = false; setBusy(false); }
  }, [reload]);
  useEffect(() => {
    if (!continueCombat || !snapshot || !canAutomaticallyProgressCombat({
      canGovern: true, serverReady: snapshot.autoContinue, paused, toolsOpen: showTools,
      busy, loadFailed: Boolean(loadError), revision: snapshot.revision,
      attemptedRevision: autoAttempted.current,
    })) return;
    autoAttempted.current = snapshot.revision;
    startTransition(() => perform(() => continueCombat({ revision: snapshot.revision, command: "continue", automatic: true }), true));
  }, [snapshot, continueCombat, paused, showTools, busy, loadError, perform]);

  const role = continueCombat ? "god" : "player";
  const controllers = combatants.map(({ characterId }) => ({ id: characterId, controlled: controlledIds.includes(characterId) }));
  const canControl = (task: CombatTask) => canControlCombatTask(task, controllers, role);
  const tasks = snapshot?.progression.tasks ?? [];
  const current = selectRunnerTask(tasks, requestedTask, controllers, role);
  const actor = combatants.find(({ characterId }) => characterId === current?.participantId) ?? null;
  const declaration = declarations.find(({ id }) => id === current?.declarationId) ?? null;
  const isFirearm = current?.kind !== "roll-defense" && (declaration?.draft.actionKind.startsWith("firearm-") ?? false);
  const readyResults = tasks.length > 0 && tasks.every(({ kind }) => kind === "apply-result" || kind === "resolve-exchange");
  const pending = declarations.filter(({ status }) => !["resolved", "cancelled", "abandoned"].includes(status));
  const history = declarations.filter(({ status }) => ["resolved", "cancelled", "abandoned"].includes(status)).slice(-6).reverse();
  const decide = (decision: CombatRunnerDecision) => {
    if (snapshot && current) startTransition(() => perform(() => submitDecision({ revision: snapshot.revision, taskKey: current.key, rollRevision: snapshot.rollRevisions?.[current.key], decision })));
  };
  return <section className={styles.runner} aria-label="Guided combat runner" data-combat-runner="connected" data-combat-revision={snapshot?.revision}>
    <header className={styles.header}><div><p className={styles.eyebrow}>COMBAT</p><h1>{title}</h1>
      <p>Round <strong>{round}</strong> · Combat time <strong>{timeline}</strong></p></div><div className={styles.fields}>{headerActions}</div></header>
    <div className={styles.layout}>
      <aside className={styles.roster} aria-label="Initiative tracker"><h2>Initiative</h2>
        {[...combatants].sort((a, b) => b.currentInitiative - a.currentInitiative || a.name.localeCompare(b.name)).map((participant) => {
          const work = pending.find(({ actorCharacterId }) => actorCharacterId === participant.characterId);
          const task = tasks.find(({ participantId }) => participantId === participant.characterId);
          return <button type="button" className={`st-button ${styles.combatant}`} key={participant.characterId}
            aria-pressed={current?.participantId === participant.characterId} disabled={!task} onClick={() => task && setRequestedTask(task.key)}>
            <span><strong>{participant.name}</strong><b>{participant.currentInitiative}</b></span>
            <small>{participant.health ? `Health ${participant.health} · ` : ""}{participant.participationStatus}</small>
            <small>{work?.timing?.status === "active" ? `${work.lockedSnapshot?.label ?? work.draft.label} · finishes at ${work.timing.expectedCompletionInitiative}`
              : task?.kind === "held-action" ? "Holding — you can act" : task?.kind === "choose-action" ? "Choose an action" : task?.kind.startsWith("roll-") ? "Roll needed" : work ? "Resolving action" : "Waiting"}</small>
          </button>;
        })}
      </aside>
      <div className={styles.main}>
        <div className={styles.flowBar}><strong>{busy ? "Saving combat…" : "What happens now"}</strong>
          {continueCombat ? <label><input type="checkbox" checked={!paused} onChange={(event) => { autoAttempted.current = null; setPaused(!event.target.checked); }} /> Automatic progression</label> : null}
          <button className="st-button is-secondary" type="button" disabled={busy} onClick={() => { void reload(); router.refresh(); }}>Refresh</button></div>
        {showTools && continueCombat ? <p role="status">Automatic progression is paused while G.O.D. tools are open.</p> : null}
        {feedback ? <p className={feedback.error ? styles.error : styles.feedback} role={feedback.error ? "alert" : "status"}>{feedback.text}</p> : null}
        {loadError ? <p className={styles.error} role="alert">{loadError} Refresh to reconnect; encounter controls remain available.</p> : null}
        {!snapshot ? <p role="status">Loading the next combat decision…</p> : <>
          {tasks.length > 1 ? <nav className={styles.tasks} aria-label="Current combat decisions">{tasks.map((task) => <button type="button" className="st-button" key={task.key}
            data-combat-task-kind={task.kind} aria-pressed={task.key === current?.key} disabled={busy} onClick={() => setRequestedTask(task.key)}>{task.title}</button>)}</nav> : null}
          {current ? <section className={styles.task} aria-label="Current combat task" data-task-kind={current.kind} data-task-key={current.key}>
            <h2>{current.title}</h2><p>{current.detail}</p>
            {declaration ? <p className={styles.actionLabel}>{declaration.actorName} — {declaration.lockedSnapshot?.label ?? declaration.draft.label}</p> : null}
            {canControl(current) && !isFirearm ? <fieldset disabled={busy || Boolean(loadError)} className={styles.controls}>
              <DecisionControls key={current.key} task={current} actor={actor} combatants={combatants} declaration={declaration} defenses={defenses} decide={decide} />
            </fieldset> : current.participantId !== null && ["choose-action", "held-action", "choose-response", "roll-attack", "roll-defense"].includes(current.kind) && !canControl(current) ? <p className={styles.feedback}>Waiting for this combatant&apos;s Player. Their required controls are on their combat screen.</p> : null}
            {current.kind === "ruling" || current.kind === "blocked" || isFirearm ? renderException?.(current) : null}
            {continueCombat && (snapshot.progression.canAdvanceTime || readyResults || snapshot.progression.canStartRound) ? <div className={styles.continue}>
              {snapshot.heldNames.length ? <p>{snapshot.heldNames.join(", ")} {snapshot.heldNames.length === 1 ? "is" : "are"} holding. Check for an intervention before continuing.</p> : null}
              <button type="button" className="st-button is-primary" disabled={busy || Boolean(loadError)} onClick={() => startTransition(() => perform(() => continueCombat({ revision: snapshot.revision, command: snapshot.progression.canStartRound ? "round" : "continue" })))}>
                {snapshot.progression.canStartRound ? "Start next round" : readyResults ? "Apply ready results" : "Continue combat"}</button>
            </div> : null}
          </section> : null}
        </>}
        {pending.length ? <section className={styles.pending} aria-label="Actions in progress"><h3>In progress</h3>{pending.map((action) => <p key={action.id}>
          <strong>{action.actorName}</strong> — {action.lockedSnapshot?.label ?? action.draft.label}{action.timing?.status === "active" ? ` · ${action.timing.remainingInitiativeCost} Initiative remaining; finishes at ${action.timing.expectedCompletionInitiative}` : " · resolving"}
        </p>)}</section> : null}
        {history.length ? <details className={styles.reference}><summary>Recent results</summary>{history.map((action) => <p key={action.id}>{action.actorName} — {action.lockedSnapshot?.label ?? action.draft.label}: <strong>{action.status}</strong></p>)}</details> : null}
        {reference ? <details className={styles.reference} onToggle={(event) => setShowTools(event.currentTarget.open)}><summary>{continueCombat ? "G.O.D. tools and other actions" : "Character reference and other actions"}</summary>{showTools ? reference : null}</details> : null}
      </div>
    </div>
  </section>;
}

function DecisionControls({ task, actor, combatants, declaration, defenses, decide }: {
  task: CombatTask; actor: RunnerCombatant | null; combatants: readonly RunnerCombatant[];
  declaration: ActionDeclarationWorkspaceView["declarations"][number] | null;
  defenses: DefenseInterventionWorkspaceView; decide: (choice: CombatRunnerDecision) => void;
}) {
  const sources = actor ? [
    ...actor.weapons.filter(({ firingModes }) => !firingModes.length).map((weapon) => ({ key: weapon.ownershipKey, source: "weapon" as const, label: weapon.name, cost: weapon.initiativeCost })),
    ...actor.creatureAttacks.map((attack) => ({ key: attack.canonicalId, source: "creature-attack" as const, label: attack.attackName, cost: attack.initiativeCost })),
  ] : [];
  const [actionMode, setActionMode] = useState<"attack" | "move">("attack");
  const [sourceKey, setSourceKey] = useState(sources[0]?.key ?? "");
  const [targetId, setTargetId] = useState(String(combatants.find(({ characterId }) => characterId !== actor?.characterId)?.characterId ?? ""));
  const [physical, setPhysical] = useState("");
  const [reason, setReason] = useState("");
  const [distance, setDistance] = useState("");
  const [intent, setIntent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const weapons = defenses.participants.find(({ characterId }) => characterId === actor?.characterId)?.weapons ?? [];
  const [weaponKey, setWeaponKey] = useState(weapons[0]?.ownershipKey ?? "");
  const source = sources.find(({ key }) => key === sourceKey);
  const validTarget = combatants.some(({ characterId }) => String(characterId) === targetId && characterId !== actor?.characterId);
  const roll = (method: "random" | "entered") => {
    try { const enteredTotal = method === "entered" ? parsePhysicalPercentileInput(physical) : undefined; setError(null); decide({ kind: "roll", method, enteredTotal }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Enter a percentile result."); }
  };
  if ((task.kind === "choose-action" || task.kind === "held-action") && actor) return <>
    <div className={styles.fields} role="group" aria-label="Action choices">
      <button type="button" className="st-button" aria-pressed={actionMode === "attack"} onClick={() => setActionMode("attack")}>Attack</button>
      <button type="button" className="st-button" aria-pressed={actionMode === "move"} onClick={() => setActionMode("move")}>Move</button>
    </div>
    {actionMode === "attack" ? sources.length ? <form onSubmit={(event) => { event.preventDefault(); if (source && validTarget) decide({ kind: "attack", source: source.source, sourceKey, targetParticipantId: Number(targetId) }); }}>
      <div className={styles.fields}><label className="st-field"><span>Attack with</span><select className="st-control" value={sourceKey} onChange={(event) => setSourceKey(event.target.value)}>{sources.map((entry) => <option key={entry.key} value={entry.key}>{entry.label} · {entry.cost ?? "?"} Initiative</option>)}</select></label>
        <label className="st-field"><span>Target</span><select className="st-control" value={targetId} onChange={(event) => setTargetId(event.target.value)}>{combatants.filter(({ characterId }) => characterId !== actor.characterId).map((entry) => <option key={entry.characterId} value={entry.characterId}>{entry.name}</option>)}</select></label></div>
      {source?.cost != null ? <p>Cost: {source.cost} Initiative · starts at {actor.currentInitiative} · expected finish at {actor.currentInitiative - source.cost}</p> : <p>This attack needs a G.O.D. cost ruling.</p>}
      <button type="submit" className="st-button is-primary" disabled={!source || !validTarget || source.cost === null || source.cost > actor.currentInitiative}>Commit attack</button>
    </form> : <p>No authored melee or Creature attack is available. Check equipment or use the other action controls below.</p> : null}
    <div className={styles.fields}><button type="button" className="st-button" onClick={() => decide({ kind: "hold" })}>{task.kind === "held-action" ? "Keep holding" : "Hold"}</button><button type="button" className="st-button" onClick={() => decide({ kind: "pass" })}>Pass this round</button></div>
    <small>Hold keeps an opening to intervene. Pass saves unused Initiative for the next round.</small>
    {actionMode === "move" ? actor.movementMode ? <section aria-label="Movement"><h3>Move</h3><p>Enter the distance and destination. Movement spends Initiative; it does not require an attack roll.</p><form onSubmit={(event) => { event.preventDefault(); decide({ kind: "move", movementMode: actor.movementMode!, distanceFeet: Number(distance), intent }); }}>
      <label className="st-field"><span>Distance (feet)</span><input className="st-control" type="number" min="0.01" step="any" required value={distance} onChange={(event) => setDistance(event.target.value)} /></label>
      <label className="st-field"><span>Move to</span><input className="st-control" required maxLength={500} value={intent} onChange={(event) => setIntent(event.target.value)} /></label><p>{(() => {
        const mode = actor.movementModes.find(({ movementMode }) => movementMode === actor.movementMode);
        const feet = Number(distance);
        if (!mode || !Number.isFinite(feet) || feet <= 0) return "Enter a distance to preview the Initiative cost.";
        const cost = Math.ceil(feet / mode.baseMovement);
        return `${feet} feet costs ${cost} Initiative (${mode.baseMovement} feet per Initiative).${cost > actor.currentInitiative ? " Movement will continue into the next round." : ""}`;
      })()}</p><button type="submit" className="st-button">Begin movement</button></form></section> : <p role="status">Your current movement mode is unavailable. G.O.D. needs to check your movement before you can move.</p> : null}
  </>;
  if (task.kind === "eligibility") return <>
    <p>Confirm awareness and positioning. This does not choose a defense for the combatant.</p>
    <button type="button" className="st-button is-primary" onClick={() => decide({ kind: "eligibility", allow: true })}>Allow response</button>
    <details className={styles.reference}><summary>Cannot respond</summary><label className="st-field"><span>Reason</span><input className="st-control" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <button type="button" className="st-button" disabled={!reason.trim()} onClick={() => decide({ kind: "eligibility", allow: false, reason })}>Rule ineligible</button></details>
  </>;
  if (task.kind === "choose-response") {
    const targets = declaration?.lockedSnapshot?.targetCharacterIds ?? declaration?.draft.targetCharacterIds ?? [];
    const selfTarget = actor !== null && targets.includes(actor.characterId);
    const dodge = (actor !== null && actor.characterId < 0) || defenses.dodgeMappings.some(({ reviewState, conditional }) => reviewState === "approved" && !conditional);
    return <>
      <button type="button" className="st-button is-primary" onClick={() => decide({ kind: "defense", reactionType: "no-reaction" })}>{selfTarget ? "No Defense" : "Do not intervene"}</button>
      {selfTarget ? <><button type="button" className="st-button" disabled={!dodge} onClick={() => decide({ kind: "defense", reactionType: "dodge" })}>Dodge · 1 Initiative</button>
        {!dodge ? <p>Dodge needs an approved defense Skill path or a G.O.D. ruling.</p> : null}
        {weapons.length ? <div className={styles.fields}><label className="st-field"><span>Defending weapon</span><select className="st-control" value={weaponKey} onChange={(event) => setWeaponKey(event.target.value)}>{weapons.map((weapon) => <option key={weapon.ownershipKey} value={weapon.ownershipKey}>{weapon.name} · {weapon.initiativeCost ?? "?"} Initiative</option>)}</select></label>
          {(["parry", "block"] as const).map((kind) => <button key={kind} type="button" className="st-button" disabled={!weapons.some(({ ownershipKey }) => ownershipKey === weaponKey)} onClick={() => decide({ kind: "defense", reactionType: kind, weaponKey })}>{kind === "parry" ? "Parry" : "Block"}</button>)}</div> : null}</>
        : <p>Protecting another combatant needs a G.O.D. positioning ruling in the other controls.</p>}
    </>;
  }
  if (task.kind === "roll-attack" || task.kind === "roll-defense") {
    const target = task.kind === "roll-attack" ? declaration?.lockedSnapshot?.governing?.rollOverTarget : defenses.reactions.find(({ id }) => id === task.recordId)?.declaration.source.governingSnapshot?.originalTarget;
    return <>{target != null ? <p>Base roll-over target: <strong>{target}</strong>. Declared modifiers are applied by the server.</p> : null}
      <div className={styles.fields}><button type="button" className="st-button is-primary" onClick={() => roll("random")}>Roll d100</button>
        <form className={styles.fields} onSubmit={(event) => { event.preventDefault(); roll("entered"); }}>
          <label className="st-field"><span>Physical roll</span><input className="st-control" inputMode="numeric" placeholder="01–99, 00 or 100" value={physical} onChange={(event) => setPhysical(event.target.value)} /></label>
          <button type="submit" className="st-button" disabled={!physical.trim()}>Enter roll</button></form></div>
      <p>This result is saved to this specific {task.kind === "roll-defense" ? "defense" : "action"}. You do not need a separate dice panel.</p>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}</>;
  }
  return null;
}
