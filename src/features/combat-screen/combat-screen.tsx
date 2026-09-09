"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { TabletopLiveRefresh } from "@/features/tabletop-operations/tabletop-live-refresh";
import { setEncounterCombatFrozen } from "@/app/heavens/tabletop/combat-freeze-actions";
import { initializeEncounterInitiative, enrollLateEncounterInitiativeParticipant } from "@/app/heavens/tabletop/initiative-actions";
import { addCampaignSessionEncounterParticipant, startCampaignSessionEncounter } from "@/app/heavens/tabletop/encounter-actions";
import { readCombatScreen } from "./screen-actions";
import { COMBAT_COMMANDS, combatScreenPrompt, type CombatCommand, type CombatScreenData, type CombatScreenScope } from "./screen-types";
import styles from "./combat-screen.module.css";
import { CreaturePicker } from "./creature-picker";
import { CommandPanel } from "./command-panel";
import { OperationPanel } from "./operation-panel";

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
      <div className={styles.resource}><span>Total HP</span><strong>{resources.health?.total.remainingHp ?? "?"} / {resources.health?.total.maximumHp ?? "?"}</strong></div>
      {resources.mana?.pools.map((pool) => <div className={styles.resource} key={pool.system}><span>{pool.system} Mana</span><strong>{pool.currentMana} / {pool.maximumMana}</strong></div>)}
      {!resources.mana ? <div className={styles.resource}><span>Mana</span><strong>Hidden until choices reveal</strong></div> : !resources.mana.pools.length ? <div className={styles.resource}><span>Mana</span><strong>None</strong></div> : null}
      <div className={styles.resource}><span>Initiative</span><strong>{information.entity.currentInitiative}</strong></div>
    </div>
    <div className={styles.locations} aria-label="HP by location">{resources.health?.tracks.filter((track) => track.key !== "total").map((track) => <div className={styles.location} key={track.key}><span>{track.name}</span><strong>{track.remainingHp ?? "?"} / {track.maximumHp ?? "?"}</strong></div>)}</div>
    {resources.effects.conditions.filter((entry) => !entry.resolvedAt).map((entry) => <p className={styles.muted} key={entry.id}>{entry.name}: {entry.description || entry.duration.label}</p>)}
    {resources.issues.map((issue) => <p className={styles.notice} key={issue}>{combatMessage(issue)}</p>)}
  </>;
  const snapshot = object(resources.anatomyAndStatistics), health = object(object(resources.state).health), maximum = object(snapshot.core).totalHp;
  return <><div className={styles.resources}><div className={styles.resource}><span>Total HP</span><strong>{typeof maximum === "number" ? maximum - Number(health.totalDamage ?? 0) : "?"} / {String(maximum ?? "?")}</strong></div><div className={styles.resource}><span>Initiative</span><strong>{information.entity.currentInitiative}</strong></div></div>
    <div className={styles.locations} aria-label="HP by location">{records(snapshot.hpPools).map((pool) => <div className={styles.location} key={String(pool.canonicalId)}><span>{String(pool.poolName)}</span><strong>{typeof pool.maximumHp === "number" ? pool.maximumHp - Number(object(health.poolDamage)[String(pool.canonicalId)] ?? 0) : "?"} / {String(pool.maximumHp ?? "?")}</strong></div>)}</div></>;
}

