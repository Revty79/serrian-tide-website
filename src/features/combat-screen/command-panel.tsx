"use client";
import { useEffect, useRef, useState } from "react";
import { cancelPlayerCombatRulingRequest, submitPlayerCombatRulingRequest } from "@/app/realms/tabletop/player-combat-actions";
import { readCombatCommandSources, readCombatItemAbilityOptions, readCombatSpellOptions, readCombatTargetAnatomy, previewCombatChoice, submitCombatChoice } from "./command-actions";
import type { CombatChoice, CombatSubmission } from "./choice-types";
import type { CombatCommand, CombatEntity, CombatScreenData, CombatScreenScope } from "./screen-types";
import { RollFields, emptyRoll, rollInput, combatMessage, type RollDraft } from "./form-controls";
import { MovementPanel } from "./movement-panel";
import { DefensePanel } from "./defense-panel";
import { SourceRuling } from "./source-ruling";
import { FirearmControls } from "./firearm-controls";
import { firearmGuidance } from "./firearm-guidance";
import { MagazineFillControls } from "./magazine-fill-controls";
import { MeleeDrawControls } from "./melee-draw-controls";
import { EffectOptions } from "./effect-options";
import { TargetDropdowns } from "./target-dropdowns";
import styles from "./combat-screen.module.css";
import { initiativeAffordabilityIssue } from "@/features/tabletop-operations/initiative-affordability";
import { projectileWeaponFamily } from "@/features/items/firearm-classification";
type Sources = Awaited<ReturnType<typeof readCombatCommandSources>>;
type Preview = Awaited<ReturnType<typeof previewCombatChoice>>;
type Draft = { source: string; targets: number[]; groups: Record<string, number[]>; applications: Record<string, { poolKey?: string; hitLocationNumber?: number }>;
  location: string; objective: string; penalty: string; reason: string; mode: string; aim: string; duration: string; weaponHands: string; rangeMode: "melee" | "ranged"; rangeDistance: string; rangeUnit: string; beyondLongModifier: string; beyondLongReason: string; roll: RollDraft };
