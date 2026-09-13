"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TabletopLiveRefresh } from "@/features/tabletop-operations/tabletop-live-refresh";
import { setEncounterCombatFrozen } from "@/app/heavens/tabletop/combat-freeze-actions";
import { initializeEncounterInitiative, enrollLateEncounterInitiativeParticipant, advanceEncounterInitiativeTimeline, advanceEncounterInitiativeRound } from "@/app/heavens/tabletop/initiative-actions";
import { addCampaignSessionEncounterParticipant, startCampaignSessionEncounter } from "@/app/heavens/tabletop/encounter-actions";
import { startCampaignSession } from "@/app/heavens/tabletop/actions";
import { startCampaignSessionScene } from "@/app/heavens/tabletop/scene-actions";
import { readCombatScreen } from "./screen-actions";
import { COMBAT_COMMANDS, combatActionStatus, combatScreenPrompt, type CombatCommand, type CombatScreenData, type CombatScreenScope } from "./screen-types";
import styles from "./combat-screen.module.css";
import { CreaturePicker } from "./creature-picker";
import { CommandPanel } from "./command-panel";
import { CloseoutPanel } from "./closeout-panel";
import { OperationPanel } from "./operation-panel";
import { readCombatOperations, prepareCombatResult, applyCombatFirearmResult, commitCombatFirearmTrigger, forceEndCombat } from "./operation-actions";
import { combatNextInput, automaticCombatInputKey, type CombatOperations, type CombatFocus } from "./next-input";
import { combatRollSummary } from "./result-summary";
import { combatConditionMessage } from "@/features/tabletop-operations/combat-condition-state";
import { ConditionAlerts } from "./condition-alerts";
import { AttackReport } from "./attack-report-panel";
import { SpellReport } from "./spell-report-panel";
import { attackReportSignature } from "./attack-report";
import { ForceEndDialog } from "./force-end-dialog";

export function combatMessage(message: string) {
  return message.replace(/simultaneous declaration checkpoint/gi, "simultaneous choices").replace(/checkpoint/gi, "simultaneous choices")
    .replace(/effect plan/gi, "action result").replace(/Initiative Runtime/gi, "Initiative");
}
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const records = (value: unknown) => Array.isArray(value) ? value.map(object) : [];

export function CombatResources({ information }: { information: CombatScreenData["information"] }) {
  const resources = information?.resources;
  if (!resources) return <p className={styles.muted}>Detailed resources are restricted to this combatant&apos;s authorized controller.</p>;
  if (resources.kind === "character") return <>
    <div className={styles.resources}>
      <div className={styles.resource}><span>Total HP</span><strong>{resources.health?.total.remainingHp ?? "?"} / {resources.health?.total.maximumHp ?? "?"}</strong>{resources.health ? <span>{resources.health.total.damage} damage taken</span> : null}</div>
      {resources.mana?.pools.map((pool) => <div className={styles.resource} key={pool.system}><span>{pool.system} Mana</span><strong>{pool.currentMana} / {pool.maximumMana}</strong></div>)}
      {!resources.mana ? <div className={styles.resource}><span>Mana</span><strong>Hidden until choices reveal</strong></div> : !resources.mana.pools.length ? <div className={styles.resource}><span>Mana</span><strong>None</strong></div> : null}
      <div className={styles.resource}><span>Initiative</span><strong>{information.entity.currentInitiative}</strong></div>
      {resources.advancement ? <><div className={styles.resource}><span>XP</span><strong>{resources.advancement.experience}</strong></div><div className={styles.resource}><span>Fame</span><strong>{resources.advancement.fame}</strong></div></> : null}
    </div>
    <div className={styles.locations} aria-label="HP by location">{resources.health?.tracks.filter((track) => track.key !== "total").map((track) => <div className={styles.location} key={track.key}><span>{track.name}</span><strong>{track.maximumHp === null ? "?" : track.maximumHp - track.damage} / {track.maximumHp ?? "?"}</strong></div>)}</div>
    {resources.effects.conditions.filter((entry) => !entry.resolvedAt).map((entry) => <p className={styles.muted} key={entry.id}>{entry.name}: {entry.description || entry.duration.label}</p>)}
    {resources.issues.map((issue) => <p className={styles.notice} key={issue}>{combatMessage(issue)}</p>)}
  </>;
  const snapshot = object(resources.anatomyAndStatistics), health = object(object(resources.state).health), maximum = object(snapshot.core).totalHp;
  return <><div className={styles.resources}><div className={styles.resource}><span>Total HP</span><strong>{typeof maximum === "number" ? Math.max(0, maximum - Number(health.totalDamage ?? 0)) : "?"} / {String(maximum ?? "?")}</strong><span>{Number(health.totalDamage ?? 0)} damage taken</span></div><div className={styles.resource}><span>Initiative</span><strong>{information.entity.currentInitiative}</strong></div></div>
    <div className={styles.locations} aria-label="HP by location">{records(snapshot.hpPools).map((pool) => <div className={styles.location} key={String(pool.canonicalId)}><span>{String(pool.poolName)}</span><strong>{typeof pool.maximumHp === "number" ? pool.maximumHp - Number(object(health.poolDamage)[String(pool.canonicalId)] ?? 0) : "?"} / {String(pool.maximumHp ?? "?")}</strong></div>)}</div></>;
}