export function CombatScreen({ scope, initialData }: { scope: CombatScreenScope; initialData: CombatScreenData }) {
  const [data, setData] = useState(initialData);
  const [selectedId, setSelectedId] = useState<number | null>(scope.role === "player" ? scope.characterId : initialData.roster[0]?.participantId ?? null);
  const selectedRef = useRef(selectedId), generation = useRef(0), mutation = useRef(false);
  const [command, setCommand] = useState<CombatCommand>("Attack");
  const [target, setTarget] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [stale, setStale] = useState(false);
  const [connection, setConnection] = useState<"connecting" | "live" | "reconnecting">("connecting");
  const [modes, setModes] = useState<Record<number, string>>({});
  const [arrival, setArrival] = useState("");
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
  async function run(operation: () => Promise<unknown>, success: string) {
    if (mutation.current) return;
    mutation.current = true; setBusy(true); setFeedback("");
    try { await operation(); setFeedback(success); }
    catch (error) { setFeedback(error instanceof Error ? error.message : "The command could not be confirmed. Inspect the current state before retrying."); }
    finally { mutation.current = false; setBusy(false); await reload(); }
  }
  const selected = data.projection?.entities.find((entity) => entity.participantId === selectedId);
  const selectedRoster = data.roster.find((entry) => entry.participantId === selectedId);
  const information = data.information?.entity.participantId === selectedId ? data.information : null;
  const disabled = busy || stale || connection !== "live" || data.pause.frozen || !!data.projection?.closed;
  const back = scope.role === "god" ? `/heavens/tabletop?campaign=${data.context.campaignId}&session=${data.context.sessionId}&scene=${data.context.sceneId}&workspace=scenes&encounter=${scope.encounterId}` : `/realms/tabletop?character=${scope.characterId}`;
  const declarations = data.projection?.declarations ?? [];
  function choose(id: number) { selectedRef.current = id; setSelectedId(id); void reload(id); }
  return <main className={styles.page} data-combat-screen={scope.role}>
    <header className={styles.header}><div><p className={styles.eyebrow}>SERRIAN TIDE · {scope.role === "god" ? "G.O.D." : "PLAYER"} COMBAT</p><h1>{data.title}</h1></div><div className={styles.bar}>
      <TabletopLiveRefresh {...(scope.role === "god" ? { mode: "god" as const, campaignId: data.context.campaignId } : { mode: "player" as const, characterId: scope.characterId, scope: "console" as const })} onRefresh={() => void reload()} onStatus={setConnection} />
      <Link href={back}>{scope.role === "god" ? "Back to Scene" : "Player Tabletop"}</Link><button className="st-button" disabled={loading} onClick={() => void reload()}>{loading ? "Refreshing…" : "Refresh"}</button>
      {scope.role === "god" && (data.pause.canFreeze || data.pause.canResume) ? <button className="st-button is-secondary" disabled={busy || stale || connection !== "live"} onClick={() => void run(() => setEncounterCombatFrozen(scope.encounterId, !data.pause.frozen, data.pause.revision), data.pause.frozen ? "Combat resumed." : "Combat frozen.")}>{data.pause.frozen ? "Resume Combat" : "Freeze Combat"}</button> : null}
    </div></header>
    <p className={`${styles.notice} ${data.pause.frozen ? styles.paused : ""}`} role="status">{combatMessage(combatScreenPrompt(data, selected))}</p>
    {connection === "reconnecting" || stale ? <p className={`${styles.notice} ${styles.error}`} role="alert">Connection interrupted. The last information stays visible. Commands wait for a fresh server response; nothing will be resubmitted automatically.</p> : null}
    {feedback ? <p className={styles.notice} role="status">{combatMessage(feedback)}</p> : null}
    <div className={styles.layout}>
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
      <section className={styles.window} aria-label="Selected combatant detail"><h2>{selected?.name ?? selectedRoster?.name ?? "Select a combatant"}</h2>
        {selected ? <p className={styles.muted}>{selected.condition.status === "able" ? selected.participation.departed ? `Withdrawn: ${selected.participation.reason}` : "In combat" : combatMessage(selected.condition.reason)} · {selected.canControl ? "You control this combatant." : "Its Player chooses its actions."}</p> : null}
        {information ? <CombatResources information={information} /> : <p className={styles.muted}>{loading ? "Loading information…" : "Information becomes available after Initiative enrollment."}</p>}
        {selected?.currentAction ? <p className={styles.notice}>{selected.currentAction.label}: {selected.currentAction.remaining} Initiative remaining; expected finish {selected.currentAction.expectedFinish}.</p> : null}
        <nav className={styles.commands} aria-label="Combat commands">{COMBAT_COMMANDS.map((entry) => <button className="st-button" key={entry} aria-pressed={command === entry} onClick={() => setCommand(entry)}>{entry}</button>)}</nav>
        {selected ? <CommandPanel scope={scope} entity={selected} data={data} command={command} target={target} setTarget={setTarget} disabled={disabled} refresh={() => reload()} /> : <p>Initialize Initiative to choose combat actions.</p>}
        {selected ? <OperationPanel scope={scope} data={data} entity={selected} disabled={busy || stale || connection !== "live" || data.pause.frozen} refresh={() => reload()} /> : null}
        {scope.role === "god" && !data.projection?.closed ? <details><summary>Roster &amp; combat setup</summary>
          <CreaturePicker encounterId={scope.encounterId} initialized={data.initialized} disabled={disabled} onAdded={() => reload()} />
          <div className={styles.fields}><label className="st-field">Add from Scene<select className="st-control" value={arrival} onChange={(event) => setArrival(event.target.value)}><option value="">Choose a Character or NPC</option>{data.setup?.selectedEncounter?.availableSceneMembers.map((entry) => <option key={entry.characterId} value={entry.characterId}>{entry.name}</option>)}</select></label></div>
          <div className={styles.actions}><button className="st-button" disabled={disabled || !arrival} onClick={() => void run(() => addCampaignSessionEncounterParticipant(scope.encounterId, Number(arrival)), "Combatant added.")}>Add combatant</button>
          {selectedRoster && !selectedRoster.enrolled && data.initialized ? <button className="st-button" disabled={disabled} onClick={() => void run(() => enrollLateEncounterInitiativeParticipant(scope.encounterId, selectedRoster.participantId), "Combatant enrolled at the ongoing fight's position.")}>Enroll selected combatant</button> : null}
          {data.status === "planned" ? <button className="st-button is-primary" disabled={disabled || data.context.sceneStatus !== "active" || data.context.sessionStatus !== "active"} onClick={() => void run(() => startCampaignSessionEncounter(scope.encounterId), "Encounter started. Review movement and initialize Initiative.")}>Start encounter</button> : null}</div>
          {!data.initialized ? <><div className={styles.fields}>{data.capacities.map((capacity) => <label className="st-field" key={capacity.characterId}>{data.roster.find((entry) => entry.participantId === capacity.characterId)?.name} movement<select className="st-control" value={modes[capacity.characterId] ?? capacity.movementModes[0]?.movementMode ?? ""} onChange={(event) => setModes({ ...modes, [capacity.characterId]: event.target.value })}>{capacity.movementModes.map((mode) => <option key={mode.movementMode} value={mode.movementMode}>{mode.movementMode} · {mode.normalTotalInitiative} Initiative</option>)}</select>{capacity.error ? <span>{capacity.error}</span> : null}</label>)}</div><button className="st-button is-primary" disabled={disabled || data.status !== "active" || !data.roster.length || data.capacities.some((entry) => !!entry.error)} onClick={() => void run(() => initializeEncounterInitiative(scope.encounterId, data.capacities.map((entry) => ({ characterId: entry.characterId, movementMode: modes[entry.characterId] ?? entry.movementModes[0]?.movementMode }))), "Initiative started.")}>Initialize combat</button>{data.context.sceneStatus !== "active" || data.context.sessionStatus !== "active" ? <p className={styles.muted}>Start the Session and Scene in Tabletop before starting combat.</p> : null}</> : null}
        </details> : null}
      </section>
    </div>
    <section className={`${styles.window} ${styles.activity}`} aria-label="Combat activity"><h2>Recent activity</h2>{!declarations.length ? <p className={styles.muted}>No revealed actions yet.</p> : <ol>{declarations.slice(-5).reverse().map((entry) => <li key={entry.id}><strong>{entry.actorName}: {entry.lockedSnapshot?.label ?? entry.draft.label}</strong> · {entry.status.replaceAll("-", " ")}{entry.timing ? ` · ${entry.timing.remainingInitiativeCost} Initiative remaining` : ""}</li>)}</ol>}
      <details><summary>Full authorized history</summary><ol>{declarations.flatMap((entry) => entry.events.map((event) => <li key={event.id}><strong>{entry.actorName} · {entry.lockedSnapshot?.label ?? entry.draft.label}</strong>: {combatMessage(event.reason || event.toStatus.replaceAll("-", " "))}</li>))}</ol></details>
    </section>
  </main>;
}