const blank: Draft = { source: "", targets: [], groups: {}, applications: {}, location: "", objective: "", penalty: "", reason: "", mode: "", aim: "0", duration: "1", weaponHands: "", rangeMode: "melee", rangeDistance: "", rangeUnit: "", beyondLongModifier: "", beyondLongReason: "", roll: emptyRoll };
const sourceKey = (source: Sources["sources"][number]) => `${source.kind}/${source.ref}/${source.instanceId ?? "stack"}`;
export function CommandPanel({ scope, entity, data, command, setCommand, target: selectedTarget, setTarget, disabled, refresh }: { scope: CombatScreenScope; entity: CombatEntity; data: CombatScreenData;
  command: CombatCommand; setCommand: (value: CombatCommand) => void; target: string; setTarget: (value: string) => void; disabled: boolean; refresh: () => Promise<void> }) {
  const key = `${entity.participantId}:${command}`;
  const attackCommand = command === "Attack" || command === "Called Shot";
  const target = attackCommand && Number(selectedTarget) === entity.participantId ? "" : selectedTarget;
  const [drafts, setDrafts] = useState<Record<string, Draft>>({}), [cache, setCache] = useState<Record<number, Sources>>({});
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [lastRequestKey, setLastRequestKey] = useState("");
  const [checked, setChecked] = useState<{ key: string; sourceKey: string; value: Preview } | null>(null);
  const [previewError, setPreviewError] = useState<{ key: string; message: string } | null>(null), [previewRetry, setPreviewRetry] = useState(0);
  const [spell, setSpell] = useState<{ key: string; value: Awaited<ReturnType<typeof readCombatSpellOptions>> } | null>(null);
  const [itemMagic, setItemMagic] = useState<{ key: string; value: Awaited<ReturnType<typeof readCombatItemAbilityOptions>> } | null>(null);
  const [anatomy, setAnatomy] = useState<{ id: number; entries: Awaited<ReturnType<typeof readCombatTargetAnatomy>> } | null>(null);
  const submitted = useRef<Record<string, CombatSubmission>>({}), running = useRef(false), revision = useRef(0);
  const sources = cache[entity.participantId] ?? null;
  const options = sources?.sources.filter((source) => command === "Cast" ? source.kind === "spell" : command === "Item" ? source.kind === "item" : command === "Ability" ? ["derived-ability", "creature-ability"].includes(source.kind) : ["weapon", "creature-attack"].includes(source.kind)) ?? [];
  const available = options.filter((entry) => !entry.unavailable);
  const stored = drafts[key];
  const automaticSource = available.length === 1 ? sourceKey(available[0]) : "";
  const availableSourceKeys = JSON.stringify(available.map(sourceKey));
  const storedSourceIsAvailable = !!stored?.source && available.some((entry) => sourceKey(entry) === stored.source);
  const draft = { ...(stored ?? { ...blank, roll: scope.role === "god" ? { method: "digital" as const, value: "" } : emptyRoll }),
    source: stored ? storedSourceIsAvailable ? stored.source : "" : automaticSource };
  const source = available.find((entry) => sourceKey(entry) === draft.source);
  const firearm = source?.instanceId ? sources?.firearms?.firearms.find((entry) => entry.itemInstanceId === source.instanceId) : null;
  const projectileFamily = projectileWeaponFamily(firearm?.canonical.weaponType ?? "");
  const currentSpell = spell?.key === `${entity.participantId}:${draft.source}` ? spell.value : null;
  const currentItemMagic = itemMagic?.key === `${entity.participantId}:${draft.source}` ? itemMagic.value : null;
  const magicGroups = command === "Cast" ? currentSpell?.groups ?? [] : currentItemMagic?.groups ?? [];
  const groups = magicGroups.map((group) => ({ ...group, selected: group.kind === "aoe" ? [] : group.selfTargeted ? [entity.participantId] : draft.groups[group.id] ?? [] }));
  const itemDirectTargets = command === "Item" && (currentItemMagic?.requiresGenericTarget === true || !groups.length)
    ? [...new Set([...(target ? [Number(target)] : []), ...draft.targets])]
    : [];
  const magicTargets = groups.length ? [...new Set(groups.flatMap((group) => group.selected))] : [];
  const targets = command === "Cast" ? magicTargets : command === "Item" ? [...new Set([...itemDirectTargets, ...magicTargets])] : command === "Ability" ? [...new Set([...(target ? [Number(target)] : []), ...draft.targets])] : target ? [Number(target)] : [];
  const location = anatomy?.id === Number(target) ? anatomy.entries.find((entry) => String(entry.number) === draft.location) : null;
  const ruling = sources?.requests.find((entry) => entry.requestType === "called-shot" && entry.status === "approved" && !entry.linkedDeclarationId && entry.sourceRef === source?.ref && entry.sourceInstanceId === source?.instanceId && entry.targetParticipantId === Number(target) && entry.frozenRequest.locationNumber === location?.number);
  const proposedDistance = draft.rangeDistance === "" ? null : Number(draft.rangeDistance);
  const proposedUnit = draft.rangeUnit.trim().toLowerCase();
  const proposedMode = firearm ? "ranged" : draft.rangeMode;
  const distanceRequests = sources?.requests.filter((entry) => {
    if (entry.requestType !== "weapon-distance" || entry.sourceRef !== source?.ref || entry.sourceInstanceId !== source?.instanceId || entry.targetParticipantId !== Number(target)) return false;
    const frozen = entry.frozenRequest;
    return frozen.attackMode === proposedMode
      && (frozen.firingModeId ?? null) === (firearm ? Number(draft.mode) || firearm.state?.selectedFiringModeId || firearm.modes[0]?.id || null : null)
      && (frozen.distance === proposedDistance || entry.ruling.distance === proposedDistance)
      && String(frozen.unit ?? "").toLowerCase() === proposedUnit;
  }) ?? [];
  const distanceRequest = distanceRequests[0] ?? null;
  const distanceApproval = distanceRequest?.status === "approved" && !distanceRequest.linkedDeclarationId && !distanceRequest.linkedFirearmAttackId ? distanceRequest : null;
  const approvedDistance = distanceApproval && typeof distanceApproval.ruling.distance === "number" ? distanceApproval.ruling.distance : proposedDistance;
  const approvedUnit = distanceApproval && typeof distanceApproval.ruling.unit === "string" ? distanceApproval.ruling.unit : draft.rangeUnit;
  const approvedBeyondModifier = distanceApproval && typeof distanceApproval.ruling.beyondLongModifier === "number" ? distanceApproval.ruling.beyondLongModifier : null;
  const approvedBeyondReason = distanceApproval && typeof distanceApproval.ruling.beyondLongReason === "string" ? distanceApproval.ruling.beyondLongReason : draft.beyondLongReason;
  const choice: CombatChoice | null = source ? { participantId: entity.participantId, source, targetIds: targets,
    effectSelections: draft.applications,
    heldIntervention: entity.heldInterventionAvailable,
    ...(command === "Item" ? { itemTargetIds: itemDirectTargets } : {}),
    ...(draft.weaponHands === "1" || draft.weaponHands === "2" ? { weaponHands: Number(draft.weaponHands) as 1 | 2 } : {}),
    ...((command === "Cast" || command === "Item") && groups.length ? { spellSelections: { targetGroups: Object.fromEntries(groups.map((group) => [group.id, group.selected])), applications: draft.applications } } : {}),
    ...(command === "Called Shot" && location ? { calledShot: { locationNumber: location.number, label: location.name, objective: draft.objective,
      ...(scope.role === "god" ? { penalty: draft.penalty === "" ? undefined : Number(draft.penalty), reason: draft.reason } : { requestId: ruling?.id }) } } : {}),
    ...(source.kind === "weapon" ? { range: { attackMode: proposedMode, distance: approvedDistance, unit: approvedUnit, beyondLongModifier: scope.role === "god" && draft.beyondLongModifier !== "" ? Number(draft.beyondLongModifier) : approvedBeyondModifier, beyondLongReason: scope.role === "god" ? draft.beyondLongReason : approvedBeyondReason, distanceRulingRequestId: distanceApproval?.id ?? null } } : {}),
    ...(firearm ? { firearm: { firingModeId: Number(draft.mode) || firearm.state?.selectedFiringModeId || firearm.modes[0]?.id || 0, aimInitiative: Number(draft.aim), firingDurationInitiative: Number(draft.duration) } } : {}) } : null;
  const firingMode = firearm?.modes.find((entry) => entry.id === choice?.firearm?.firingModeId);
  const firearmReady = !firearm || firearmGuidance(firearm, choice?.firearm?.firingModeId).canFire;
  const fingerprint = JSON.stringify(choice), preview = firearmReady && checked?.key === fingerprint ? checked.value : null;
  const authored = preview?.kind === "declaration" ? preview.snapshot.authoredSource : null;
  const injuryTiming = authored?.authoredData.injuryTiming as { explanation?: string | null } | undefined;
  const optionSource = checked?.sourceKey === `${entity.participantId}:${draft.source}` && checked.value.kind === "declaration" ? checked.value.snapshot.authoredSource : null;
  const authoredManualItemAbility = source?.kind === "item" && source.ref.startsWith("item-power:") && authored?.resolutionMode === "manual-god-ruling";
  const needsDistanceApproval = scope.role === "player" && source?.kind === "weapon" && proposedMode === "ranged" && distanceApproval === null;
  const needsRuling = needsDistanceApproval || (preview?.kind === "firearm" ? preview.preview.rulingReasons.length > 0 : !authoredManualItemAbility && (preview?.kind === "declaration" && preview.snapshot.governing?.status === "needs-god-ruling"));
  const needsRoll = preview?.kind === "firearm" || !!authored && ["skill-roll", "attribute-roll", "opposed-roll", "fixed-roll"].includes(authored.resolutionMode);
  const affordabilityIssue = preview ? initiativeAffordabilityIssue(preview.kind === "firearm"
    ? preview.preview.timing.aimInitiativeCost + preview.preview.timing.firingInitiativeCost
    : preview.snapshot.initiativeCost, entity.currentInitiative) : null;
  function edit(change: Partial<Draft>) { setDrafts((values) => ({ ...values, [key]: { ...draft, ...change } })); delete submitted.current[key]; }
  const previewReady = firearmReady && !!choice && !source?.unavailable && !["Hold", "Move", "Defend", "Weapons"].includes(command)
    && (command !== "Cast" && command !== "Item" || !!(command === "Cast" ? currentSpell : currentItemMagic) && groups.every((group) => group.kind === "aoe" || group.selected.length > 0))
    && (!["Attack", "Called Shot"].includes(command) || targets.length > 0)
    && (command !== "Called Shot" || !!location && (scope.role === "god" || !!ruling));
  const previewSourceKey = `${entity.participantId}:${draft.source}`;
  useEffect(() => {
    setDrafts((values) => {
      const persisted = values[key];
      if (persisted?.source && !availableSourceKeys.includes(JSON.stringify(persisted.source))) {
        delete submitted.current[key];
        return { ...values, [key]: { ...persisted, source: "", groups: {}, applications: {}, mode: "" } };
      }
      if (!persisted && automaticSource) return { ...values, [key]: { ...blank, roll: scope.role === "god" ? { method: "digital", value: "" } : emptyRoll, source: automaticSource } };
      return values;
    });
  }, [automaticSource, availableSourceKeys, key, scope.role]);
  useEffect(() => {
    if (!previewReady) return;
    let active = true;
    const timer = setTimeout(() => {
      void previewCombatChoice(scope, JSON.parse(fingerprint) as CombatChoice).then((value) => {
        if (active) { setChecked({ key: fingerprint, sourceKey: previewSourceKey, value }); setPreviewError(null); }
      }).catch((error: unknown) => { if (active) setPreviewError({ key: fingerprint, message: combatMessage(error instanceof Error ? error.message : "Action options could not be read. Retry below.") }); });
    }, 150);
    return () => { active = false; clearTimeout(timer); };
  }, [scope, fingerprint, previewReady, previewSourceKey, previewRetry, data.projection?.stateToken]);
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
    if (source?.kind === "item" && source.ref.startsWith("item-power:")) {
      void readCombatItemAbilityOptions(scope, entity.participantId, Number(source.ref.slice("item-power:".length))).then((value) => { if (active) setItemMagic({ key: `${entity.participantId}:${draft.source}`, value }); })
        .catch((error: unknown) => { if (active) setMessage(combatMessage(error instanceof Error ? error.message : "Item Ability options could not be read.")); });
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
      setLastRequestKey(submitted.current[key].requestKey);
      await submitCombatChoice(scope, submitted.current[key]); setMessage("Choice committed. Follow the shared prompt for what happens next.");
      await refresh();
    } catch (error) { setMessage(combatMessage(error instanceof Error ? error.message : "The command was not confirmed. Retry preserves its original choice and Roll.")); await refresh(); }
    finally { running.current = false; setBusy(false); }
  }
  function selectWeapon(ownershipKey: string) {
    const weapon = sources?.sources.find((entry) => entry.kind === "weapon" && entry.ref === ownershipKey);
    if (!weapon) return;
    const attackKey = `${entity.participantId}:Attack`;
    setDrafts((values) => ({ ...values, [attackKey]: { ...(values[attackKey] ?? blank), source: sourceKey(weapon), mode: "", weaponHands: "" } }));
    delete submitted.current[attackKey];
    setCommand("Attack");
  }
  return <div data-combat-request-key={lastRequestKey}><h3>{command}</h3>
    {attackCommand && entity.canControl ? <button className="st-button" onClick={() => setCommand("Weapons")}>Draw / change weapon</button> : null}
    {command === "Item" && sources ? <MeleeDrawControls key={entity.participantId} scope={scope} entity={entity} options={sources.meleeDraws} disabled={disabled} refresh={refresh} /> : null}
    {command === "Item" && sources?.magazines ? <MagazineFillControls scope={scope} entity={entity} inventory={sources.magazines} disabled={disabled} refresh={refresh} /> : null}
    {sources?.aggregateIssue ? <p className={styles.notice} role="status">Some owned sources could not be loaded: {combatMessage(sources.aggregateIssue)}</p> : null}
    {command === "Weapons" ? <section aria-label="Combat weapons">
      <p>Choose a wielded weapon for your next attack, or draw another owned weapon. Drawing uses its Initiative cost and finishes on the combat timeline.</p>
      {!sources ? <p role="status">Reading your weapons…</p> : <>
        <section aria-label="Wielded weapons"><h4>Wielded weapons</h4>
          {sources.equipment?.wieldedWeapons.length ? <div className={styles.actions}>{sources.equipment.wieldedWeapons.map((weapon) =>
            <button key={weapon.ownershipKey} className="st-button" disabled={disabled || !entity.canControl} onClick={() => selectWeapon(weapon.ownershipKey)}>Use {weapon.itemName} for attack</button>)}</div>
            : <p>No weapon is wielded. Draw one below to make it available for attacks and parries.</p>}
        </section>
        <MeleeDrawControls key={entity.participantId} scope={scope} entity={entity} options={sources.meleeDraws} disabled={disabled} refresh={refresh} expanded />
        {sources.firearms?.firearms.map((weapon) => <details key={weapon.itemInstanceId}>
          <summary>{weapon.itemName} · Copy #{weapon.itemInstanceId}</summary>
          <FirearmControls scope={scope} entity={entity} firearm={weapon} selectedModeId={weapon.state?.selectedFiringModeId ?? weapon.modes[0]?.id ?? 0}
            inventory={sources.magazines} disabled={disabled} refresh={refresh} preparationOnly />
        </details>)}
      </>}
    </section> : command === "Hold" || command === "Move" ? <MovementPanel key={data.projection?.stateToken} scope={scope} participantId={entity.participantId} currentInitiative={entity.currentInitiative} modes={sources?.movement ?? []} disabled={disabled || !entity.canControl || !entity.canActNow} hold={command === "Hold"} holding={entity.participationStatus === "holding"} refresh={refresh} /> : command === "Defend" ? <DefensePanel scope={scope} entity={entity} data={data} sources={sources} disabled={disabled} refresh={refresh} /> : <>
      <div className={styles.fields}><label className="st-field">{command} source<select className="st-control" value={draft.source} disabled={busy} onChange={(event) => edit({ source: event.target.value, groups: {}, applications: {}, mode: "" })}><option value="">Choose an exact source</option>{draft.source && !source ? <option value={draft.source}>Selected source is no longer available</option> : null}{options.map((entry) => <option key={sourceKey(entry)} value={sourceKey(entry)}>{entry.name}{entry.unavailable ? " · unavailable" : ""}</option>)}</select></label>
      {command !== "Cast" && !(command === "Item" && groups.length && !currentItemMagic?.requiresGenericTarget) ? <label className="st-field">Target<select className="st-control" value={target} disabled={busy} onChange={(event) => { setTarget(event.target.value); delete submitted.current[key]; }}><option value="">Choose a target</option>{data.roster.filter((entry) => !attackCommand || entry.participantId !== entity.participantId).map((entry) => <option key={entry.participantId} value={entry.participantId}>{entry.name}</option>)}</select></label> : null}</div>
      {source?.kind === "weapon" ? <fieldset><legend>Weapon distance</legend><div className={styles.fields}><label className="st-field">Attack mode<select className="st-control" value={firearm ? "ranged" : draft.rangeMode} disabled={busy || !!firearm} onChange={(event) => edit({ rangeMode: event.target.value as "melee" | "ranged" })}><option value="melee">Melee / Reach</option><option value="ranged">Ranged / Short-Medium-Long</option></select></label><label className="st-field">Target distance<input className="st-control" type="number" min="0" step="any" value={draft.rangeDistance} onChange={(event) => edit({ rangeDistance: event.target.value })} /></label><label className="st-field">Distance unit<input className="st-control" value={draft.rangeUnit} placeholder="feet" onChange={(event) => edit({ rangeUnit: event.target.value })} /></label>{(!firearm && draft.rangeMode === "ranged") || firearm ? <>{scope.role === "god" ? <><label className="st-field">Beyond Long modifier<input className="st-control" type="number" step="any" value={draft.beyondLongModifier} placeholder="Required only beyond Long" onChange={(event) => edit({ beyondLongModifier: event.target.value })} /></label><label className="st-field">Beyond Long ruling reason<input className="st-control" value={draft.beyondLongReason} onChange={(event) => edit({ beyondLongReason: event.target.value })} /></label></> : null}</> : null}</div>{scope.role === "player" && proposedMode === "ranged" && proposedDistance !== null && proposedUnit ? distanceApproval ? <p className={styles.notice}>G.O.D. approved distance: {approvedDistance} {approvedUnit} · {String(distanceApproval.ruling.label ?? distanceApproval.ruling.band ?? "range resolved")} · adjustment {String(distanceApproval.ruling.adjustment ?? "?")}. This ruling is bound to the exact target and Weapon.</p> : distanceRequest?.status === "pending" || distanceRequest?.status === "clarification-requested" ? <p className={styles.notice}>Distance confirmation is {distanceRequest.status === "pending" ? "waiting for the Campaign-owning G.O.D." : "awaiting your clarification"}. <button className="st-button" type="button" disabled={busy} onClick={() => void cancelPlayerCombatRulingRequest(scope.characterId, scope.encounterId, distanceRequest.id, "Player requested a fresh distance ruling.").then(refresh)}>Cancel request</button></p> : <button className="st-button" type="button" disabled={busy || !source || !target} onClick={async () => { if (!source || !target || proposedDistance === null || !proposedUnit) return; setBusy(true); try { await submitPlayerCombatRulingRequest(scope.characterId, scope.encounterId, { requestType: "weapon-distance", sourceKind: source.kind, sourceRef: source.ref, sourceInstanceId: source.instanceId, targetParticipantId: Number(target), intent: `Confirm ${proposedDistance} ${proposedUnit} for ${source.name}.`, requestedTiming: "Before the ranged attack commits.", attackMode: proposedMode, distance: proposedDistance, distanceUnit: proposedUnit, firingModeId: firearm ? Number(draft.mode) || firearm.state?.selectedFiringModeId || firearm.modes[0]?.id || null : null, idempotencyKey: crypto.randomUUID().replaceAll("-", "") }); setMessage("Distance sent to the Campaign-owning G.O.D. for confirmation."); await refresh(); } catch (error) { setMessage(combatMessage(error instanceof Error ? error.message : "Distance ruling request was not confirmed.")); } finally { setBusy(false); } }}>Request G.O.D. distance confirmation</button> : null}</fieldset> : null}
      {source ? <p className={styles.muted}>{source.description}{source.unavailable ? ` · ${source.unavailable}` : ""}</p> : <p className={styles.muted}>{sources ? "Choose an owned or authored source to see its options." : "Reading combat sources…"}</p>}
      {source?.handedness?.toLowerCase() === "versatile" ? <label className="st-field">Weapon use<select className="st-control" value={draft.weaponHands} disabled={busy} onChange={(event) => edit({ weaponHands: event.target.value })}><option value="">Choose how to use this weapon</option><option value="1">One-handed</option><option value="2">Two-handed</option></select></label> : null}
      {command === "Cast" && currentSpell ? <><p>Mastery: {currentSpell.mastery} · {currentSpell.manaCost} Mana · {currentSpell.initiativeCost} Initiative</p>{groups.map((group) => <fieldset key={group.id}><legend>{group.label} · {group.rangeLabel}{group.kind === "target" ? ` · ${group.capacity} target(s)` : ""}</legend>{group.kind === "aoe" ? <p>{group.shapeLabel ? `${group.shapeLabel}. ` : ""}The Campaign-owning G.O.D. selects affected Encounter participants after declaration.</p> : group.selfTargeted ? <p>Self: {entity.name}</p> : <TargetDropdowns label="Spell target" roster={data.roster} selected={group.selected} maximum={group.capacity ?? undefined} disabled={busy} onChange={(ids) => edit({ groups: { ...draft.groups, [group.id]: ids } })} />}</fieldset>)}</> : null}
      {command === "Item" && currentItemMagic && groups.length ? <>{groups.map((group) => <fieldset key={group.id}><legend>{group.label} · {group.rangeLabel}{group.kind === "target" ? ` · ${group.capacity} target(s)` : ""}</legend>{group.kind === "aoe" ? <p>{group.shapeLabel ? `${group.shapeLabel}. ` : ""}The Campaign-owning G.O.D. selects affected Encounter participants after declaration.</p> : group.selfTargeted ? <p>Self: {entity.name}</p> : <TargetDropdowns label="Magic target" roster={data.roster} selected={group.selected} maximum={group.capacity ?? undefined} disabled={busy} onChange={(ids) => edit({ groups: { ...draft.groups, [group.id]: ids } })} />}</fieldset>)}</> : null}
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
      {firearm ? <><FirearmControls key={firearm.itemInstanceId} scope={scope} entity={entity} firearm={firearm} selectedModeId={choice?.firearm?.firingModeId ?? 0} inventory={sources?.magazines ?? null} disabled={disabled} refresh={refresh} />
        <fieldset><legend>{projectileFamily ? "Aim and shoot" : "Aim and fire"}</legend>
          {firearm.modes.length > 1 ? <label className="st-field">Firing mode<select className="st-control" value={choice?.firearm?.firingModeId} onChange={(event) => edit({ mode: event.target.value, duration: "1" })}>{firearm.modes.map((mode) => <option key={mode.id} value={mode.id ?? ""}>{mode.name}</option>)}</select></label> : <p>Firing mode: {firingMode?.name ?? "Needs configuration"}{firearm.modes.length === 1 ? " (selected automatically)" : ""}</p>}
          <div className={styles.fields}><label className="st-field">Aim Initiative<input className="st-control" type="number" min="0" step="1" value={draft.aim} onChange={(event) => edit({ aim: event.target.value })} /></label>
          {firingMode?.deliveryCadence === "sustained-per-initiative" ? <label className="st-field">Firing duration (includes trigger)<input className="st-control" type="number" min="1" step="1" value={draft.duration} onChange={(event) => edit({ duration: event.target.value })} /></label> : null}</div>
          {projectileFamily ? <p className={styles.muted}>{projectileFamily === "bow" ? `Nock / draw / shoot: ${firearm.canonical.reloadInitiativeCost ?? "Unconfigured"} Initiative` : "Release bolt: 1 Initiative"} &middot; Aim bonus: {Number(draft.aim) * 2}</p> : <p className={styles.muted}>Aim 0 fires without spending extra time aiming. {firingMode?.deliveryCadence === "per-trigger" ? `One trigger uses ${firingMode.roundsPerCadence ?? "?"} round(s).` : firingMode?.deliveryCadence === "sustained-per-initiative" ? "Firing duration controls how long sustained fire continues." : ""} The full Initiative cost and round count appear before you fire.</p>}
          {!firearmReady ? <p>Resolve the weapon status above to see the firing cost and Roll.</p> : !targets.length ? <p>Choose a target above to see the firing cost and Roll.</p> : null}
        </fieldset></> : null}
      {firearmReady && previewError?.key === fingerprint ? <p role="status">{previewError.message} <button className="st-button" disabled={busy} onClick={() => setPreviewRetry((value) => value + 1)}>Retry action options</button></p> : previewReady && !preview ? <p role="status">Reading action cost and Roll options...</p> : null}
      {optionSource ? <EffectOptions scope={scope} source={optionSource} roster={data.roster} values={draft.applications} onChange={(applications) => edit({ applications })} /> : null}
      {preview ? <div className={styles.notice}><p><strong>{entity.name} uses {source?.name}{targets.length ? ` on ${targets.map((id) => data.roster.find((entry) => entry.participantId === id)?.name ?? "Unknown target").join(", ")}` : ""}.</strong></p><p>{preview.kind === "firearm" ? `${preview.preview.timing.aimInitiativeCost} Aim + ${preview.preview.timing.firingInitiativeCost} firing Initiative · ${preview.preview.delivery.declaredRounds} rounds · ${preview.preview.governing.label} target ${preview.preview.finalTarget}` : `${preview.snapshot.initiativeCost} Initiative · ${preview.snapshot.governing?.status === "resolved" ? `Roll target ${preview.snapshot.governing.rollOverTarget} → final target ${preview.finalTarget ?? "?"}` : preview.snapshot.governing?.explanation ?? "No governing Roll required."}`}</p>
        {preview.kind === "firearm" && preview.preview.range ? <p>Distance {preview.preview.range.distance} {preview.preview.range.unit} → {preview.preview.range.label} → range adjustment {preview.preview.range.adjustment >= 0 ? "+" : ""}{preview.preview.range.adjustment}; other modifiers are applied once to final target {preview.preview.finalTarget}.</p> : null}
        {preview.kind === "declaration" && authored?.authoredData && typeof authored.authoredData === "object" && "range" in authored.authoredData ? <p>Distance {String((authored.authoredData.range as { distance?: unknown }).distance)} {String((authored.authoredData.range as { unit?: unknown }).unit)} → {String((authored.authoredData.range as { label?: unknown }).label)} → range adjustment {String((authored.authoredData.range as { adjustment?: unknown }).adjustment)}; other modifiers are applied once in the frozen Roll snapshot.</p> : null}
        {preview.kind === "firearm" && preview.preview.timing.explanation ? <p>{preview.preview.timing.explanation}</p> : null}
        {authored?.resourceCosts.map((cost) => <p key={cost.key}>{cost.amount ?? "G.O.D. ruling"} {cost.kind.replaceAll("-", " ")} · {cost.instruction}</p>)}
        {authored?.warnings.map((warning) => <p key={warning}>{combatMessage(warning)}</p>)}
        {affordabilityIssue ? <p role="status">{affordabilityIssue}</p> : null}
        {injuryTiming?.explanation ? <p>{injuryTiming.explanation}</p> : null}
        {needsRuling ? <p>{needsDistanceApproval ? "A Campaign-owning G.O.D. distance ruling is required before this ranged action can be committed." : "A specific G.O.D. source ruling is needed before this action can be committed."}</p> : <>{needsRoll ? <RollFields value={draft.roll} disabled={busy} onChange={(roll) => edit({ roll })} /> : <p>No Roll required for this source.</p>}<button className="st-button is-primary" disabled={disabled || busy || !!affordabilityIssue || !entity.canControl || !entity.canActNow} onClick={() => void commit()}>{firearm ? "Fire & Roll" : <>Commit {command}{needsRoll ? " & Roll" : ""}</>}</button></>}
      </div> : null}
      {scope.role === "god" && source && ["spell", "item", "derived-ability", "creature-ability"].includes(source.kind) ? <details><summary>Specific source ruling</summary><SourceRuling scope={scope} entity={entity} source={source} sources={sources} authored={authored ?? null} disabled={disabled} refresh={async () => { setChecked(null); setPreviewRetry((value) => value + 1); await refresh(); }} /></details> : null}
    </>}
    <p className={styles.muted}>{entity.canControl ? combatMessage(command === "Defend" ? entity.responseReason ?? "A response is available now." : entity.actionReason ?? (entity.heldInterventionAvailable ? "Holding Initiative. Choose an action only for a legitimate intervention; no ordinary choice is required." : "Choose an action and its exact source.")) : "Its Player retains the action choices. The G.O.D. can inspect information and supply specific rulings."}</p>
    {message ? <p role="status">{message}</p> : null}
  </div>;
}