export function CombatScreen({ scope, initialData }: { scope: CombatScreenScope; initialData: CombatScreenData }) {
  const [data, setData] = useState(initialData);
  const [selectedId, setSelectedId] = useState<number | null>(scope.role === "player" ? scope.characterId : initialData.roster[0]?.participantId ?? null);
  const selectedRef = useRef(selectedId), generation = useRef(0), mutation = useRef(false);
  const [command, setCommand] = useState<CombatCommand>("Attack");
  const [targets, setTargets] = useState<Record<number, string>>({});
  const target = selectedId === null ? "" : targets[selectedId] ?? "";
  const setTarget = (value: string) => { if (selectedId !== null) setTargets((previous) => ({ ...previous, [selectedId]: value })); };
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [stale, setStale] = useState(false);
  const [connection, setConnection] = useState<"connecting" | "live" | "reconnecting">("connecting");
  const [modes, setModes] = useState<Record<number, string>>({});
  const [arrival, setArrival] = useState("");
  const [operationRead, setOperationRead] = useState<{ data: CombatScreenData; value: CombatOperations } | null>(null);
  const [focus, setFocus] = useState<CombatFocus | null>(null);
  const [automatic, setAutomatic] = useState(true);
  const router = useRouter();
  useEffect(() => {
    if (scope.role === "player" && data.status === "completed") router.replace("/realms/tabletop?character=" + scope.characterId);
  }, [router, scope, data.status]);
  const automaticAttempts = useRef(new Set<string>());
  const commandRef = useRef<HTMLDivElement>(null), operationRef = useRef<HTMLDivElement>(null), focused = useRef(0);
  useEffect(() => {
    if (!data.projection) return;
    let active = true;
    void readCombatOperations(scope).then((value) => { if (active) setOperationRead({ data, value }); }).catch((error: unknown) => {
      if (active) setFeedback(error instanceof Error ? error.message : "The next combat input could not be read. Refresh to retry.");
    });
    return () => { active = false; };
  }, [scope, data]);
  useEffect(() => {
    if (!focus || focus.sequence === focused.current || loading || selectedId !== focus.participantId) return;
    const destination = focus.kind === "action" ? commandRef.current : operationRef.current;
    destination?.focus({ preventScroll: true }); destination?.scrollIntoView({ block: "center", behavior: "smooth" });
    focused.current = focus.sequence;
  }, [focus, loading, selectedId]);
  const operations = operationRead?.data === data ? operationRead.value : null;
  const nextInput = useMemo(() => combatNextInput(data, operations ?? operationRead?.value ?? null), [data, operations, operationRead]);
  const currentFeedback = feedback === "A specific G.O.D. ruling is needed. Use the next combat input to open it."
    && operations && !operations.plans.some((plan) => ["requires-god-ruling", "partially-applied", "application-failed"].includes(plan.status))
    ? "The result is recorded. Follow the next combat input." : feedback;
  const reload = useCallback(async (id = selectedRef.current) => {
    const version = ++generation.current;
    setLoading(true);
    try {
      const latest = await readCombatScreen(scope, id);
      if (version === generation.current) { setData(latest); setStale(false); }
    } catch (error) {
      if (version === generation.current) { setStale(true); setFeedback(error instanceof Error ? error.message : "Live information could not be reloaded. Retry to reconnect."); }
    } finally { if (version === generation.current) setLoading(false); }
  }, [scope]);
  const run = useCallback(async (operation: () => Promise<unknown>, success: string) => {
    if (mutation.current) return false;
    mutation.current = true; setBusy(true);
    let confirmed = false;
    try {
      const result = object(await operation()); confirmed = true;
      setFeedback(["requires-god-ruling", "partially-applied"].includes(String(result.status)) ? "A specific G.O.D. ruling is needed. Use the next combat input to open it."
        : result.status === "awaiting-response" ? "A response must be resolved before applying this result."
        : result.status === "applied" ? "The result was recorded. See Recent activity."
        : result.status === "awaiting-completion" ? "The defense added Initiative. The remaining timing must finish before consequences apply." : success);
    }
    catch (error) { setFeedback(error instanceof Error ? error.message : "The command could not be confirmed. Inspect the current state before retrying."); }
    finally { mutation.current = false; setBusy(false); await reload(); }
    return confirmed;
  }, [reload]);
  const selected = data.projection?.entities.find((entity) => entity.participantId === selectedId);
  const selectedRoster = data.roster.find((entry) => entry.participantId === selectedId);
  const information = data.information?.entity.participantId === selectedId ? data.information : null;
  const disabled = busy || loading || stale || connection !== "live" || data.pause.frozen || !!data.projection?.closed;
  const back = scope.role === "god" ? `/heavens/tabletop?campaign=${data.context.campaignId}&session=${data.context.sessionId}&scene=${data.context.sceneId}&workspace=scenes&encounter=${scope.encounterId}` : `/realms/tabletop?character=${scope.characterId}`;
  const declarations = data.projection?.declarations ?? [];
  const choose = useCallback((id: number) => { selectedRef.current = id; setSelectedId(id); void reload(id); }, [reload]);
  const followNextInput = useCallback(async () => {
    switch (nextInput.kind) {
      case "inspect":
        choose(nextInput.participantId);
        setCommand(nextInput.focus === "response" ? "Defend" : "Attack");
        setFocus((previous) => ({ participantId: nextInput.participantId, kind: nextInput.focus, planId: nextInput.planId, sequence: (previous?.sequence ?? 0) + 1 }));
        break;
      case "resolve": return run(() => nextInput.firearmId ? applyCombatFirearmResult(scope, nextInput.firearmId) : prepareCombatResult(scope, nextInput.declarationId), "The result is ready for review.");
      case "advance": return run(() => advanceEncounterInitiativeTimeline(scope.encounterId, data.projection!.stateToken), "Combat advanced to the next engine event.");
      case "round": return run(() => advanceEncounterInitiativeRound(scope.encounterId, false, data.projection!.stateToken), "Next round started with preserved pending work and debt.");
      case "trigger": return run(() => commitCombatFirearmTrigger(scope, nextInput.attackId), "Firing committed with the original declaration Roll.");
    }
  }, [choose, data.projection, nextInput, run, scope]);
  useEffect(() => {
    if (!automatic || scope.role !== "god" || disabled || !operations) return;
    const key = automaticCombatInputKey(nextInput, data.projection!.stateToken);
    if (!key || automaticAttempts.current.has(key)) return;
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active || mutation.current || automaticAttempts.current.has(key)) return;
      automaticAttempts.current.add(key);
      // A fresh authorized read is required between events. Failed/stale requests
      // stop automation and require the G.O.D. to deliberately restart it.
      if (await followNextInput() === false) setAutomatic(false);
    });
    return () => { active = false; };
  }, [automatic, scope.role, disabled, operations, nextInput, data.projection, followNextInput]);
  return <main className={styles.page} data-combat-screen={scope.role}>
    <header className={styles.header}><div><p className={styles.eyebrow}>SERRIAN TIDE · {scope.role === "god" ? "G.O.D." : "PLAYER"} COMBAT</p><h1>{data.title}</h1></div><div className={styles.bar}>
      <TabletopLiveRefresh {...(scope.role === "god" ? { mode: "god" as const, campaignId: data.context.campaignId } : { mode: "player" as const, characterId: scope.characterId, scope: "console" as const })} onRefresh={() => void reload()} onStatus={setConnection} />
      <Link href={back}>{scope.role === "god" ? "Back to Scene" : "Player Tabletop"}</Link><button className="st-button" disabled={loading} onClick={() => void reload()}>{loading ? "Refreshing…" : "Refresh"}</button>
      {scope.role === "god" && (data.pause.canFreeze || data.pause.canResume) ? <button className="st-button is-secondary" disabled={busy || stale || connection !== "live"} onClick={() => void run(() => setEncounterCombatFrozen(scope.encounterId, !data.pause.frozen, data.pause.revision), data.pause.frozen ? "Combat resumed." : "Combat frozen.")}>{data.pause.frozen ? "Resume Combat" : "Freeze Combat"}</button> : null}
      {scope.role === "god" && data.projection ? <a href="#combat-closeout" onClick={() => { const detail = document.getElementById("combat-closeout"); if (detail instanceof HTMLDetailsElement) detail.open = true; }}>{data.status === "completed" ? "XP & award history" : "End Combat & XP"}</a> : null}
      {scope.role === "god" && data.status !== "completed" ? <ForceEndDialog disabled={busy || connection !== "live"} onEnd={(note) => run(() => forceEndCombat(scope.encounterId, note), "Combat ended by G.O.D. override. Unfinished work was cancelled; spent resources and history were preserved.")} /> : null}
    </div></header>
    <p className={`${styles.notice} ${data.pause.frozen ? styles.paused : ""}`} role="status">{combatMessage(combatScreenPrompt(data, selected))}</p>
    {connection === "reconnecting" || stale ? <p className={`${styles.notice} ${styles.error}`} role="alert">Connection interrupted. The last information stays visible. Commands wait for a fresh server response; nothing will be resubmitted automatically.</p> : null}
    <p className={`${styles.notice} ${styles.feedback}`} role="status">{currentFeedback ? combatMessage(currentFeedback) : "Choices and results are recorded as combat progresses."}</p>
    <ConditionAlerts key={`${scope.role}:${scope.encounterId}:${scope.role === "player" ? scope.characterId : "owner"}`}
      storageKey={`combat-condition-alerts:${scope.role}:${scope.encounterId}:${scope.role === "player" ? scope.characterId : "owner"}`}
      alerts={data.projection?.alerts ?? []} onInspect={choose} />
    {scope.role === "god" && data.projection && !data.projection.closed ? <section className={`${styles.notice} ${styles.nextInput}`} aria-label="Next combat input"><div><h2>{nextInput.kind === "inspect" && nextInput.focus === "action" ? nextInput.label : "What happens next"}</h2><p>{combatMessage(nextInput.explanation)}</p>{data.projection.runtime.timelineInitiative === 0 ? <p>{nextInput.kind === "round" ? `Round ${data.projection.runtime.roundNumber} is complete. Start the next round below.` : "Initiative has reached 0. Finish the result or ruling shown here; Next round appears when the remaining outcomes are settled."}</p> : null}</div>
      {nextInput.kind !== "wait" && nextInput.kind !== "review" ? <button className="st-button is-primary" disabled={disabled || !operations} onClick={followNextInput}>{nextInput.label}</button> : null}
      <label className={styles.check}><input type="checkbox" checked={automatic} onChange={(event) => { if (event.target.checked) automaticAttempts.current.clear(); setAutomatic(event.target.checked); }} /> Automatic flow</label><p className={styles.muted}>{automatic ? "Timing and calculations run automatically. Review damage before it applies; misses are recorded in Recent activity." : "Enable Automatic flow to advance timing and prepare attack reports for approval."}</p>
    </section> : null}
    {scope.role === "god" && nextInput.kind === "review" ? (operations ?? operationRead?.value)?.plans.filter((plan) => plan.id === nextInput.planId).map((plan) => plan.sourceKind === "spell"
      ? <SpellReport key={attackReportSignature(plan)} encounterId={scope.encounterId} plan={plan} disabled={disabled || !operations} refresh={() => reload()} />
      : <AttackReport key={attackReportSignature(plan)} encounterId={scope.encounterId} plan={plan} disabled={disabled || !operations} refresh={() => reload()} />) : null}
    {scope.role === "god" && data.projection ? <CloseoutPanel encounterId={scope.encounterId} token={data.projection.stateToken} encounterEnded={data.status === "completed"}
      resultRevision={JSON.stringify(data.projection.declarations.map((entry) => [entry.id, entry.status]))}
      disabled={busy || loading || stale || connection !== "live" || data.pause.frozen || !operations} operations={operations}
      onInspect={(participantId, planId) => { choose(participantId); setFocus((previous) => ({ participantId, kind: "ruling", planId, sequence: (previous?.sequence ?? 0) + 1 })); }}
      refresh={() => reload()} /> : null}
    <div className={scope.role === "player" ? styles.playerLayout : styles.layout}>
      {scope.role === "god" ? <>
      <section className={styles.window} aria-label="Combatants"><div className={styles.bar}><h2>{scope.role === "god" ? "Combatants" : "Targets"}</h2>{data.projection ? <span className={styles.muted}>Round {data.projection.runtime.roundNumber} · Initiative {data.projection.runtime.timelineInitiative}</span> : null}</div>
        <div className={styles.cards}>{data.roster.map((entry) => {
          const entity = data.projection?.entities.find(({ participantId }) => participantId === entry.participantId);
          const ready = entity && (entity.canActNow || entity.canRespondNow);
          const picked = scope.role === "god" ? selectedId === entry.participantId : target === String(entry.participantId);
          return <button className={`${styles.card} ${ready ? styles.ready : styles.unavailable}`} key={entry.participantId} aria-pressed={picked} onClick={() => scope.role === "god" ? choose(entry.participantId) : setTarget(String(entry.participantId))}>
            <strong>{entry.name}</strong><b>{entity?.currentInitiative ?? "—"}</b><span>{entity ? combatMessage(entity.statusText) : entry.enrolled ? "Waiting for shared combat information." : "Not enrolled in Initiative."}</span>
            {entity?.currentAction ? <span>{entity.currentAction.label} · {entity.currentAction.remaining} remaining</span> : null}
          </button>;
        })}</div>{!data.roster.length ? <p className={styles.muted}>The encounter roster is empty. Add combatants below.</p> : null}
      </section>
      </> : null}
      <section className={styles.window} aria-label="Selected combatant detail"><h2>{selected?.name ?? selectedRoster?.name ?? "Select a combatant"}</h2>
        {selected ? <p className={selected.condition.status === "able" ? styles.muted : styles.notice}>{selected.condition.status === "able" ? selected.participation.departed ? (selected.participation.departureKind === "surrender" ? "Surrendered / yielded: " : "Withdrawn: ") + selected.participation.reason : "In combat" : combatMessage(combatConditionMessage(selected.condition)!)} · {selected.canControl ? "You control this combatant." : "Its Player chooses its actions."}</p> : null}
        {information ? <CombatResources information={information} /> : <p className={styles.muted}>{loading ? "Loading information…" : "Information becomes available after Initiative enrollment."}</p>}
        {selected?.limbConditions.map((limb) => <p className={`${styles.notice} ${styles.error}`} key={limb.poolKey}>{limb.name} incapacitated — this limb cannot be used.</p>)}
        {selected?.currentAction ? <p className={styles.notice}>{selected.currentAction.label}: {selected.currentAction.remaining} Initiative remaining; expected finish {selected.currentAction.expectedFinish}.</p> : null}
        {selected?.canControl ? <nav className={styles.commands} aria-label="Combat commands">{COMBAT_COMMANDS.map((entry) => <button className="st-button" key={entry} aria-pressed={command === entry} onClick={() => setCommand(entry)}>{entry}</button>)}</nav> : null}
        <div ref={commandRef} tabIndex={-1}>{selected?.canControl ? <CommandPanel scope={scope} entity={selected} data={data} command={command} target={target} setTarget={setTarget} disabled={disabled} refresh={() => reload()} /> : <p>{selected ? `${selected.name}'s Player chooses actions on their combat screen. You can inspect information and make G.O.D. rulings here.` : "Initialize Initiative to choose combat actions."}</p>}</div>
        {scope.role === "god" && selected && !selected.canControl ? <details><summary>Player source rulings</summary><nav className={styles.commands} aria-label="Player source rulings">{(["Cast", "Item", "Ability", "Called Shot"] as const).map((entry) => <button className="st-button" key={entry} onClick={() => setCommand(entry)}>{entry}</button>)}</nav><CommandPanel scope={scope} entity={selected} data={data} command={command} target={target} setTarget={setTarget} disabled={disabled} refresh={() => reload()} /></details> : null}
        <div ref={operationRef} tabIndex={-1}>{selected ? <OperationPanel scope={scope} data={data} entity={selected} operations={operationRead?.value ?? null} focus={focus} disabled={busy || loading || stale || connection !== "live" || data.pause.frozen || !operations} refresh={() => reload()} /> : null}</div>
        {scope.role === "god" && data.status !== "completed" && !data.projection?.closed ? <details open={!data.initialized}><summary>Roster &amp; combat setup</summary>
          {!data.initialized ? <div className={styles.notice}>
            <p>Session: {data.context.sessionStatus} · Scene: {data.context.sceneStatus} · Encounter: {data.status}.</p>
            <p id="combat-setup-guidance">{data.context.sessionStatus === "completed" || data.context.sceneStatus === "completed"
              ? "Return to Tabletop to review and reopen the completed Session or Scene before starting combat."
              : data.context.sessionStatus !== "active" ? "Start the Session, then the Scene and encounter. Finally, review movement and initialize combat."
              : data.context.sceneStatus !== "active" ? "Start the Scene, then the encounter. Finally, review movement and initialize combat."
              : data.status !== "active" ? "Start the encounter, then review movement and initialize combat."
              : !data.roster.length ? "Add at least one combatant before initializing combat."
              : data.capacities.some((entry) => !!entry.error) ? "Correct the combatant Movement or Dexterity errors below before initializing combat."
              : "Review each combatant's movement, then initialize combat."}</p>
            <div className={styles.actions}>
              {data.context.sessionStatus === "planned" ? <button className="st-button" disabled={disabled} onClick={() => void run(() => startCampaignSession(data.context.sessionId), "Session started. Start the Scene next.")}>Start Session</button> : null}
              {data.context.sceneStatus === "planned" ? <button className="st-button" disabled={disabled || data.context.sessionStatus !== "active"} onClick={() => void run(() => startCampaignSessionScene(data.context.sceneId), "Scene started. Start the encounter next.")}>Start Scene</button> : null}
            </div>
          </div> : null}
          <CreaturePicker encounterId={scope.encounterId} initialized={data.initialized} disabled={disabled} onAdded={() => reload()} />
          <div className={styles.fields}><label className="st-field">Add from Scene<select className="st-control" value={arrival} onChange={(event) => setArrival(event.target.value)}><option value="">Choose a Character or NPC</option>{data.setup?.selectedEncounter?.availableSceneMembers.map((entry) => <option key={entry.characterId} value={entry.characterId}>{entry.name}</option>)}</select></label></div>
          <div className={styles.actions}><button className="st-button" disabled={disabled || !arrival} onClick={() => void run(() => addCampaignSessionEncounterParticipant(scope.encounterId, Number(arrival)), "Combatant added.")}>Add combatant</button>
          {selectedRoster && !selectedRoster.enrolled && data.initialized ? <button className="st-button" disabled={disabled} onClick={() => void run(() => enrollLateEncounterInitiativeParticipant(scope.encounterId, selectedRoster.participantId), "Combatant enrolled at the ongoing fight's position.")}>Enroll selected combatant</button> : null}
          {data.status === "planned" ? <button className="st-button is-primary" disabled={disabled || data.context.sceneStatus !== "active" || data.context.sessionStatus !== "active"} onClick={() => void run(() => startCampaignSessionEncounter(scope.encounterId), "Encounter started. Review movement and initialize Initiative.")}>Start encounter</button> : null}</div>
          {!data.initialized ? <><div className={styles.fields}>{data.capacities.map((capacity) => <label className="st-field" key={capacity.characterId}>{data.roster.find((entry) => entry.participantId === capacity.characterId)?.name} movement<select className="st-control" value={modes[capacity.characterId] ?? capacity.movementModes[0]?.movementMode ?? ""} onChange={(event) => setModes({ ...modes, [capacity.characterId]: event.target.value })}>{capacity.movementModes.map((mode) => <option key={mode.movementMode} value={mode.movementMode}>{mode.movementMode} · {mode.normalTotalInitiative} Initiative</option>)}</select>{capacity.error ? <span>{capacity.error}</span> : null}</label>)}</div><button className="st-button is-primary" aria-describedby="combat-setup-guidance" disabled={disabled || data.context.sessionStatus !== "active" || data.context.sceneStatus !== "active" || data.status !== "active" || !data.roster.length || data.capacities.some((entry) => !!entry.error)} onClick={() => void run(() => initializeEncounterInitiative(scope.encounterId, data.capacities.map((entry) => ({ characterId: entry.characterId, movementMode: modes[entry.characterId] ?? entry.movementModes[0]?.movementMode }))), "Initiative started.")}>Initialize combat</button></> : null}
        </details> : null}
      </section>
    </div>
    <section className={`${styles.window} ${styles.activity}`} aria-label="Combat activity"><h2>Recent activity</h2>{!declarations.length ? <p className={styles.muted}>No revealed actions yet.</p> : <ol>{declarations.slice(-5).reverse().map((entry) => <li key={entry.id}><strong>{entry.actorName}: {entry.lockedSnapshot?.label ?? entry.draft.label}</strong> · {combatActionStatus(entry)}{entry.timing ? ` · ${entry.timing.remainingInitiativeCost} Initiative remaining` : ""}
      {operations?.rolls.filter((roll) => roll.pendingActionId === entry.pendingActionId).map((roll) => <p key={roll.id}>{roll.reactionId ? `${roll.label}: ` : ""}{combatRollSummary(roll)}</p>)}
      {operations?.outcomes.filter((outcome) => outcome.declarationId === entry.id).map((outcome) => <p key={outcome.id}>{outcome.target}: {outcome.summary}</p>)}
    </li>)}</ol>}
      <details><summary>Full authorized history</summary><ol>{declarations.flatMap((entry) => entry.events.map((event) => <li key={event.id}><strong>{entry.actorName} · {entry.lockedSnapshot?.label ?? entry.draft.label}</strong>: {combatMessage(event.reason || event.toStatus.replaceAll("-", " "))}</li>))}</ol></details>
    </section>
  </main>;
}
