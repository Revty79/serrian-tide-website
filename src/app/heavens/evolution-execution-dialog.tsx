"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GuidedField } from "@/components/field-guidance";
import { confirmEvolutionEvaluation, EVOLUTION_STATUS_LABELS, type EvolutionOwner } from "@/features/evolutions/evolution-requirements";
import type { EvolutionExecutionInput, EvolutionExecutionPreview, EvolutionHistoryEntry } from "@/features/evolutions/evolution-execution";
import { appliedRaceEvolutionAdjustments } from "@/features/races/race-evolution-transition";
import type { ActiveHealthView } from "@/features/active-state/models";
import type { CreatureDraft } from "@/features/creatures/models";
import { findEvolutionPreviewIndividuals as findCreatures } from "./creatures/evolution-actions";
import { findEvolutionPreviewIndividuals as findCharacters } from "./races/evolution-actions";
import { executeEvolution, getIndividualEvolutionHistory, getNextEvolutionPaths, previewEvolutionExecution } from "./evolution-execution-actions";
import styles from "./creatures/creature-evolutions.module.css";

const definitionLabels = { attributes: "Attributes", movement: "Movement", attacks: "Attacks", abilities: "Abilities", protections: "Protection", skills: "Skills", forms: "Forms", interactionRules: "Interaction Rules" };
const failure = (error: unknown) => error instanceof Error ? error.message : "Evolution could not be completed.";
const executionKey = () => `evolve-${Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16).padStart(8, "0")).join("")}`;
export function EvolutionExecutionDialog({ kind, sourceId, pathId, pathName, onClose }: { kind: EvolutionOwner; sourceId: number; pathId: number; pathName: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), router = useRouter();
  const request = useRef<EvolutionExecutionInput | null>(null);
  const [search, setSearch] = useState(""), [individuals, setIndividuals] = useState<Array<{ id: number; name: string; campaignName: string }>>([]);
  const [id, setId] = useState(0), [selectedPath, setSelectedPath] = useState(pathId), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [preview, setPreview] = useState<EvolutionExecutionPreview | null>(null), [confirmed, setConfirmed] = useState<string[]>([]);
  const [health, setHealth] = useState(false), [overrides, setOverrides] = useState(false), [message, setMessage] = useState("");
  const [history, setHistory] = useState<EvolutionHistoryEntry[]>([]), [nextPaths, setNextPaths] = useState<Array<{ id: number; name: string }> | null>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => { void (kind === "race" ? findCharacters : findCreatures)(sourceId, search)
      .then(rows => { if (current) setIndividuals(rows); }).catch(reason => { if (current) setError(failure(reason)); }); }, 200);
    return () => { current = false; clearTimeout(timer); };
  }, [kind, sourceId, search]);
  function clearReview() { setPreview(null); setConfirmed([]); setHealth(false); setOverrides(false); request.current = null; }
  async function review(path = selectedPath) {
    setBusy(true); setError(""); clearReview();
    try {
      setPreview(await previewEvolutionExecution(kind, id, path));
      setHistory(await getIndividualEvolutionHistory(id));
    } catch (reason) { setError(failure(reason)); } finally { setBusy(false); }
  }
  async function execute() {
    if (!preview) return;
    setBusy(true); setError("");
    const details = { kind, characterId: id, pathId: preview.pathId, expectedVersion: preview.pathVersion, reviewToken: preview.reviewToken,
      confirmedRequirementKeys: [...confirmed].sort(), confirmHealthConsequences: health, confirmReplaceOverrides: overrides };
    // Retain the same complete request after a network failure. Changed confirmations get a new key.
    if (!request.current || JSON.stringify({ ...request.current, idempotencyKey: undefined }) !== JSON.stringify({ ...details, idempotencyKey: undefined }))
      request.current = { ...details, idempotencyKey: executionKey() };
    try {
      const result = await executeEvolution(request.current);
      setMessage(`${result.event.evidence.individualName} (#${id}) evolved into ${result.event.evidence.destinationName}. ${kind === "race" ? "Race" : "Creature"} Evolution event #${result.event.id}.`);
      setHistory(current => [result.event, ...current.filter(row => row.kind !== result.event.kind || row.id !== result.event.id)]);
      clearReview(); router.refresh();
      setNextPaths(await getNextEvolutionPaths(kind, id));
      setSelectedPath(0);
    } catch (reason) { setError(failure(reason)); } finally { setBusy(false); }
  }
  const eligible = preview ? confirmEvolutionEvaluation(preview.evaluation, confirmed).status === "eligible" : false;
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="evolution-preview-title" onCancel={event => { if (busy) event.preventDefault(); else onClose(); }}>
    <h3 id="evolution-preview-title">Eligibility preview — {pathName}</h3>
    <p>The Campaign-owning G.O.D. can review and permanently evolve the same individual outside active Encounters. Checking eligibility does not perform Evolution.</p>
    <fieldset className={styles.fields} disabled={busy}>
      {nextPaths === null ? <>
        <GuidedField className="st-field" label={kind === "race" ? "Find Character" : "Find individual Creature"} help="Shows up to 30 active individuals using this exact source in Campaigns you run.">
          <input className="st-control" value={search} onChange={event => { setSearch(event.target.value); setId(0); clearReview(); setHistory([]); }} />
        </GuidedField>
        <GuidedField className="st-field" label={kind === "race" ? "Character" : "Individual Creature"} help="The persistent individual keeps its identity, ownership, possessions and history.">
          <select className="st-control" value={id || ""} onChange={event => { setId(Number(event.target.value)); clearReview(); setHistory([]); }}>
            <option value="">Choose an individual</option>{individuals.map(row => <option key={row.id} value={row.id}>{row.name} (#{row.id}) — {row.campaignName}</option>)}
          </select>
        </GuidedField>
      </> : <GuidedField className="st-field" label="Next Evolution" help="These paths come from this same individual's newly saved definition. Each stage needs a new review and confirmation.">
        <select className="st-control" value={selectedPath || ""} onChange={event => { setSelectedPath(Number(event.target.value)); clearReview(); }}>
          <option value="">{nextPaths.length ? "Choose the next path" : "No further paths authored"}</option>{nextPaths.map(path => <option key={path.id} value={path.id}>{path.name} (#{path.id})</option>)}
        </select>
      </GuidedField>}
      <button className="st-button" type="button" disabled={!id || !selectedPath} onClick={() => void review()}>Check eligibility</button>
    </fieldset>
    {error ? <p role="alert">{error}</p> : null}{message ? <p role="status">{message}</p> : null}
    {preview ? <section className={styles.fields} aria-live="polite">
      <h4>{preview.individualName} (#{preview.characterId}): {preview.sourceName} → {preview.destinationName}</h4>
      <p>{preview.pathName} — path #{preview.pathId}, revision {preview.pathVersion}. Source #{preview.sourceId}; destination #{preview.destinationId}.</p>
      <h4>{EVOLUTION_STATUS_LABELS[preview.evaluation.status]}</h4><p>{preview.evaluation.explanation}</p>
      {preview.evaluation.groups.map(group => <section className={styles.card} key={group.groupNumber}>
        <h4>Group {group.groupNumber + 1}: {EVOLUTION_STATUS_LABELS[group.status]}</h4>
        {group.requirements.map(row => <div key={row.key}><p>{EVOLUTION_STATUS_LABELS[row.status]}: {row.explanation}</p>
          {row.confirmable && row.status === "god-review" ? <label className={styles.confirmation}><input type="checkbox" disabled={busy} checked={confirmed.includes(row.key)} onChange={event => setConfirmed(current => event.target.checked ? [...current, row.key] : current.filter(key => key !== row.key))} />Confirm this requirement for this execution ({row.key})</label> : null}
        </div>)}
      </section>)}
      {preview.definitionChanges ? <section className={styles.card}><h4>Definition mechanics: before ? after</h4>
        <p>Size: {preview.definitionChanges.before.size} ? {preview.definitionChanges.after.size}. {kind === "race" ? `Base magic: ${preview.definitionChanges.before.baseMagic ?? 0} ? ${preview.definitionChanges.after.baseMagic ?? 0}.` : `HP multiplier steps: ${preview.definitionChanges.before.hpMultiplierSteps} ? ${preview.definitionChanges.after.hpMultiplierSteps}. Movement steps: ${preview.definitionChanges.before.baseMovementSteps} ? ${preview.definitionChanges.after.baseMovementSteps}. Magic steps: ${preview.definitionChanges.before.baseMagicSteps} ? ${preview.definitionChanges.after.baseMagicSteps}.`}</p>
        {(["attributes", "movement", "attacks", "abilities", "protections", "skills", "forms", "interactionRules"] as const).filter(key => preview.definitionChanges!.before[key] || preview.definitionChanges!.after[key]).map(key => <p key={key}>{definitionLabels[key]}: {preview.definitionChanges!.before[key]?.join(", ") || "None"} ? {preview.definitionChanges!.after[key]?.join(", ") || "None"}</p>)}
      </section> : null}
      {preview.raceTransition ? <section className={styles.card}><h4>Permanent saved mechanics</h4>
        {preview.raceTransition.before.attributes.map(row => <p key={row.attributeKey}>{row.attributeKey}: {row.value} → {preview.raceTransition!.after.attributes.find(after => after.attributeKey === row.attributeKey)?.value}</p>)}
        <p>HP multiplier steps: {preview.raceTransition.before.hpMultiplierSteps} → {preview.raceTransition.after.hpMultiplierSteps}</p>
        <p>Movement steps: {preview.raceTransition.before.baseMovementSteps} → {preview.raceTransition.after.baseMovementSteps}</p>
        <p>Magic steps: {preview.raceTransition.before.baseMagicSteps} → {preview.raceTransition.after.baseMagicSteps}</p>
      </section> : <p>The destination Creature&apos;s complete mechanics replace the current definition snapshot. HP Adjustment remains unchanged.</p>}
      <p>The destination supplies its anatomy, movement, attacks, protections, Skills, abilities and Forms through the existing definition rules. No Form activates. Inventory, equipment, ownership, purchased Skills, Experience, effects, stored damage and injuries remain unchanged.</p>
      <HealthSummary title="Before Evolution" view={preview.beforeHealth} /><HealthSummary title="After Evolution" view={preview.afterHealth} />
      {preview.warnings.map(warning => <p key={warning}>{warning}</p>)}
      {preview.blockers.map(blocker => <p key={blocker} role="alert">{blocker}</p>)}
      <label className={styles.confirmation}><input type="checkbox" disabled={busy} checked={health} onChange={event => setHealth(event.target.checked)} />I have reviewed the permanent mechanical changes, health consequences and equipment fit. Existing damage and injuries will remain.</label>
      {preview.hasIndividualOverrides ? <label className={styles.confirmation}><input type="checkbox" disabled={busy} checked={overrides} onChange={event => setOverrides(event.target.checked)} />I confirm replacing this Creature&apos;s individual mechanical edits with the destination definition and retaining the prior snapshots in history.</label> : null}
      <p>This is permanent. A return transition requires another authored Evolution; there is no Undo.</p>
      <button className="st-button is-primary" type="button" disabled={busy || !eligible || !health || (preview.hasIndividualOverrides && !overrides) || !!preview.blockers.length} onClick={() => void execute()}>Evolve {preview.individualName} into {preview.destinationName}</button>
    </section> : null}
    <EvolutionHistory entries={history} />
    <button className="st-button" type="button" disabled={busy} onClick={onClose}>Close preview</button>
  </dialog>;
}

function HealthSummary({ title, view }: { title: string; view: ActiveHealthView }) {
  return <section className={styles.card}><h4>{title}</h4><p>Total HP: {view.total.remainingHp ?? "Unknown"} remaining / {view.total.maximumHp ?? "Unknown"} maximum. Stored damage: {view.totalDamage}. Unresolved injuries: {view.unresolvedInjuryCount} ({view.injuries.length} recorded).</p>
    {view.tracks.map(track => <p key={track.key}>{track.name}: {track.remainingHp ?? "—"} / {track.maximumHp ?? "—"}; damage {track.damage}{track.orphaned ? " — orphaned historical pool" : ""}. Pool: {track.key}</p>)}
  </section>;
}
export function EvolutionHistory({ entries }: { entries: EvolutionHistoryEntry[] }) {
  if (!entries.length) return null;
  return <section className={styles.fields} aria-label="Individual Evolution history"><h4>Evolution history</h4>{entries.map(event => <details className={styles.card} key={`${event.kind}-${event.id}`}>
    <summary>{event.evidence.sourceName} → {event.evidence.destinationName} — {event.kind} event #{event.id}</summary>
    <p>{new Date(event.executedAt).toLocaleString()} · {event.evidence.actorName} ({event.executedByUserId})</p>
    <p>{event.evidence.pathName}, path #{event.evidence.pathId}, revision {event.evidence.pathVersion}. Individual #{event.characterId}.</p>
    <p>Confirmed requirement keys: {event.evidence.confirmedRequirementKeys.join(", ") || "None required"}.</p>
    {event.evidence.confirmedEvaluation.groups.flatMap(group => group.requirements.map(row => <p key={row.key}>{row.explanation}</p>))}
    {event.evidence.raceTransition ? <RaceAdjustmentHistory transition={event.evidence.raceTransition} /> : null}
    <HealthSummary title="Recorded result" view={event.evidence.afterHealth} />
    {event.snapshots ? <details><summary>Inspect recorded Creature mechanics</summary><p>Preserved HP Adjustment: {event.snapshots.hpAdjustment}</p>
      <SnapshotSummary title="Source baseline" value={event.snapshots.sourceBaseline} /><SnapshotSummary title="Source individual" value={event.snapshots.sourceCurrent} />
      <SnapshotSummary title="Destination baseline" value={event.snapshots.destinationBaseline} /><SnapshotSummary title="Destination individual" value={event.snapshots.destinationCurrent} />
    </details> : null}
  </details>)}</section>;
}
function RaceAdjustmentHistory({ transition }: { transition: NonNullable<EvolutionHistoryEntry["evidence"]["raceTransition"]> }) {
  // Older immutable events already contain both saved states. Do not consult the current path.
  const applied = transition.appliedAdjustments ?? appliedRaceEvolutionAdjustments(transition.before, transition.after);
  const signed = (value: number) => value > 0 ? `+${value}` : `${value}`;
  return <section aria-label="Applied permanent Character changes">
    <p>Applied Attribute adjustments: {Object.entries(applied.attributeAdjustments).map(([key, value]) => `${key} ${signed(value)}`).join(", ") || "None"}.</p>
    <p>Applied step adjustments: HP multiplier {signed(applied.hpMultiplierStepsAdjustment)}, base movement {signed(applied.baseMovementStepsAdjustment)}, base magic {signed(applied.baseMagicStepsAdjustment)}.</p>
    <p>Recorded HP / movement / magic steps: {transition.before.hpMultiplierSteps} / {transition.before.baseMovementSteps} / {transition.before.baseMagicSteps} → {transition.after.hpMultiplierSteps} / {transition.after.baseMovementSteps} / {transition.after.baseMagicSteps}.</p>
  </section>;
}
function SnapshotSummary({ title, value }: { title: string; value: string }) {
  const snapshot = JSON.parse(value) as CreatureDraft;
  return <details className={styles.card}><summary>{title}: {snapshot.core.canonicalName} (#{snapshot.id})</summary>
    <p>Size: {snapshot.core.size}. HP multiplier steps: {snapshot.core.hpMultiplierSteps}. Movement / magic steps: {snapshot.core.baseMovementSteps} / {snapshot.core.baseMagicSteps}.</p>
    <p>Attributes: {snapshot.attributes.map(row => `${row.attributeKey}: ${row.value ?? "Unknown"}`).join(", ")}</p>
    <p>Pools: {snapshot.hpPools.map(row => `${row.poolName} (${row.maximumHp ?? "Unknown"} HP)`).join(", ") || "None"}</p>
    <p>Hit locations: {snapshot.hitLocations.map(row => row.locationName).join(", ") || "None"}</p>
    <p>Attacks: {snapshot.attacks.map(row => `${row.attackName}: ${row.damage ?? "Unspecified"}`).join(", ") || "None"}</p>
    <p>Abilities: {snapshot.abilities.map(row => row.abilityName).join(", ") || "None"}</p>
    <p>Movement: {snapshot.movement.map(row => `${row.movementMode}: ${row.movementValue}`).join(", ") || "None"}</p>
    <p>Skills: {snapshot.skillLinks.map(row => `${row.skillName} (#${row.skillId})`).join(", ") || "None"}</p>
    <p>Protections: {snapshot.defenses.map(row => `${row.defenseType} / ${row.against}: ${row.value ?? "Unspecified"}`).join(", ") || "None"}</p>
    <p>Forms: {snapshot.forms?.map(row => row.name).join(", ") || "None"}</p>
    <details><summary>Full recorded snapshot data</summary><pre className={styles.prose}>{JSON.stringify(snapshot, null, 2)}</pre></details>
  </details>;
}
