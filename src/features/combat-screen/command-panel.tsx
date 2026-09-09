"use client";
import { useEffect, useRef, useState } from "react";
import { submitPlayerCombatRulingRequest } from "@/app/realms/tabletop/player-combat-actions";
import { readCombatCommandSources, readCombatSpellOptions, readCombatTargetAnatomy, previewCombatChoice, submitCombatChoice } from "./command-actions";
import type { CombatChoice, CombatSubmission } from "./choice-types";
import type { CombatCommand, CombatEntity, CombatScreenData, CombatScreenScope } from "./screen-types";
import { RollFields, emptyRoll, rollInput, combatMessage, type RollDraft } from "./form-controls";
import { MovementPanel } from "./movement-panel";
import { DefensePanel } from "./defense-panel";
import { SourceRuling } from "./source-ruling";
import { FirearmControls } from "./firearm-controls";
import { EffectOptions } from "./effect-options";
import { TargetDropdowns } from "./target-dropdowns";
import styles from "./combat-screen.module.css";
type Sources = Awaited<ReturnType<typeof readCombatCommandSources>>;
type Preview = Awaited<ReturnType<typeof previewCombatChoice>>;
type Draft = { source: string; targets: number[]; groups: Record<string, number[]>; applications: Record<string, { poolKey?: string; hitLocationNumber?: number }>;
  location: string; objective: string; penalty: string; reason: string; mode: string; aim: string; duration: string; roll: RollDraft };
