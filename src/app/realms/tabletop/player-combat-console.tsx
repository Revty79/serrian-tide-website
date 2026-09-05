"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { CharacterWeaponGovernanceResult } from "@/features/items/character-weapon-governance";
import type { PlayerCombatConsoleData } from "@/features/tabletop-operations/player-tabletop-console-service";

import {
  cancelPlayerCombatRulingRequest,
  clarifyPlayerCombatRulingRequest,
  commitPlayerFirearmTrigger,
  declarePlayerDefense,
  declarePlayerFirearmAttack,
  declarePlayerWeaponAttack,
  firePlayerFirearmAttack,
  rollPlayerDeclaredAttack,
  rollPlayerDeclaredResponse,
  setPlayerInitiativeDisposition,
  startPlayerFirearmPreparation,
  submitPlayerCombatRulingRequest,
} from "./player-combat-actions";
import styles from "./player-tabletop.module.css";

function submissionKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function titleCase(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function governingLabel(source: unknown): string {
  if (!source || typeof source !== "object" || Array.isArray(source)) return "G.O.D. ruling required";
  const row = source as Record<string, unknown>;
  if (row.kind === "skill" && typeof row.skillName === "string") return `${row.skillName} · ${String(row.originalTarget ?? "?")}%`;
  if (row.kind === "attribute" && typeof row.attributeKey === "string") return `${row.attributeKey} straight Attribute · ${String(row.originalTarget ?? "?")}%`;
  return `${String(row.label ?? "G.O.D. ruling")} · ${String(row.originalTarget ?? "?")}%`;
}

function isResolvedWeaponGovernance(result: CharacterWeaponGovernanceResult | null): result is Extract<
  CharacterWeaponGovernanceResult,
  { status: "resolved-normal" | "resolved-persistent-override" | "resolved-one-action-override" }
> {
  return result?.status === "resolved-normal"
    || result?.status === "resolved-persistent-override"
    || result?.status === "resolved-one-action-override";
}

function canonicalWeaponPath(result: CharacterWeaponGovernanceResult | null): string | null {
  if (!result || result.normalResolution.status !== "resolved") return null;
  return result.normalResolution.selectedAlternative.canonicalPath.rootToEndpoint.map(({ name }) => name).join(" → ");
}

function ResultMessage({ message }: { message: { error: boolean; text: string } | null }) {
  return message ? <p className={message.error ? styles.error : styles.notice} role={message.error ? "alert" : "status"}>{message.text}</p> : null;
}

function useCombatMutation() {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  function run(action: () => Promise<unknown>, success: string) {
    setMessage(null);
    startTransition(() => {
      void action().then(() => {
        setMessage({ error: false, text: success });
        router.refresh();
      }).catch((error: unknown) => setMessage({ error: true, text: error instanceof Error ? error.message : "The combat action could not be completed." }));
    });
  }
  return { busy, message, run };
}

export function PlayerCombatIntentButton({
  characterId,
  combat,
  sourceKind,
  sourceRef,
  sourceInstanceId,
  label,
}: {
  characterId: number;
  combat: PlayerCombatConsoleData;
  sourceKind: string;
  sourceRef: string;
  sourceInstanceId?: number | null;
  label: string;
}) {
  const mutation = useCombatMutation();
  const [intent, setIntent] = useState("");
  return <form className={styles.compactAction} onSubmit={(event) => {
    event.preventDefault();
    mutation.run(() => submitPlayerCombatRulingRequest(characterId, combat.context.encounterId, {
      requestType: "manual-action",
      sourceKind,
      sourceRef,
      sourceInstanceId,
      intent,
      requestedTiming: `Round ${combat.initiative.roundNumber}, Initiative ${combat.initiative.timelineInitiative}`,
      idempotencyKey: submissionKey(),
    }), `${label} intent sent to the G.O.D.`);
  }}>
    <label><span>Combat intent</span><input required maxLength={2000} value={intent} onChange={(event) => setIntent(event.target.value)} placeholder={`How do you want to use ${label}?`} /></label>
    <button type="submit" disabled={mutation.busy || !intent.trim()}>{mutation.busy ? "Sending…" : "Request combat use"}</button>
    <ResultMessage message={mutation.message} />
  </form>;
}

function ResponsePanel({ characterId, combat }: { characterId: number; combat: PlayerCombatConsoleData }) {
  const mutation = useCombatMutation();
  const opportunities = combat.declarations.declarations.flatMap((declaration) => declaration.opportunities
    .filter(({ responderCharacterId, status }) => responderCharacterId === characterId && status === "pending")
    .map((opportunity) => ({ declaration, opportunity })));
  const weapons = combat.defenses.participants.find(({ characterId: id }) => id === characterId)?.weapons ?? [];
  const dodgeAvailable = combat.defenses.dodgeMappings.some(({ reviewState }) => reviewState === "approved");
  const [weaponKey, setWeaponKey] = useState(weapons[0]?.ownershipKey ?? "");
  const selectedWeapon = weapons.find(({ ownershipKey }) => ownershipKey === weaponKey) ?? null;
  if (!opportunities.length) return null;
  return <section className={styles.combatPriority} aria-labelledby="player-response-title">
    <p className={styles.eyebrow}>RESPONSE REQUIRED</p>
    <h2 id="player-response-title">Choose a response before the action can Roll</h2>
    {opportunities.map(({ declaration, opportunity }) => {
      const protectedTarget = declaration.lockedSnapshot?.targetCharacterIds[0] ?? declaration.draft.targetCharacterIds[0] ?? characterId;
      return <article className={styles.combatCard} key={opportunity.id}>
        <h3>{declaration.actorName}: {declaration.lockedSnapshot?.label ?? declaration.draft.label}</h3>
        <p>{opportunity.reason}</p>
        <div className={styles.actionRow}>
          <button disabled={mutation.busy} onClick={() => mutation.run(() => declarePlayerDefense(characterId, combat.context.encounterId, { opportunityId: opportunity.id, reactionType: "no-reaction", protectedTargetParticipantId: protectedTarget }), "No Defense recorded.")}>No Defense</button>
          <button disabled={mutation.busy || !dodgeAvailable} title={dodgeAvailable ? undefined : "No approved Dodge Skill path is available."} onClick={() => mutation.run(() => declarePlayerDefense(characterId, combat.context.encounterId, { opportunityId: opportunity.id, reactionType: "dodge", protectedTargetParticipantId: protectedTarget }), "Dodge declared.")}>Dodge · 1 Initiative</button>
          {weapons.length ? <><select aria-label="Parry or Block Item" value={weaponKey} onChange={(event) => setWeaponKey(event.target.value)}>{weapons.map((weapon) => <option key={weapon.ownershipKey} value={weapon.ownershipKey}>{weapon.name} · {weapon.initiativeCost ?? "ruling"} Initiative</option>)}</select>
            <button disabled={mutation.busy || !selectedWeapon} onClick={() => mutation.run(() => declarePlayerDefense(characterId, combat.context.encounterId, { opportunityId: opportunity.id, reactionType: "parry", protectedTargetParticipantId: protectedTarget, itemId: selectedWeapon!.itemId, instanceId: selectedWeapon!.instanceId }), "Parry declared.")}>Parry</button>
            <button disabled={mutation.busy || !selectedWeapon} onClick={() => mutation.run(() => declarePlayerDefense(characterId, combat.context.encounterId, { opportunityId: opportunity.id, reactionType: "block", protectedTargetParticipantId: protectedTarget, itemId: selectedWeapon!.itemId, instanceId: selectedWeapon!.instanceId }), "Block declared.")}>Block</button></> : null}
        </div>
        {!dodgeAvailable ? <p>Dodge is unavailable because no approved canonical Dodge Skill path exists.</p> : null}
      </article>;
    })}
    <ResultMessage message={mutation.message} />
  </section>;
}

function InitiativePanel({ characterId, combat }: { characterId: number; combat: PlayerCombatConsoleData }) {
  const mutation = useCombatMutation();
  const initiative = combat.initiative;
  return <section className={styles.combatSection} aria-labelledby="player-initiative-title">
    <header><div><p className={styles.eyebrow}>AUTHORITATIVE INITIATIVE</p><h2 id="player-initiative-title">Round {initiative.roundNumber} · Step {initiative.stepNumber}</h2></div><strong>{initiative.currentInitiative} / {initiative.normalTotalInitiative}</strong></header>
    <div className={styles.combatStats}>
      <span>Timeline <strong>{initiative.timelineInitiative}</strong></span><span>Status <strong>{titleCase(initiative.participationStatus)}</strong></span><span>Deferred cost <strong>{initiative.deferredInitiativeCost}</strong></span>
    </div>
    {initiative.pendingAction ? <article className={styles.lockedReview}><strong>{initiative.pendingAction.label}</strong><span>{initiative.pendingAction.initiativeSpent} spent · {initiative.pendingAction.remainingInitiativeCost} remaining · {initiative.pendingAction.additionalInitiativeCost} defense-added · completes at {initiative.pendingAction.expectedCompletionInitiative}</span></article> : null}
    {initiative.canDeclareAction ? <div className={styles.actionRow}><button disabled={mutation.busy} onClick={() => mutation.run(() => setPlayerInitiativeDisposition(characterId, combat.context.encounterId, "hold"), "Initiative is now holding.")}>Hold</button><button disabled={mutation.busy} onClick={() => mutation.run(() => setPlayerInitiativeDisposition(characterId, combat.context.encounterId, "pass"), "Initiative passed for this Encounter.")}>Pass</button></div> : <ul className={styles.blockers}>{initiative.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}
    <ResultMessage message={mutation.message} />
  </section>;
}

function WeaponActions({ characterId, combat }: { characterId: number; combat: PlayerCombatConsoleData }) {
  const mutation = useCombatMutation();
  const weapons = combat.declarations.participants.find(({ characterId: id }) => id === characterId)?.weapons.filter(({ firingModes }) => firingModes.length === 0) ?? [];
  const [weaponKey, setWeaponKey] = useState(weapons[0]?.ownershipKey ?? "");
  const [target, setTarget] = useState(String(combat.targets[0]?.participantId ?? ""));
  const selected = weapons.find(({ ownershipKey }) => ownershipKey === weaponKey) ?? null;
  const selectedGovernance = selected
    ? combat.weaponGovernance.weapons.find(({ itemId }) => itemId === selected.itemId)?.modes.find(({ firingModeId }) => firingModeId === null)?.resolution ?? null
    : null;
  const governanceResolved = isResolvedWeaponGovernance(selectedGovernance);
  const canonicalPath = canonicalWeaponPath(selectedGovernance);
  return <section className={styles.combatSection} aria-labelledby="weapon-actions-title"><header><div><p className={styles.eyebrow}>WEAPON ACTION</p><h2 id="weapon-actions-title">Melee and authored weapons</h2></div></header>
    {weapons.length && combat.targets.length ? <form className={styles.formGrid} onSubmit={(event) => { event.preventDefault(); mutation.run(() => declarePlayerWeaponAttack(characterId, combat.context.encounterId, { targetParticipantId: Number(target), itemId: selected!.itemId, instanceId: selected!.instanceId, idempotencyKey: submissionKey() }), "Weapon action locked and committed."); }}>
      <label><span>Exact weapon</span><select value={weaponKey} onChange={(event) => setWeaponKey(event.target.value)}>{weapons.map((weapon) => <option value={weapon.ownershipKey} key={weapon.ownershipKey}>{weapon.name} · {weapon.initiativeCost ?? "G.O.D. ruling"} Initiative</option>)}</select></label>
      <label><span>Exact target</span><select value={target} onChange={(event) => setTarget(event.target.value)}>{combat.targets.map((entry) => <option value={entry.participantId} key={entry.participantId}>{entry.name}</option>)}</select></label>
      {selectedGovernance ? <div className={governanceResolved ? styles.lockedReview : styles.ruling}>
        <strong>{governanceResolved ? `Roll over ${selectedGovernance.originalTarget}%` : "G.O.D. ruling required"}</strong>
        {canonicalPath ? <span>Global canonical path: {canonicalPath}</span> : null}
        <span>{governanceResolved ? `Character fallback: ${governingLabel(selectedGovernance.source)}` : selectedGovernance.explanation}</span>
      </div> : <p className={styles.ruling}>This weapon has no canonical governance projection. Ask the G.O.D. to review its Equipment mapping.</p>}
      <button type="submit" disabled={mutation.busy || !combat.initiative.canDeclareAction || !selected || selected.initiativeCost === null || !governanceResolved}>Declare and lock</button>
    </form> : <p>No currently wielded non-firearm weapon and valid target are available.</p>}
    <ResultMessage message={mutation.message} />
  </section>;
}

function FirearmPanel({ characterId, combat }: { characterId: number; combat: PlayerCombatConsoleData }) {
  const mutation = useCombatMutation();
  const [target, setTarget] = useState(String(combat.targets[0]?.participantId ?? ""));
  const [aim, setAim] = useState("0");
  const [duration, setDuration] = useState("1");
  const [entered, setEntered] = useState("");
  const [preparationRounds, setPreparationRounds] = useState("");
  const [replaceLoad, setReplaceLoad] = useState(false);
  const [partialLoadDisposition, setPartialLoadDisposition] = useState<"none" | "retain" | "discard">("none");
  const [discardReason, setDiscardReason] = useState("");
  const approvedCalledShots = combat.rulingRequests.filter(({ requestType, status }) => requestType === "called-shot" && status === "approved");
  return <section className={styles.combatSection} aria-labelledby="firearms-title"><header><div><p className={styles.eyebrow}>FIREARM RUNTIME</p><h2 id="firearms-title">Readiness, Aim and attacks</h2></div></header>
    {combat.firearms.legacyStacks.length ? <p className={styles.ruling}>Legacy aggregate firearms require G.O.D. initialization and are not converted here.</p> : null}
    {combat.firearms.firearms.map((firearm) => {
      const state = firearm.state;
      const selectedMode = state ? firearm.modes.find(({ id }) => id === state.selectedFiringModeId) ?? null : null;
      const modeGovernance = combat.weaponGovernance.weapons.find(({ itemId }) => itemId === firearm.itemId)?.modes.find(({ firingModeId }) => firingModeId === state?.selectedFiringModeId)?.resolution ?? null;
      const firearmGovernanceResolved = isResolvedWeaponGovernance(modeGovernance);
      const firearmCanonicalPath = canonicalWeaponPath(modeGovernance);
      const prep = (operation: "draw" | "ready" | "load" | "reload" | "unload" | "cycle" | "recover-recoil") => {
        const usesRounds = operation === "load" || operation === "reload";
        const usesDisposition = operation === "unload" || (operation === "reload" && replaceLoad);
        return mutation.run(() => startPlayerFirearmPreparation(characterId, combat.context.encounterId, {
          itemInstanceId: firearm.itemInstanceId,
          operation,
          requestedRounds: usesRounds ? Number(preparationRounds) : undefined,
          replaceCurrentLoad: operation === "reload" && replaceLoad,
          partialLoadDisposition: usesDisposition ? partialLoadDisposition : "none",
          discardReason: usesDisposition && partialLoadDisposition === "discard" ? discardReason : undefined,
          idempotencyKey: submissionKey(),
        }), `${titleCase(operation)} committed.`);
      };
      return <article className={styles.combatCard} key={firearm.itemInstanceId}>
        <header><div><span>Exact copy #{firearm.itemInstanceId}</span><h3>{firearm.itemName}</h3></div><strong>{titleCase(firearm.readiness.status)}</strong></header>
        {state ? <p>{state.loadedRounds} / {state.capacityRounds ?? "?"} rounds · {state.loadedAmmunitionName ?? "unloaded"} · {selectedMode?.name ?? "Unknown mode"}</p> : <p className={styles.ruling}>Runtime state is not initialized. Ask the G.O.D. to review this exact copy.</p>}
        {modeGovernance ? <p className={firearmGovernanceResolved ? styles.notice : styles.ruling}>{firearmGovernanceResolved ? `Governing source: ${governingLabel(modeGovernance.source)}${firearmCanonicalPath ? ` · canonical ${firearmCanonicalPath}` : ""}` : modeGovernance.explanation}</p> : null}
        {firearm.readiness.blockers.length ? <ul className={styles.blockers}>{firearm.readiness.blockers.map((blocker) => <li key={blocker.code}>{blocker.message}</li>)}</ul> : null}
        {state && !firearm.preparation ? <div className={styles.actionRow}>
          {firearm.equipmentState !== "wielded" ? <button disabled={mutation.busy} onClick={() => prep("draw")}>Draw</button> : null}
          {firearm.equipmentState === "wielded" && !state.readied ? <button disabled={mutation.busy} onClick={() => prep("ready")}>Ready</button> : null}
          {state.requiresCycling ? <button disabled={mutation.busy} onClick={() => prep("cycle")}>Cycle</button> : null}
          {state.requiresRecoilRecovery ? <button disabled={mutation.busy} onClick={() => prep("recover-recoil")}>Recover recoil</button> : null}
        </div> : null}
        {state && !firearm.preparation ? <div className={styles.formGrid}>
          <label><span>Rounds to load</span><input type="number" min={1} max={state.capacityRounds ?? undefined} value={preparationRounds} onChange={(event) => setPreparationRounds(event.target.value)} /></label>
          {state.loadedRounds > 0 ? <><label><span>Partial-load handling</span><select value={partialLoadDisposition} onChange={(event) => setPartialLoadDisposition(event.target.value as typeof partialLoadDisposition)}><option value="none">Choose for unload/replacement</option><option value="retain">Return rounds to inventory</option><option value="discard">Discard rounds</option></select></label><label><span>Replace current load</span><input type="checkbox" checked={replaceLoad} onChange={(event) => setReplaceLoad(event.target.checked)} /></label>{partialLoadDisposition === "discard" ? <label><span>Discard reason</span><input required maxLength={2000} value={discardReason} onChange={(event) => setDiscardReason(event.target.value)} /></label> : null}</> : null}
          {state.loadedRounds === 0
            ? <button disabled={mutation.busy || !preparationRounds} onClick={() => prep("load")}>Load</button>
            : <><button disabled={mutation.busy || !preparationRounds || (replaceLoad && partialLoadDisposition === "none") || (replaceLoad && partialLoadDisposition === "discard" && !discardReason.trim())} onClick={() => prep("reload")}>{replaceLoad ? "Replace load" : "Add rounds"}</button><button disabled={mutation.busy || partialLoadDisposition === "none" || (partialLoadDisposition === "discard" && !discardReason.trim())} onClick={() => prep("unload")}>Unload</button></>}
        </div> : null}
        {state && firearm.modes.length > 1 && !firearm.preparation ? <form className={styles.compactAction} onSubmit={(event) => {
          event.preventDefault();
          const modeId = Number(new FormData(event.currentTarget).get("mode"));
          mutation.run(() => startPlayerFirearmPreparation(characterId, combat.context.encounterId, { itemInstanceId: firearm.itemInstanceId, operation: "change-mode", targetFiringModeId: modeId, idempotencyKey: submissionKey() }), "Firing Mode change committed.");
        }}><label><span>Firing Mode</span><select name="mode" defaultValue={state.selectedFiringModeId}>{firearm.modes.flatMap((mode) => mode.id === null ? [] : [<option key={mode.id} value={mode.id}>{mode.name}{mode.mechanicsReviewRequired ? " · review required" : ""}</option>])}</select></label><button disabled={mutation.busy}>Change mode</button></form> : null}
        {state && selectedMode && selectedMode.id !== null && firearm.readiness.status === "ready" && combat.targets.length ? <form className={styles.formGrid} onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const called = Number(form.get("called")) || null;
          mutation.run(() => declarePlayerFirearmAttack(characterId, combat.context.encounterId, { targetParticipantId: Number(target), itemInstanceId: firearm.itemInstanceId, firingModeId: selectedMode.id!, aimInitiative: Number(aim), firingDurationInitiative: Number(duration), calledShotRequestId: called, idempotencyKey: submissionKey() }), "Firearm attack locked and committed.");
        }}>
          <label><span>Target</span><select value={target} onChange={(event) => setTarget(event.target.value)}>{combat.targets.map((entry) => <option key={entry.participantId} value={entry.participantId}>{entry.name}</option>)}</select></label>
          <label><span>Aim Initiative</span><input type="number" min={0} value={aim} onChange={(event) => setAim(event.target.value)} /></label>
          <label><span>Firing duration</span><input type="number" min={1} value={duration} onChange={(event) => setDuration(event.target.value)} /></label>
          <label><span>Approved Called Shot</span><select name="called" defaultValue=""><option value="">None</option>{approvedCalledShots.filter((request) => request.sourceInstanceId === firearm.itemInstanceId && request.targetParticipantId === Number(target)).map((request) => <option key={request.id} value={request.id}>#{request.id} · {String(request.frozenRequest.objective ?? request.intent)} · penalty {String(request.ruling.penalty)}</option>)}</select></label>
          <p className={styles.ruling}>Changing the exact firearm, target, Profile, firing mode, or Called Shot objective requires a new declaration. Spent Aim remains spent.</p>
          <button disabled={mutation.busy || !combat.initiative.canDeclareAction || !firearmGovernanceResolved}>Declare attack</button>
        </form> : null}
      </article>;
    })}
    {combat.firearmAttacks.attacks.map((attack) => <article className={styles.lockedReview} key={attack.id}>
      <strong>#{attack.id} · {attack.itemName} at {attack.targetName}</strong>
      <span>{titleCase(attack.effectiveStatus)} · target {attack.finalTarget}% · {attack.roundsDeclared} round{attack.roundsDeclared === 1 ? "" : "s"}{attack.aimInitiative ? ` · Aim ${attack.aimInitiative} (-${attack.aimTargetOffset})` : ""}{attack.calledShotDeclared ? ` · Called Shot ${attack.calledShotObjective} (${attack.calledShotPenalty})` : ""}</span>
      {attack.effectiveStatus === "trigger-ready" ? <button disabled={mutation.busy} onClick={() => mutation.run(() => commitPlayerFirearmTrigger(characterId, combat.context.encounterId, attack.id), "Trigger pull committed.")}>Commit trigger</button> : null}
      {attack.status === "committed" && attack.triggerTimingStatus === "completed" && attack.responderOpportunities.every(({ status }) => status !== "pending") && attack.attackRollId === null ? <div className={styles.actionRow}><input aria-label="Physical firearm Roll" type="number" min={1} max={100} value={entered} onChange={(event) => setEntered(event.target.value)} /><button disabled={mutation.busy} onClick={() => mutation.run(() => firePlayerFirearmAttack(characterId, combat.context.encounterId, attack.id, { method: "random" }), "Firearm Roll recorded.")}>Website Roll</button><button disabled={mutation.busy || !entered} onClick={() => mutation.run(() => firePlayerFirearmAttack(characterId, combat.context.encounterId, attack.id, { method: "entered", enteredTotal: Number(entered) }), "Physical firearm Roll recorded.")}>Enter physical Roll</button></div> : null}
      {attack.attackRoll ? <span>Roll {attack.attackRoll.resolution.resultTotal} · {attack.attackRoll.resolution.succeeded ? "Success" : "Failure"} · {attack.attackRoll.resolution.totalSuccesses} successes</span> : null}
      {attack.bulletAllocation ? <span>{attack.bulletAllocation.survivingBulletHits} bullets survive defense · {attack.bulletAllocation.bulletsCancelled} cancelled · {attack.bulletAllocation.overflowDamage} overflow damage</span> : null}
      {attack.bullets.map((bullet) => <small key={bullet.id}>Bullet {bullet.bulletIndex}: {titleCase(bullet.status)} · {bullet.hitLocationName || "location pending"} · proposed {bullet.proposedNetDamage ?? "ruling"} damage</small>)}
      {attack.effectPlanStatus ? <span>Effect plan: {titleCase(attack.effectPlanStatus)}</span> : null}
      {attack.rulingReasons.map((reason) => <small className={styles.ruling} key={reason}>{reason}</small>)}
    </article>)}
    <ResultMessage message={mutation.message} />
  </section>;
}

function DeclarationAndRollPanel({ characterId, combat }: { characterId: number; combat: PlayerCombatConsoleData }) {
  const mutation = useCombatMutation();
  const [entered, setEntered] = useState("");
  const declarations = combat.declarations.declarations.filter(({ actorCharacterId }) => actorCharacterId === characterId);
  const reactions = combat.defenses.reactions.filter(({ responderCharacterId }) => responderCharacterId === characterId);
  return <section className={styles.combatSection} aria-labelledby="locked-actions-title"><header><div><p className={styles.eyebrow}>LOCKED WORK</p><h2 id="locked-actions-title">Declarations, Rolls and results</h2></div></header>
    {!declarations.length && !reactions.length ? <p>No combat declarations have been recorded for this Character.</p> : null}
    {declarations.map((declaration) => <article className={styles.lockedReview} key={declaration.id}><strong>#{declaration.id} · {declaration.lockedSnapshot?.label ?? declaration.draft.label}</strong><span>{titleCase(declaration.status)} · {declaration.lockedSnapshot?.initiativeCost ?? declaration.draft.initiativeCost} Initiative · target {declaration.lockedSnapshot?.targetCharacterIds.join(", ") || "none"}</span>{declaration.lockedSnapshot?.governing ? <span>{governingLabel(declaration.lockedSnapshot.governing.source)}</span> : null}{declaration.timing ? <span>{declaration.timing.initiativeSpent} spent · {declaration.timing.remainingInitiativeCost} remaining · {declaration.timing.additionalInitiativeCost} defense-added</span> : null}{declaration.status === "rolling-ready" && !declaration.draft.actionKind.startsWith("firearm-") ? <div className={styles.actionRow}><input aria-label="Physical attack Roll" type="number" min={1} max={100} value={entered} onChange={(event) => setEntered(event.target.value)} /><button disabled={mutation.busy} onClick={() => mutation.run(() => rollPlayerDeclaredAttack(characterId, combat.context.encounterId, declaration.id, { method: "random" }), "Attack Roll recorded.")}>Website Roll</button><button disabled={mutation.busy || !entered} onClick={() => mutation.run(() => rollPlayerDeclaredAttack(characterId, combat.context.encounterId, declaration.id, { method: "entered", enteredTotal: Number(entered) }), "Physical attack Roll recorded.")}>Enter physical Roll</button></div> : null}{declaration.rulingReason ? <small className={styles.ruling}>{declaration.rulingReason}</small> : null}</article>)}
    {reactions.map((reaction) => <article className={styles.lockedReview} key={`reaction:${reaction.id}`}><strong>Response #{reaction.id} · {titleCase(reaction.reactionType)}</strong><span>{titleCase(reaction.status)} · {reaction.committedInitiativeCost} Initiative · {reaction.declaration.source.label}</span>{reaction.rollRequired && reaction.rollId === null && reaction.status === "declared" ? <div className={styles.actionRow}><input aria-label="Physical defense Roll" type="number" min={1} max={100} value={entered} onChange={(event) => setEntered(event.target.value)} /><button disabled={mutation.busy} onClick={() => mutation.run(() => rollPlayerDeclaredResponse(characterId, combat.context.encounterId, reaction.id, { method: "random" }), "Defense Roll recorded.")}>Roll response</button><button disabled={mutation.busy || !entered} onClick={() => mutation.run(() => rollPlayerDeclaredResponse(characterId, combat.context.encounterId, reaction.id, { method: "entered", enteredTotal: Number(entered) }), "Physical defense Roll recorded.")}>Enter physical Roll</button></div> : null}{reaction.outcome ? <span>Outcome: {titleCase(reaction.outcome)}</span> : null}{reaction.rulingReason ? <small className={styles.ruling}>{reaction.rulingReason}</small> : null}</article>)}
    <ResultMessage message={mutation.message} />
  </section>;
}

function RulingPanel({ characterId, combat }: { characterId: number; combat: PlayerCombatConsoleData }) {
  const mutation = useCombatMutation();
  const [type, setType] = useState<"manual-action" | "called-shot" | "ally-defense" | "tackle" | "intervention">("intervention");
  const [intent, setIntent] = useState("");
  const [target, setTarget] = useState(String(combat.targets[0]?.participantId ?? ""));
  const [location, setLocation] = useState("");
  const [firearm, setFirearm] = useState(String(combat.firearms.firearms[0]?.itemInstanceId ?? ""));
  return <section className={styles.combatSection} aria-labelledby="ruling-requests-title"><header><div><p className={styles.eyebrow}>G.O.D. RULINGS</p><h2 id="ruling-requests-title">Requests and exceptional intent</h2></div></header>
    <form className={styles.formGrid} onSubmit={(event) => { event.preventDefault(); mutation.run(() => submitPlayerCombatRulingRequest(characterId, combat.context.encounterId, { requestType: type, targetParticipantId: target ? Number(target) : null, sourceKind: type === "called-shot" ? "weapon" : "manual", sourceRef: type === "called-shot" ? `instance:${firearm}` : "player-stated-intent", sourceInstanceId: type === "called-shot" && firearm ? Number(firearm) : null, intent, objective: intent, locationNumber: location ? Number(location) : null, requestedTiming: `Round ${combat.initiative.roundNumber}, Initiative ${combat.initiative.timelineInitiative}`, idempotencyKey: submissionKey() }), "Ruling request sent."); }}>
      <label><span>Request type</span><select value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="intervention">General intervention</option><option value="ally-defense">Ally defense</option><option value="tackle">Tackle</option><option value="called-shot">Called Shot</option><option value="manual-action">Manual action</option></select></label>
      <label><span>Intended target</span><select value={target} onChange={(event) => setTarget(event.target.value)}><option value="">No target</option>{combat.targets.map((entry) => <option key={entry.participantId} value={entry.participantId}>{entry.name}</option>)}</select></label>
      {type === "called-shot" ? <><label><span>Exact firearm</span><select required value={firearm} onChange={(event) => setFirearm(event.target.value)}>{combat.firearms.firearms.map((entry) => <option key={entry.itemInstanceId} value={entry.itemInstanceId}>{entry.itemName} · copy #{entry.itemInstanceId}</option>)}</select></label><label><span>Authored location number, if applicable</span><input inputMode="numeric" type="number" value={location} onChange={(event) => setLocation(event.target.value)} /></label></> : null}
      <label className={styles.wideField}><span>Your intent</span><textarea required maxLength={2000} value={intent} onChange={(event) => setIntent(event.target.value)} /></label>
      <button disabled={mutation.busy || !intent.trim() || (type === "called-shot" && (!target || !firearm))}>Submit request</button>
    </form>
    {combat.rulingRequests.map((request) => <article className={styles.lockedReview} key={request.id}><strong>#{request.id} · {titleCase(request.requestType)} · {titleCase(request.status)}</strong><span>{request.intent}{request.targetName ? ` · target ${request.targetName}` : ""}</span><small>{request.blockedReason}</small>{request.godResponse ? <span>G.O.D.: {request.godResponse}</span> : null}{Object.keys(request.ruling).length ? <small>Ruling: {JSON.stringify(request.ruling)}</small> : null}<div className={styles.actionRow}>{request.status === "clarification-requested" ? <button disabled={mutation.busy} onClick={() => { const answer = window.prompt("Clarification for the G.O.D."); if (answer?.trim()) mutation.run(() => clarifyPlayerCombatRulingRequest(characterId, combat.context.encounterId, request.id, answer), "Clarification sent."); }}>Clarify</button> : null}{["pending", "clarification-requested"].includes(request.status) ? <button disabled={mutation.busy} onClick={() => mutation.run(() => cancelPlayerCombatRulingRequest(characterId, combat.context.encounterId, request.id, "Cancelled by the requesting Player."), "Request cancelled.")}>Cancel request</button> : null}</div></article>)}
    <ResultMessage message={mutation.message} />
  </section>;
}

function EffectPlans({ combat }: { combat: PlayerCombatConsoleData }) {
  if (!combat.effects.plans.length) return null;
  return <section className={styles.combatSection} aria-labelledby="player-effects-title"><header><div><p className={styles.eyebrow}>OBJECTIVE RESULTS</p><h2 id="player-effects-title">Effect plans</h2></div></header>{combat.effects.plans.map((plan) => <article className={styles.lockedReview} key={plan.id}><strong>Plan #{plan.id} · {titleCase(plan.status)}</strong><span>{plan.sourceSnapshot.displayName} · {plan.explanation}</span>{plan.governingRollSnapshot ? <span>Roll {plan.governingRollSnapshot.resolution.resultTotal} · target {plan.governingRollSnapshot.resolution.finalTarget} · {plan.governingRollSnapshot.resolution.totalSuccesses} successes</span> : null}{plan.effects.map((effect) => <small key={effect.id}>{effect.targetName}: {titleCase(effect.effectType)} · {titleCase(effect.status)} · proposed {JSON.stringify(effect.finalValue ?? effect.calculatedValue)}</small>)}</article>)}</section>;
}

export function PlayerCombatConsole({ characterId, combat }: { characterId: number; combat: PlayerCombatConsoleData }) {
  return <div className={styles.combatWorkspace}>
    <ResponsePanel characterId={characterId} combat={combat} />
    <InitiativePanel characterId={characterId} combat={combat} />
    <DeclarationAndRollPanel characterId={characterId} combat={combat} />
    <WeaponActions characterId={characterId} combat={combat} />
    <FirearmPanel characterId={characterId} combat={combat} />
    <RulingPanel characterId={characterId} combat={combat} />
    <EffectPlans combat={combat} />
  </div>;
}