const blank: Draft = { source: "", targets: [], groups: {}, applications: {}, location: "", objective: "", penalty: "", reason: "", mode: "", aim: "0", duration: "1", roll: emptyRoll };
const sourceKey = (source: Sources["sources"][number]) => `${source.kind}/${source.ref}/${source.instanceId ?? "stack"}`;
export function CommandPanel({ scope, entity, data, command, target: selectedTarget, setTarget, disabled, refresh }: { scope: CombatScreenScope; entity: CombatEntity; data: CombatScreenData;
  command: CombatCommand; target: string; setTarget: (value: string) => void; disabled: boolean; refresh: () => Promise<void> }) {
  const key = `${entity.participantId}:${command}`;
  const attackCommand = command === "Attack" || command === "Called Shot";
  const target = attackCommand && Number(selectedTarget) === entity.participantId ? "" : selectedTarget;
  const [drafts, setDrafts] = useState<Record<string, Draft>>({}), [cache, setCache] = useState<Record<number, Sources>>({});
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState<{ key: string; sourceKey: string; value: Preview } | null>(null);
  const [previewError, setPreviewError] = useState<{ key: string; message: string } | null>(null), [previewRetry, setPreviewRetry] = useState(0);
  const [spell, setSpell] = useState<{ key: string; value: Awaited<ReturnType<typeof readCombatSpellOptions>> } | null>(null);
  const [anatomy, setAnatomy] = useState<{ id: number; entries: Awaited<ReturnType<typeof readCombatTargetAnatomy>> } | null>(null);
  const submitted = useRef<Record<string, CombatSubmission>>({}), running = useRef(false), revision = useRef(0);
  const sources = cache[entity.participantId] ?? null;
  const options = sources?.sources.filter((source) => command === "Cast" ? source.kind === "spell" : command === "Item" ? source.kind === "item" : command === "Ability" ? ["derived-ability", "creature-ability"].includes(source.kind) : ["weapon", "creature-attack"].includes(source.kind)) ?? [];
  const available = options.filter((entry) => !entry.unavailable);
  const stored = drafts[key];
  const draft = { ...(stored ?? { ...blank, roll: scope.role === "god" ? { method: "digital" as const, value: "" } : emptyRoll }),
    source: stored?.source || (available.length === 1 ? sourceKey(available[0]) : "") };
  const source = options.find((entry) => sourceKey(entry) === draft.source);
  const firearm = source?.instanceId ? sources?.firearms?.firearms.find((entry) => entry.itemInstanceId === source.instanceId) : null;
  const currentSpell = spell?.key === `${entity.participantId}:${draft.source}` ? spell.value : null;
  const groups = currentSpell?.groups.map((group) => ({ ...group, selected: group.kind === "aoe" ? [] : group.selfTargeted ? [entity.participantId] : draft.groups[group.id] ?? [] })) ?? [];
  const targets = command === "Cast" && groups.length ? [...new Set(groups.flatMap((group) => group.selected))] : command === "Cast" || command === "Ability" ? [...new Set([...(target ? [Number(target)] : []), ...draft.targets])] : target ? [Number(target)] : [];
  const location = anatomy?.id === Number(target) ? anatomy.entries.find((entry) => String(entry.number) === draft.location) : null;
  const ruling = sources?.requests.find((entry) => entry.requestType === "called-shot" && entry.status === "approved" && !entry.linkedDeclarationId && entry.sourceRef === source?.ref && entry.sourceInstanceId === source?.instanceId && entry.targetParticipantId === Number(target) && entry.frozenRequest.locationNumber === location?.number);
  const choice: CombatChoice | null = source ? { participantId: entity.participantId, source, targetIds: targets,
    effectSelections: draft.applications,
    heldIntervention: entity.heldInterventionAvailable,
    ...(command === "Cast" ? { spellSelections: { targetGroups: Object.fromEntries(groups.map((group) => [group.id, group.selected])), applications: draft.applications } } : {}),
    ...(command === "Called Shot" && location ? { calledShot: { locationNumber: location.number, label: location.name, objective: draft.objective,
      ...(scope.role === "god" ? { penalty: draft.penalty === "" ? undefined : Number(draft.penalty), reason: draft.reason } : { requestId: ruling?.id }) } } : {}),
    ...(firearm ? { firearm: { firingModeId: Number(draft.mode) || firearm.state?.selectedFiringModeId || firearm.modes[0]?.id || 0, aimInitiative: Number(draft.aim), firingDurationInitiative: Number(draft.duration) } } : {}) } : null;
  const fingerprint = JSON.stringify(choice), preview = checked?.key === fingerprint ? checked.value : null;
  const authored = preview?.kind === "declaration" ? preview.snapshot.authoredSource : null;
  const optionSource = checked?.sourceKey === `${entity.participantId}:${draft.source}` && checked.value.kind === "declaration" ? checked.value.snapshot.authoredSource : null;
  const needsRuling = preview?.kind === "firearm" ? preview.preview.rulingReasons.length > 0 : authored?.resolutionMode === "manual-god-ruling" || preview?.kind === "declaration" && preview.snapshot.governing?.status === "needs-god-ruling";
  const needsRoll = preview?.kind === "firearm" || !!authored && ["skill-roll", "attribute-roll", "opposed-roll"].includes(authored.resolutionMode);
  function edit(change: Partial<Draft>) { setDrafts((values) => ({ ...values, [key]: { ...draft, ...change } })); delete submitted.current[key]; }
  const previewReady = !!choice && !source?.unavailable && !["Hold", "Move", "Defend"].includes(command)
    && (command !== "Cast" || !!currentSpell && groups.every((group) => group.kind === "aoe" || group.selected.length > 0))
    && (!["Attack", "Called Shot"].includes(command) || targets.length > 0)
    && (command !== "Called Shot" || !!location && (scope.role === "god" || !!ruling));
  const previewSourceKey = `${entity.participantId}:${draft.source}`;
  useEffect(() => {
    if (!previewReady) return;
    let active = true;
    const timer = setTimeout(() => {
      void previewCombatChoice(scope, JSON.parse(fingerprint) as CombatChoice).then((value) => {
        if (active) { setChecked({ key: fingerprint, sourceKey: previewSourceKey, value }); setPreviewError(null); }
      }).catch((error: unknown) => { if (active) setPreviewError({ key: fingerprint, message: combatMessage(error instanceof Error ? error.message : "Action options could not be read. Retry below.") }); });
    }, 150);
    return () => { active = false; clearTimeout(timer); };
  }, [scope, fingerprint, previewReady, previewSourceKey, previewRetry]);
  useEffect(() => {
    const version = ++revision.current;
    void readCombatCommandSources(scope, entity.participantId).then((value) => { if (version === revision.current) setCache((prior) => ({ ...prior, [entity.participantId]: value })); })
      .catch((error: unknown) => { if (version === revision.current) setMessage(combatMessage(error instanceof Error ? error.message : "Sources could not be read.")); });
    return () => { if (revision.current === version) revision.current = version + 1; };
  }, [scope, entity.participantId, data]);
  useEffect(() => {
    let active = true;
    if (source?.kind === "spell") {
      const [kind, id] = source.ref.split(":");
      const request = kind === "catalog" ? { kind: "catalog" as const, allocationId: Number(id) } : { kind: "personal" as const, savedSpellId: Number(id) };
      void readCombatSpellOptions(scope, entity.participantId, request).then((value) => { if (active) setSpell({ key: `${entity.participantId}:${draft.source}`, value }); })
        .catch((error: unknown) => { if (active) setMessage(combatMessage(error instanceof Error ? error.message : "Spell options could not be read.")); });
    }
    return () => { active = false; };
  }, [scope, entity.participantId, draft.source, source?.kind, source?.ref]);
  useEffect(() => {
    let active = true;
    if (target) void readCombatTargetAnatomy(scope, Number(target)).then((entries) => { if (active) setAnatomy({ id: Number(target), entries }); }).catch(() => { if (active) setAnatomy(null); });
    return () => { active = false; };
  }, [scope, target]);
  async function commit() {
    if (!choice || running.current) return;
    running.current = true; setBusy(true); setMessage("");
    try {
      submitted.current[key] ??= { choice, requestKey: crypto.randomUUID(), ...(needsRoll ? { roll: rollInput(draft.roll) } : {}) };
      await submitCombatChoice(scope, submitted.current[key]); setMessage("Choice committed. Follow the shared prompt for what happens next.");
      await refresh(); delete submitted.current[key];
    } catch (error) { setMessage(combatMessage(error instanceof Error ? error.message : "The command was not confirmed. Retry preserves its original choice and Roll.")); await refresh(); }
    finally { running.current = false; setBusy(false); }
  }
  return <div><h3>{command}</h3>
    {sources?.aggregateIssue ? <p className={styles.notice} role="status">Some owned sources could not be loaded: {combatMessage(sources.aggregateIssue)}</p> : null}
    {command === "Hold" || command === "Move" ? <MovementPanel scope={scope} participantId={entity.participantId} modes={sources?.movement ?? []} disabled={disabled || !entity.canControl || !entity.canActNow} hold={command === "Hold"} holding={entity.participationStatus === "holding"} refresh={refresh} /> : command === "Defend" ? <DefensePanel scope={scope} entity={entity} data={data} sources={sources} disabled={disabled} refresh={refresh} /> : <>
      <div className={styles.fields}><label className="st-field">{command} source<select className="st-control" value={draft.source} disabled={busy} onChange={(event) => edit({ source: event.target.value, groups: {}, applications: {}, mode: "" })}><option value="">Choose an exact source</option>{draft.source && !source ? <option value={draft.source}>Selected source is no longer available</option> : null}{options.map((entry) => <option key={sourceKey(entry)} value={sourceKey(entry)}>{entry.name}{entry.unavailable ? " · unavailable" : ""}</option>)}</select></label>
      {command !== "Cast" ? <label className="st-field">Target<select className="st-control" value={target} disabled={busy} onChange={(event) => { setTarget(event.target.value); delete submitted.current[key]; }}><option value="">Choose a target</option>{data.roster.filter((entry) => !attackCommand || entry.participantId !== entity.participantId).map((entry) => <option key={entry.participantId} value={entry.participantId}>{entry.name}</option>)}</select></label> : null}</div>
      {source ? <p className={styles.muted}>{source.description}{source.unavailable ? ` · ${source.unavailable}` : ""}</p> : <p className={styles.muted}>{sources ? "Choose an owned or authored source to see its options." : "Reading combat sources…"}</p>}
      {command === "Cast" && currentSpell ? <><p>Mastery: {currentSpell.mastery} · {currentSpell.manaCost} Mana · {currentSpell.initiativeCost} Initiative</p>{groups.map((group) => <fieldset key={group.id}><legend>{group.label} · {group.rangeLabel}{group.kind === "target" ? ` · ${group.capacity} target(s)` : ""}</legend>{group.kind === "aoe" ? <p>{group.shapeLabel ? `${group.shapeLabel}. ` : ""}The area result is calculated and reported when casting finishes. Choosing who is inside the area will come with the mapped tabletop.</p> : group.selfTargeted ? <p>Self: {entity.name}</p> : <TargetDropdowns label="Spell target" roster={data.roster} selected={group.selected} maximum={group.capacity ?? undefined} disabled={busy} onChange={(ids) => edit({ groups: { ...draft.groups, [group.id]: ids } })} />}</fieldset>)}</> : null}
      {command === "Ability" || command === "Cast" && !groups.length ? <details><summary>Additional targets</summary><TargetDropdowns label="Additional target" roster={data.roster} selected={draft.targets} onChange={(targets) => edit({ targets })} /></details> : null}
      {command === "Called Shot" ? <><div className={styles.fields}><label className="st-field">Target location<select className="st-control" value={draft.location} onChange={(event) => edit({ location: event.target.value })}><option value="">Choose an authored location</option>{anatomy?.id === Number(target) ? anatomy.entries.map((entry) => <option key={entry.number} value={entry.number}>{entry.name}</option>) : null}</select></label><label className="st-field">Called Shot objective<input className="st-control" value={draft.objective} onChange={(event) => edit({ objective: event.target.value })} /></label>
      {scope.role === "god" ? <><label className="st-field">G.O.D. penalty<input className="st-control" type="number" min="0" value={draft.penalty} onChange={(event) => edit({ penalty: event.target.value })} /></label><label className="st-field">Penalty reason<input className="st-control" value={draft.reason} onChange={(event) => edit({ reason: event.target.value })} /></label></> : null}</div>
      {scope.role === "player" ? ruling ? <p>G.O.D. approved: penalty {String(ruling.ruling.penalty)} · {String(ruling.ruling.reason)}</p> : <button className="st-button" disabled={disabled || busy || !source || !location || !draft.objective.trim()} onClick={async () => {
        if (!source || !location || running.current) return; running.current = true; setBusy(true);
        try { const identity = `${key}:ruling`; submitted.current[identity] ??= { choice: choice!, requestKey: crypto.randomUUID() };
          await submitPlayerCombatRulingRequest(scope.characterId, scope.encounterId, { requestType: "called-shot", sourceKind: source.kind, sourceRef: source.ref, sourceInstanceId: source.instanceId, targetParticipantId: Number(target), intent: draft.objective, objective: draft.objective, locationNumber: location.number, idempotencyKey: submitted.current[identity].requestKey });
          setMessage("Called Shot sent to the G.O.D. for its penalty ruling."); await refresh();
        } catch (error) { setMessage(combatMessage(error instanceof Error ? error.message : "Ruling request was not confirmed.")); }
        finally { running.current = false; setBusy(false); }
      }}>Request Called Shot ruling</button> : null}</> : null}
      {firearm ? <><div className={styles.fields}><label className="st-field">Firing mode<select className="st-control" value={choice?.firearm?.firingModeId} onChange={(event) => edit({ mode: event.target.value })}>{firearm.modes.map((mode) => <option key={mode.id} value={mode.id ?? ""}>{mode.name}</option>)}</select></label><label className="st-field">Aim Initiative<input className="st-control" type="number" min="0" step="1" value={draft.aim} onChange={(event) => edit({ aim: event.target.value })} /></label><label className="st-field">Firing duration (includes trigger)<input className="st-control" type="number" min="1" step="1" value={draft.duration} onChange={(event) => edit({ duration: event.target.value })} /></label></div><FirearmControls scope={scope} entity={entity} firearm={firearm} disabled={disabled} refresh={refresh} /></> : null}
      {previewError?.key === fingerprint ? <p role="status">{previewError.message} <button className="st-button" disabled={busy} onClick={() => setPreviewRetry((value) => value + 1)}>Retry action options</button></p> : previewReady && !preview ? <p role="status">Reading action cost and Roll options...</p> : null}
      {optionSource ? <EffectOptions scope={scope} source={optionSource} roster={data.roster} values={draft.applications} onChange={(applications) => edit({ applications })} /> : null}
      {preview ? <div className={styles.notice}><p><strong>{entity.name} uses {source?.name}{targets.length ? ` on ${targets.map((id) => data.roster.find((entry) => entry.participantId === id)?.name ?? "Unknown target").join(", ")}` : ""}.</strong></p><p>{preview.kind === "firearm" ? `${preview.preview.aim.initiative} Aim + ${preview.preview.delivery.firingDurationInitiative} firing Initiative · ${preview.preview.delivery.declaredRounds} rounds · ${preview.preview.governing.label} target ${preview.preview.finalTarget}` : `${preview.snapshot.initiativeCost} Initiative · ${preview.snapshot.governing?.status === "resolved" ? `Roll target ${preview.snapshot.governing.rollOverTarget}` : preview.snapshot.governing?.explanation ?? "No governing Roll required."}`}</p>
        {authored?.resourceCosts.map((cost) => <p key={cost.key}>{cost.amount ?? "G.O.D. ruling"} {cost.kind.replaceAll("-", " ")} · {cost.instruction}</p>)}
        {authored?.warnings.map((warning) => <p key={warning}>{combatMessage(warning)}</p>)}
        {needsRuling ? <p>A specific G.O.D. source ruling is needed before this action can be committed.</p> : <>{needsRoll ? <RollFields value={draft.roll} disabled={busy} onChange={(roll) => edit({ roll })} /> : <p>No Roll required for this source.</p>}<button className="st-button is-primary" disabled={disabled || busy || !entity.canControl || !entity.canActNow} onClick={() => void commit()}>Commit {command}{needsRoll ? " & Roll" : ""}</button></>}
      </div> : null}
      {scope.role === "god" && source && ["spell", "item", "derived-ability", "creature-ability"].includes(source.kind) ? <details><summary>Specific source ruling</summary><SourceRuling scope={scope} entity={entity} source={source} sources={sources} authored={authored ?? null} disabled={disabled} refresh={async () => { setChecked(null); setPreviewRetry((value) => value + 1); await refresh(); }} /></details> : null}
    </>}
    <p className={styles.muted}>{entity.canControl ? combatMessage(command === "Defend" ? entity.responseReason ?? "A response is available now." : entity.actionReason ?? (entity.heldInterventionAvailable ? "Holding Initiative. Choose an action only for a legitimate intervention; no ordinary choice is required." : "Choose an action and its exact source.")) : "Its Player retains the action choices. The G.O.D. can inspect information and supply specific rulings."}</p>
    {message ? <p role="status">{message}</p> : null}
  </div>;
}
