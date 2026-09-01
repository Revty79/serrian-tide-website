"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { CombatAidEncounterView, CombatAidParticipant } from "@/features/tabletop-operations/combat-aid-service";
import type { SpellCastRequest, SpellCastRuntimeSelections } from "@/features/characters/character-spell-runtime";
import type { ItemUseRequest } from "@/features/items/item-use";
import type { CreatureAbilityUseRequest } from "@/features/creatures/creature-ability-runtime";
import type { RawCastingCircumstanceId } from "@/features/spell-construction/data/rawCastingRules";
import type { ActiveEffectDuration } from "@/features/active-state/active-effects";
import type { TabletopDurationBindingView } from "@/features/tabletop-operations/duration-lifecycle-service";

import { interruptEncounterPendingAction } from "./initiative-actions";
import {
  bindEncounterEffectDuration,
  correctEncounterEffectDurationRemaining,
  expireEncounterEffectDurationNow,
} from "./closeout-actions";
import {
  addEncounterCondition,
  addEncounterInjury,
  addEncounterModifier,
  applyEncounterDamage,
  declareEncounterReaction,
  endEncounterModifier,
  executeImmediateEncounterCreatureAbility,
  executeImmediateEncounterItem,
  executeImmediateEncounterSpell,
  healEncounterParticipant,
  mutateEncounterMana,
  prepareEncounterCreatureAbilityAction,
  prepareEncounterItemAction,
  prepareEncounterSpellAction,
  resolveEncounterAuthoredAction,
  resolveEncounterCondition,
  resolveEncounterInjury,
  resolveEncounterReaction,
  ruleOnInterruptedEncounterReaction,
  setEncounterEquipmentState,
  startEncounterCreatureAbilityAction,
  startEncounterCreatureAttack,
  startEncounterItemAction,
  startEncounterSpellAction,
  startEncounterWeaponAction,
} from "./runtime-integration-actions";

type Feedback = { kind: "success" | "error"; message: string };
type RuntimeResult = { summary: string; manualEffects: string[] };
type RuntimePanel = "damage" | "heal" | "mana" | "condition" | "injury" | "equipment";
type ActionPanel = "weapon" | "creature-attack" | "spell" | "item" | "creature-ability";

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function selectedNumbers(element: HTMLSelectElement): number[] {
  return [...element.selectedOptions].map(({ value }) => Number(value)).filter((value) => Number.isSafeInteger(value) && value > 0);
}

function targetOptions(data: CombatAidEncounterView) {
  return data.participants.map(({ identity }) => ({ id: identity.characterId, name: identity.name }));
}

function spellSourceKey(source: CombatAidParticipant["spellSources"][number]): string {
  return source.kind === "catalog"
    ? `catalog:${source.allocationId}`
    : `${source.kind}:${source.savedSpellId}`;
}

function describeManualEffects(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return String(entry);
    const record = entry as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title : "Manual G.O.D. resolution";
    const description = typeof record.description === "string" ? record.description : "";
    return description ? `${title}: ${description}` : title;
  });
}

function DurationLifecycleControls({
  encounterId,
  characterId,
  effectKind,
  effectId,
  duration,
  binding,
  busy,
  perform,
}: {
  encounterId: number;
  characterId: number;
  effectKind: "condition" | "modifier";
  effectId: number;
  duration: ActiveEffectDuration;
  binding: TabletopDurationBindingView | null;
  busy: boolean;
  perform: (work: () => Promise<void>, success: string) => Promise<void>;
}) {
  const [remaining, setRemaining] = useState(String(binding?.remainingValue ?? duration.value ?? ""));
  if (duration.kind === "until-removed") return <small>Until Removed · no automatic lifecycle</small>;
  if (!binding) return <span className="combat-aid-duration-controls">
    <small>{duration.label} · UNBOUND — will not auto-advance</small>
    <button type="button" disabled={busy} onClick={() => void perform(
      () => bindEncounterEffectDuration(encounterId, { characterId, effectKind, effectId }),
      `${duration.label} effect bound to the current ${duration.kind === "scene" ? "Scene" : "Encounter"}.`,
    )}>Bind to Current {duration.kind === "scene" ? "Scene" : "Encounter"}</button>
  </span>;
  return <span className="combat-aid-duration-controls">
    <small>{binding.remainingValue === null ? duration.label : `${binding.remainingValue} remaining / ${duration.value} authored`} · Bound: {binding.durationKind === "scene" ? binding.sceneTitle : binding.encounterTitle}</small>
    {binding.remainingValue !== null ? <><input type="number" min="1" step="1" value={remaining} disabled={busy} aria-label={`Remaining duration for ${effectKind} ${effectId}`} onChange={(event) => setRemaining(event.target.value)} /><button type="button" disabled={busy} onClick={() => void perform(
      () => correctEncounterEffectDurationRemaining(encounterId, binding.id, Number(remaining)),
      "Duration remaining was corrected explicitly.",
    )}>Set Remaining</button></> : null}
    <button type="button" disabled={busy} onClick={() => void perform(
      () => expireEncounterEffectDurationNow(encounterId, binding.id),
      "Effect expired through the explicit duration correction.",
    )}>Expire Now</button>
  </span>;
}

export function CombatAidOperations({
  data,
  participant,
}: {
  data: CombatAidEncounterView;
  participant: CombatAidParticipant;
}) {
  const router = useRouter();
  const encounterId = data.encounter.id;
  const characterId = participant.identity.characterId;
  const initiativeActive = data.initiativeRuntime?.status === "active";
  const targets = useMemo(() => targetOptions(data), [data]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [lastRuntimeResult, setLastRuntimeResult] = useState<RuntimeResult | null>(null);
  const [runtimePanel, setRuntimePanel] = useState<RuntimePanel>("damage");
  const [actionPanel, setActionPanel] = useState<ActionPanel>(participant.identity.kind === "creature-npc" ? "creature-attack" : "weapon");
  const [targetId, setTargetId] = useState(characterId);
  const [amount, setAmount] = useState("1");
  const [selectionMode, setSelectionMode] = useState<"pool" | "hit-location">("pool");
  const [poolKey, setPoolKey] = useState(participant.health?.anatomy.pools[0]?.key ?? "");
  const [hitLocation, setHitLocation] = useState(participant.health?.anatomy.hitLocations[0]?.result ? String(participant.health.anatomy.hitLocations[0].result) : "");
  const [injuryName, setInjuryName] = useState("");
  const [notes, setNotes] = useState("");
  const [manaSystem, setManaSystem] = useState(participant.mana?.pools[0]?.system ?? "Spellcraft");
  const [manaOperation, setManaOperation] = useState<"spend" | "restore" | "restore-pool">("spend");
  const [conditionName, setConditionName] = useState("");
  const [conditionDescription, setConditionDescription] = useState("");
  const [modifierLabel, setModifierLabel] = useState("");
  const [modifierChannel, setModifierChannel] = useState<"attribute" | "skill" | "movement" | "initiative" | "soak" | "damage">("initiative");
  const [modifierTargetKey, setModifierTargetKey] = useState("self");
  const [modifierAmount, setModifierAmount] = useState("1");
  const [durationKind, setDurationKind] = useState<"until-removed" | "combat-steps" | "combat-rounds" | "scene">("until-removed");
  const [durationValue, setDurationValue] = useState("1");
  const [initiativeCost, setInitiativeCost] = useState("1");
  const [selectedWeaponKey, setSelectedWeaponKey] = useState(participant.equipment?.wieldedWeapons[0]?.ownershipKey ?? "");
  const [selectedAttackId, setSelectedAttackId] = useState(participant.creatureAttacks[0]?.canonicalId ?? "");
  const [attackOutcome, setAttackOutcome] = useState<"miss" | "hit" | "dodged" | "blocked" | "parried" | "other">("hit");
  const [resolutionSelectionMode, setResolutionSelectionMode] = useState<"pool" | "hit-location">("pool");
  const [resolutionPoolKey, setResolutionPoolKey] = useState("");
  const [resolutionHitLocation, setResolutionHitLocation] = useState("");
  const [selectedItemKey, setSelectedItemKey] = useState("");
  const [itemPreview, setItemPreview] = useState<Awaited<ReturnType<typeof prepareEncounterItemAction>> | null>(null);
  const [selectedSpellKey, setSelectedSpellKey] = useState("");
  const [rawCastingCircumstance, setRawCastingCircumstance] = useState<RawCastingCircumstanceId>("have-framework");
  const [spellSelections, setSpellSelections] = useState<SpellCastRuntimeSelections>({ targetGroups: {}, applications: {} });
  const [spellPreview, setSpellPreview] = useState<Awaited<ReturnType<typeof prepareEncounterSpellAction>> | null>(null);
  const [selectedAbilityId, setSelectedAbilityId] = useState(participant.creatureAbilities[0]?.canonicalId ?? "");
  const [abilityTargetIds, setAbilityTargetIds] = useState<number[]>([targetId]);
  const [abilitySelections, setAbilitySelections] = useState<CreatureAbilityUseRequest["effectSelections"]>({});
  const [abilityPreview, setAbilityPreview] = useState<Awaited<ReturnType<typeof prepareEncounterCreatureAbilityAction>> | null>(null);
  const [declinedReactionKeys, setDeclinedReactionKeys] = useState<Set<string>>(() => new Set());
  const applicableActionPanels: ActionPanel[] = [
    ...(participant.equipment?.wieldedWeapons.length ? ["weapon" as const] : []),
    ...(participant.identity.kind === "creature-npc" && participant.creatureAttacks.length ? ["creature-attack" as const] : []),
    ...(participant.spellSources.length ? ["spell" as const] : []),
    ...(participant.resources?.stacks.some(({ runtime }) => runtime.useMode !== "none")
      || participant.resources?.chargedInstances.length ? ["item" as const] : []),
    ...(participant.identity.kind === "creature-npc" && participant.creatureAbilities.length ? ["creature-ability" as const] : []),
  ];
  const activeActionPanel = applicableActionPanels.includes(actionPanel)
    ? actionPanel
    : applicableActionPanels[0] ?? actionPanel;

  const selectedPending = participant.initiative.enrolled ? participant.initiative.pendingAction : null;
  const selectedBinding = selectedPending
    ? data.authoredActions.find(({ pendingActionId, resolutionStatus }) => (
        pendingActionId === selectedPending.id
        && (resolutionStatus === "pending" || resolutionStatus === "needs-ruling")
        && data.encounter.status !== "completed"
      )) ?? null
    : null;
  const boundTargetId = selectedBinding?.targetCharacterIds[0] ?? null;
  const boundTarget = boundTargetId === null
    ? null
    : data.participants.find(({ identity }) => identity.characterId === boundTargetId) ?? null;
  const participantHistory = data.authoredActions.filter(({ sourceCharacterId }) => sourceCharacterId === characterId);
  const selectedWeapon = participant.equipment?.wieldedWeapons.find(({ ownershipKey }) => ownershipKey === selectedWeaponKey) ?? null;
  const selectedAttack = participant.creatureAttacks.find(({ canonicalId }) => canonicalId === selectedAttackId) ?? null;
  const selectedSpell = participant.spellSources.find((entry) => spellSourceKey(entry) === selectedSpellKey) ?? null;
  const selectedAbility = participant.creatureAbilities.find(({ canonicalId }) => canonicalId === selectedAbilityId) ?? null;
  const enteredInitiativeCost = Number(initiativeCost);
  const actionInitiativeCost = activeActionPanel === "weapon"
    ? selectedWeapon?.initiativeCost ?? enteredInitiativeCost
    : activeActionPanel === "creature-attack"
      ? selectedAttack?.initiativeCost ?? enteredInitiativeCost
      : activeActionPanel === "spell"
        ? spellPreview?.plan.finalInitiativeCost ?? null
        : enteredInitiativeCost;
  const validActionInitiativeCost = typeof actionInitiativeCost === "number"
    && Number.isFinite(actionInitiativeCost)
    && actionInitiativeCost > 0
    ? actionInitiativeCost
    : null;
  const actionSourceLabel = activeActionPanel === "weapon"
    ? selectedWeapon?.itemName
    : activeActionPanel === "creature-attack"
      ? selectedAttack?.attackName
      : activeActionPanel === "spell"
        ? spellPreview?.plan.spell.name ?? selectedSpell?.name
        : activeActionPanel === "item"
          ? itemPreview?.plan.item.name
          : selectedAbility?.abilityName;
  const selectedActionTargetIds = activeActionPanel === "creature-ability"
    ? abilityTargetIds
    : activeActionPanel === "spell"
      ? [...new Set(Object.values(spellSelections.targetGroups).flat())]
      : [targetId];
  const selectedActionTargets = selectedActionTargetIds
    .map((id) => targets.find((target) => target.id === id)?.name ?? `#${id}`)
    .join(", ");
  const actionResourceCost = activeActionPanel === "spell" && spellPreview
    ? `${spellPreview.plan.finalManaCost} ${spellPreview.plan.caster.system} Mana`
    : activeActionPanel === "item" && itemPreview?.plan.resource
      ? `${itemPreview.plan.resource.before} → ${itemPreview.plan.resource.after}`
      : activeActionPanel === "weapon"
        ? `${selectedWeapon?.authoredDamage ? `Authored ${selectedWeapon.authoredDamage}; ` : ""}final damage confirmed at resolution`
        : activeActionPanel === "creature-attack"
          ? "Final damage confirmed at resolution"
        : "No structured resource cost";
  const expectedCompletion = participant.initiative.enrolled && validActionInitiativeCost !== null
    ? participant.initiative.currentInitiative - validActionInitiativeCost
    : null;

  async function perform<T>(work: () => Promise<T>, success: string, onSuccess?: (result: T) => void): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await work();
      onSuccess?.(result);
      setFeedback({ kind: "success", message: success });
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Tabletop operation failed." });
    } finally {
      setBusy(false);
    }
  }

  const anatomySelection = selectionMode === "hit-location"
    ? { hitLocationNumber: numberOrNull(hitLocation), poolKey: null }
    : { hitLocationNumber: null, poolKey: poolKey || null };

  async function damage(): Promise<void> {
    await perform(() => applyEncounterDamage(encounterId, {
      targetCharacterId: characterId,
      amount: Number(amount),
      ...anatomySelection,
      injuryName: injuryName || undefined,
      injuryNotes: notes || undefined,
    }), `${participant.identity.name} received ${amount} direct damage.`);
  }

  async function heal(): Promise<void> {
    await perform(() => healEncounterParticipant(encounterId, {
      targetCharacterId: characterId,
      amount: Number(amount),
      scope: selectionMode === "pool" ? "area" : "whole-body",
      poolKey: selectionMode === "pool" ? poolKey : null,
    }), `${participant.identity.name} was healed.`);
  }

  function itemRequest(): ItemUseRequest | null {
    if (!selectedItemKey) return null;
    const [kind, itemIdText, instanceIdText] = selectedItemKey.split(":");
    const missingIds = itemPreview?.plan.missingSelectionEffectIds ?? [];
    return {
      sourceCharacterId: characterId,
      itemId: Number(itemIdText),
      itemInstanceId: kind === "instance" ? Number(instanceIdText) : null,
      targetCharacterId: targetId,
      effectSelections: Object.fromEntries(missingIds.map((id) => [id, anatomySelection])),
    };
  }

  function spellRequest(): SpellCastRequest | null {
    const source = participant.spellSources.find((entry) => spellSourceKey(entry) === selectedSpellKey);
    if (!source) return null;
    return {
      casterCharacterId: characterId,
      source: source.kind === "catalog"
        ? { kind: "catalog", allocationId: source.allocationId }
        : source.kind === "personal"
          ? { kind: "personal", savedSpellId: source.savedSpellId }
          : { kind: "raw-saved", savedSpellId: source.savedSpellId, circumstance: rawCastingCircumstance },
      selections: spellSelections,
    };
  }

  function abilityRequest(): CreatureAbilityUseRequest | null {
    if (!selectedAbilityId) return null;
    return {
      sourceCharacterId: characterId,
      abilityCanonicalId: selectedAbilityId,
      targetCharacterIds: abilityTargetIds,
      effectSelections: abilitySelections,
      previewFingerprint: abilityPreview?.plan.fingerprint ?? null,
    };
  }

  const reactedActionIds = new Set(data.reactions
    .filter(({ reactorCharacterId }) => reactorCharacterId === characterId)
    .map(({ pendingActionId }) => pendingActionId));
  const unresolvedAttackBindings = data.authoredActions.filter((binding) => {
    if (binding.resolutionStatus !== "pending" || (binding.sourceKind !== "weapon" && binding.sourceKind !== "creature-attack")) return false;
    if (!participant.initiative.enrolled
      || !participant.initiative.reactionOpportunityActionIds.includes(binding.pendingActionId)
      || reactedActionIds.has(binding.pendingActionId)) return false;
    return !declinedReactionKeys.has(`${binding.pendingActionId}:${characterId}`);
  });
  const participantReactions = data.reactions.filter(({ reactorCharacterId }) => reactorCharacterId === characterId);

  if (data.encounter.status === "completed") {
    return <section className="combat-aid-operations"><p className="combat-aid-history">Runtime controls are disabled for completed Encounter history.</p></section>;
  }

  return <section className="combat-aid-operations">
    <header><div><span>G.O.D. OPERATIONS</span><h6 className="font-sans">Authoritative Runtime Controller</h6></div><small>All changes write to Character #{characterId}&apos;s existing live state.</small></header>
    {feedback ? <p className={`tabletop-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}
    {lastRuntimeResult ? <aside className="combat-aid-runtime-result"><strong>{lastRuntimeResult.summary}</strong>{lastRuntimeResult.manualEffects.length ? <><span>Manual G.O.D. resolution required:</span><ul>{lastRuntimeResult.manualEffects.map((effect, index) => <li key={`${effect}:${index}`}>{effect}</li>)}</ul></> : <small>No manual effects were returned.</small>}</aside> : null}

    <div className="combat-aid-operation-groups">
      <article>
        <header><div><span>RUNTIME STATE</span><strong>Explicit corrections &amp; management</strong></div></header>
        <nav>{(["damage", "heal", "mana", "condition", "injury", "equipment"] as RuntimePanel[]).map((panel) => <button key={panel} type="button" className={runtimePanel === panel ? "is-selected" : ""} onClick={() => setRuntimePanel(panel)}>{panel}</button>)}</nav>
        <div className="combat-aid-operation-form">
          {runtimePanel === "damage" || runtimePanel === "heal" ? <>
            <label><span>Amount</span><input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
            <label><span>Scope / anatomy</span><select value={selectionMode} onChange={(event) => setSelectionMode(event.target.value as typeof selectionMode)}><option value="pool">HP Pool / Area</option><option value="hit-location">{runtimePanel === "heal" ? "Whole Body" : "Exact Hit Location"}</option></select></label>
            {selectionMode === "pool" ? <label><span>HP Pool</span><select value={poolKey} onChange={(event) => setPoolKey(event.target.value)}>{participant.health?.anatomy.pools.map((pool) => <option key={pool.key} value={pool.key}>{pool.name}</option>)}</select></label> : runtimePanel === "damage" ? <label><span>Hit Location</span><select value={hitLocation} onChange={(event) => setHitLocation(event.target.value)}>{participant.health?.anatomy.hitLocations.map((location) => <option key={location.result} value={location.result}>{location.result} · {location.name}</option>)}</select></label> : null}
            {runtimePanel === "damage" ? <><label><span>Optional Injury name</span><input value={injuryName} onChange={(event) => setInjuryName(event.target.value)} /></label><label className="is-wide"><span>Optional Injury notes</span><input value={notes} onChange={(event) => setNotes(event.target.value)} /></label></> : null}
            <button type="button" className="is-primary" disabled={busy} onClick={() => void (runtimePanel === "damage" ? damage() : heal())}>{runtimePanel === "damage" ? "Apply Direct Damage" : "Apply Healing"}</button>
          </> : null}

          {runtimePanel === "mana" ? <>
            <label><span>Mana pool</span><select value={manaSystem} onChange={(event) => setManaSystem(event.target.value as typeof manaSystem)}>{participant.mana?.pools.map((pool) => <option key={pool.system} value={pool.system}>{pool.system} · {pool.currentMana}/{pool.maximumMana}</option>)}</select></label>
            <label><span>Operation</span><select value={manaOperation} onChange={(event) => setManaOperation(event.target.value as typeof manaOperation)}><option value="spend">Spend Mana</option><option value="restore">Restore Mana</option><option value="restore-pool">Restore Pool</option></select></label>
            {manaOperation !== "restore-pool" ? <label><span>Amount</span><input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label> : null}
            <button type="button" className="is-primary" disabled={busy || !participant.mana?.pools.length} onClick={() => void perform(() => mutateEncounterMana(encounterId, { targetCharacterId: characterId, system: manaSystem as Parameters<typeof mutateEncounterMana>[1]["system"], operation: manaOperation, amount: Number(amount) }), `${participant.identity.name}'s Mana was updated.`)}>Apply Mana Operation</button>
          </> : null}

          {runtimePanel === "condition" ? <>
            <label><span>Condition</span><input value={conditionName} onChange={(event) => setConditionName(event.target.value)} /></label>
            <label><span>Duration</span><select value={durationKind} onChange={(event) => setDurationKind(event.target.value as typeof durationKind)}><option value="until-removed">Until Removed</option><option value="combat-steps">Combat Steps</option><option value="combat-rounds">Combat Rounds</option><option value="scene">Scene</option></select></label>
            {durationKind === "combat-steps" || durationKind === "combat-rounds" ? <label><span>Duration value</span><input type="number" min={1} step={1} value={durationValue} onChange={(event) => setDurationValue(event.target.value)} /></label> : null}
            <label className="is-wide"><span>Description</span><input value={conditionDescription} onChange={(event) => setConditionDescription(event.target.value)} /></label>
            <button type="button" className="is-primary" disabled={busy} onClick={() => void perform(() => addEncounterCondition(encounterId, { targetCharacterId: characterId, name: conditionName, description: conditionDescription, duration: { kind: durationKind, value: durationKind === "combat-steps" || durationKind === "combat-rounds" ? Number(durationValue) : null } }), `${conditionName} was applied.`)}>Add Condition</button>
            <hr />
            <label><span>Modifier label</span><input value={modifierLabel} onChange={(event) => setModifierLabel(event.target.value)} /></label>
            <label><span>Channel</span><select value={modifierChannel} onChange={(event) => setModifierChannel(event.target.value as typeof modifierChannel)}><option value="attribute">Attribute</option><option value="skill">Skill</option><option value="movement">Movement</option><option value="initiative">Initiative</option><option value="soak">Soak</option><option value="damage">Damage</option></select></label>
            <label><span>Target key</span><input value={modifierTargetKey} onChange={(event) => setModifierTargetKey(event.target.value)} placeholder="DEX, skill:12, Walk…" /></label>
            <label><span>Amount</span><input type="number" step="0.01" value={modifierAmount} onChange={(event) => setModifierAmount(event.target.value)} /></label>
            <button type="button" disabled={busy} onClick={() => void perform(() => addEncounterModifier(encounterId, { targetCharacterId: characterId, label: modifierLabel, channel: modifierChannel, targetKey: modifierTargetKey, amount: Number(modifierAmount), duration: { kind: durationKind, value: durationKind === "combat-steps" || durationKind === "combat-rounds" ? Number(durationValue) : null } }), `${modifierLabel} was applied.`)}>Add Temporary Modifier</button>
            <div className="combat-aid-operation-list">{participant.effects?.conditions.map((condition) => {
              const binding = participant.durationBindings.find((entry) => entry.effectKind === "condition" && entry.effectId === condition.id && entry.status === "active") ?? null;
              return <div key={condition.id}><span><b>{condition.name}</b><DurationLifecycleControls encounterId={encounterId} characterId={characterId} effectKind="condition" effectId={condition.id} duration={condition.duration} binding={binding} busy={busy} perform={perform} /></span><button type="button" disabled={busy} onClick={() => void perform(() => resolveEncounterCondition(encounterId, characterId, condition.id), `${condition.name} was resolved.`)}>Resolve</button></div>;
            })}</div>
            <div className="combat-aid-operation-list">{participant.effects?.modifiers.map((modifier) => {
              const binding = participant.durationBindings.find((entry) => entry.effectKind === "modifier" && entry.effectId === modifier.id && entry.status === "active") ?? null;
              return <div key={modifier.id}><span><b>{modifier.label}</b><small>{modifier.amount} {modifier.channel} · {modifier.targetKey}</small><DurationLifecycleControls encounterId={encounterId} characterId={characterId} effectKind="modifier" effectId={modifier.id} duration={modifier.duration} binding={binding} busy={busy} perform={perform} /></span><button type="button" disabled={busy} onClick={() => void perform(() => endEncounterModifier(encounterId, characterId, modifier.id), `${modifier.label} ended.`)}>End</button></div>;
            })}</div>
          </> : null}

          {runtimePanel === "injury" ? <>
            <label><span>Injury name</span><input value={injuryName} onChange={(event) => setInjuryName(event.target.value)} /></label>
            <label><span>HP Pool</span><select value={poolKey} onChange={(event) => setPoolKey(event.target.value)}>{participant.health?.anatomy.pools.map((pool) => <option key={pool.key} value={pool.key}>{pool.name}</option>)}</select></label>
            <label className="is-wide"><span>Notes</span><input value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
            <button type="button" className="is-primary" disabled={busy} onClick={() => void perform(() => addEncounterInjury(encounterId, { targetCharacterId: characterId, poolKey, name: injuryName, notes }), `${injuryName} was recorded.`)}>Add Injury</button>
            <div className="combat-aid-operation-list">{participant.health?.injuries.filter(({ resolved }) => !resolved).map((injury) => <div key={injury.id}><span><b>{injury.name}</b><small>{injury.poolNameSnapshot}</small></span><button type="button" disabled={busy} onClick={() => void perform(() => resolveEncounterInjury(encounterId, characterId, injury.id), `${injury.name} was resolved.`)}>Resolve</button></div>)}</div>
          </> : null}

          {runtimePanel === "equipment" ? <div className="combat-aid-equipment-controls">
            {participant.equipment?.stacks.map((stack) => <div key={stack.itemId}><span><b>{stack.itemName}</b><small>{stack.inactiveQuantity} inactive · {stack.equippedQuantity} equipped · {stack.wornQuantity} worn · {stack.wieldedQuantity} wielded</small></span>{(["inactive", "equipped", "worn", "wielded"] as const).map((state) => <button key={state} type="button" disabled={busy} onClick={() => void perform(() => setEncounterEquipmentState(encounterId, { kind: "stack", targetCharacterId: characterId, itemId: stack.itemId, state, quantity: state === "inactive" ? 0 : 1 }), `${stack.itemName} set to ${state}.`)}>{state}</button>)}</div>)}
            {participant.equipment?.instances.map((instance) => <div key={instance.instanceId}><span><b>{instance.itemName} · Copy #{instance.instanceId}</b><small>Current: {instance.state}</small></span><select value={instance.state} disabled={busy} onChange={(event) => void perform(() => setEncounterEquipmentState(encounterId, { kind: "instance", targetCharacterId: characterId, instanceId: instance.instanceId, state: event.target.value as typeof instance.state }), `${instance.itemName} state changed.`)}><option value="inactive">Inactive</option><option value="equipped">Equipped</option><option value="worn">Worn</option><option value="wielded">Wielded</option></select></div>)}
          </div> : null}
        </div>
      </article>

      <article>
        <header><div><span>ACTIONS</span><strong>{initiativeActive ? "Timed through Initiative" : "Immediate out-of-Initiative execution"}</strong></div></header>
        <nav>{applicableActionPanels.map((panel) => <button key={panel} type="button" className={activeActionPanel === panel ? "is-selected" : ""} onClick={() => setActionPanel(panel)}>{panel}</button>)}</nav>
        {!applicableActionPanels.length ? <small>No authored Weapon, Spell, Item, Creature Attack, or Creature Ability source is currently available.</small> : null}
        <div className="combat-aid-operation-form">
          <label><span>Target</span><select value={targetId} onChange={(event) => { setTargetId(Number(event.target.value)); setAbilityTargetIds([Number(event.target.value)]); }}>{targets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select></label>
          {initiativeActive ? <aside className="combat-aid-action-preview is-wide"><strong>Action confirmation</strong><span>Actor: {participant.identity.name}</span><span>Source: {actionSourceLabel ?? "Choose an authored source"}</span><span>Target(s): {selectedActionTargets || "Runtime selections pending"}</span><span>Initiative Cost: {validActionInitiativeCost ?? "pending"}</span><span>Expected completion: {expectedCompletion ?? "pending"}</span><small>Resource: {actionResourceCost}</small></aside> : null}

          {activeActionPanel === "weapon" ? <><label><span>Wielded Weapon</span><select value={selectedWeaponKey} onChange={(event) => setSelectedWeaponKey(event.target.value)}>{participant.equipment?.wieldedWeapons.map((weapon) => <option key={weapon.ownershipKey} value={weapon.ownershipKey}>{weapon.itemName} · Damage {weapon.authoredDamage || "needs ruling"} · Init {weapon.initiativeCost ?? "G.O.D."}</option>)}</select></label>{selectedWeapon ? <small>Authored damage: {selectedWeapon.authoredDamage || "needs G.O.D. ruling"} ({selectedWeapon.authoredDamageModifier}){selectedWeapon.authoredDamageSourceName ? ` via ${selectedWeapon.authoredDamageSourceName}` : ""}. Final direct damage is confirmed when the action resolves.</small> : null}{selectedWeapon?.initiativeCost === null ? <label><span>G.O.D. Initiative Cost</span><input type="number" min="0.01" step="0.01" value={initiativeCost} onChange={(event) => setInitiativeCost(event.target.value)} /></label> : null}<button type="button" className="is-primary" disabled={busy || !initiativeActive || !selectedWeaponKey} onClick={() => {
            const weapon = selectedWeapon;
            if (!weapon) return;
            void perform(() => startEncounterWeaponAction(encounterId, { sourceCharacterId: characterId, targetCharacterId: targetId, itemId: weapon.itemId, instanceId: weapon.instanceId, godSuppliedInitiativeCost: weapon.initiativeCost === null ? Number(initiativeCost) : null }), `${weapon.itemName} attack started. Damage will not apply until completion.`);
          }}>Start Weapon Attack</button>{!initiativeActive ? <small>Without active Initiative, use Direct Damage after the table resolves the attack.</small> : null}</> : null}

          {activeActionPanel === "creature-attack" ? <><label><span>Creature Attack</span><select value={selectedAttackId} onChange={(event) => setSelectedAttackId(event.target.value)}>{participant.creatureAttacks.map((attack) => <option key={attack.canonicalId} value={attack.canonicalId}>{attack.attackName} · Damage {attack.damage ?? "needs ruling"} · Init {attack.initiativeCost ?? "G.O.D."}</option>)}</select></label>{selectedAttack?.initiativeCost === null ? <label><span>G.O.D. Initiative Cost</span><input type="number" min="0.01" step="0.01" value={initiativeCost} onChange={(event) => setInitiativeCost(event.target.value)} /></label> : null}<button type="button" className="is-primary" disabled={busy || !initiativeActive || !selectedAttackId} onClick={() => void perform(() => startEncounterCreatureAttack(encounterId, { sourceCharacterId: characterId, targetCharacterId: targetId, attackCanonicalId: selectedAttackId, godSuppliedInitiativeCost: selectedAttack?.initiativeCost === null ? Number(initiativeCost) : null }), "Creature Attack started. Damage remains unchanged until resolution.")}>Start Creature Attack</button></> : null}

          {activeActionPanel === "item" ? <><label><span>Owned Item</span><select value={selectedItemKey} onChange={(event) => { setSelectedItemKey(event.target.value); setItemPreview(null); }}><option value="">Choose Item</option>{participant.resources?.stacks.filter(({ runtime }) => runtime.useMode !== "none").map((stack) => <option key={`stack:${stack.itemId}`} value={`stack:${stack.itemId}`}>{stack.itemName} · {stack.quantity}</option>)}{participant.resources?.chargedInstances.map((instance) => <option key={`instance:${instance.itemId}:${instance.instanceId}`} value={`instance:${instance.itemId}:${instance.instanceId}`}>{instance.itemName} · {instance.currentCharges}/{instance.maximumCharges}</option>)}</select></label>{initiativeActive ? <label><span>G.O.D. Initiative Cost</span><input type="number" min="0.01" step="0.01" value={initiativeCost} onChange={(event) => setInitiativeCost(event.target.value)} /></label> : null}<button type="button" disabled={busy || !selectedItemKey} onClick={() => {
            const request = itemRequest(); if (!request) return;
            void perform(async () => setItemPreview(await prepareEncounterItemAction(encounterId, request)), "Item preview refreshed.");
          }}>Preview Item Use</button>{itemPreview ? <div className="combat-aid-action-preview"><strong>{itemPreview.plan.item.name}</strong><span>{itemPreview.plan.status} · {itemPreview.plan.resource ? `${itemPreview.plan.resource.before} → ${itemPreview.plan.resource.after}` : "Resource unavailable"}</span>{itemPreview.plan.issues.map((issue) => <small key={issue}>{issue}</small>)}</div> : null}<button type="button" className="is-primary" disabled={busy || !itemPreview?.plan.ready} onClick={() => {
            const request = itemRequest(); if (!request) return;
            if (initiativeActive) {
              void perform(() => startEncounterItemAction(encounterId, request, Number(initiativeCost)), "Item action started; resources are unchanged until completion.");
            } else {
              void perform(() => executeImmediateEncounterItem(encounterId, request), "Item used through the authoritative runtime.", (result) => setLastRuntimeResult({ summary: `${result.item.name} used on ${result.target.name}.`, manualEffects: describeManualEffects(result.manualEffects) }));
            }
          }}>{initiativeActive ? "Start Item Action" : "Confirm Item Use"}</button></> : null}

          {activeActionPanel === "spell" ? <><label><span>Known / Saved Spell</span><select value={selectedSpellKey} onChange={(event) => { setSelectedSpellKey(event.target.value); setSpellPreview(null); setSpellSelections({ targetGroups: {}, applications: {} }); }}><option value="">Choose Spell</option>{participant.spellSources.map((source) => <option key={spellSourceKey(source)} value={spellSourceKey(source)}>{source.name} · {source.kind === "catalog" ? "Catalog" : source.kind === "personal" ? "Spellbook" : "Saved Raw Formula"}</option>)}</select></label>{selectedSpell?.kind === "raw-saved" ? <label><span>Raw Casting circumstance</span><select value={rawCastingCircumstance} onChange={(event) => { setRawCastingCircumstance(event.target.value as RawCastingCircumstanceId); setSpellPreview(null); }}><option value="have-spell">Have Spell</option><option value="have-framework">Have Framework</option><option value="no-framework">No Framework</option><option value="no-open-framework-slot">No Open Framework Slot</option></select></label> : null}<button type="button" disabled={busy || !selectedSpellKey} onClick={() => {
            const request = spellRequest(); if (!request) return;
            void perform(async () => setSpellPreview(await prepareEncounterSpellAction(encounterId, request)), "Spell preview refreshed.");
          }}>Preview Spell</button>{spellPreview ? <div className="combat-aid-action-preview"><strong>{spellPreview.plan.spell.name}</strong><span>{spellPreview.plan.currentMana}/{spellPreview.plan.maximumMana} Mana · costs {spellPreview.plan.finalManaCost} · Initiative {spellPreview.plan.finalInitiativeCost}</span>{spellPreview.plan.targetGroups.map((group) => <label key={group.id}><span>{group.label} · {group.rangeLabel ?? group.shapeLabel ?? group.kind}</span>{group.selfTargeted ? <small>Self: {participant.identity.name}</small> : <select multiple value={spellSelections.targetGroups[group.id]?.map(String) ?? []} onChange={(event) => setSpellSelections((current) => ({ ...current, targetGroups: { ...current.targetGroups, [group.id]: selectedNumbers(event.target) } }))}>{targets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select>}</label>)}{spellPreview.plan.automaticApplications.filter(({ plan }) => plan.missingSelections.length).map((application) => <label key={application.applicationKey}><span>{application.targetName} · {application.plan.missingSelections.join(", ")}</span><select value={spellSelections.applications[application.applicationKey]?.poolKey ?? ""} onChange={(event) => setSpellSelections((current) => ({ ...current, applications: { ...current.applications, [application.applicationKey]: { poolKey: event.target.value || null } } }))}><option value="">Choose HP Pool</option>{spellPreview.plan.targetResults.find(({ characterId: id }) => id === application.targetCharacterId)?.anatomy.pools.map((pool) => <option key={pool.key} value={pool.key}>{pool.name}</option>)}</select></label>)}{spellPreview.plan.warnings.map((warning) => <small key={warning}>Warning: {warning}</small>)}{spellPreview.plan.issues.map((issue) => <small key={issue}>{issue}</small>)}</div> : null}<button type="button" className="is-primary" disabled={busy || !spellPreview?.plan.ready} onClick={() => {
            const request = spellRequest(); if (!request) return;
            if (initiativeActive) {
              void perform(() => startEncounterSpellAction(encounterId, request), "Casting started. Mana and effects remain unchanged until completion.");
            } else {
              void perform(() => executeImmediateEncounterSpell(encounterId, request), "Spell cast through the authoritative runtime.", (result) => setLastRuntimeResult({ summary: `${result.spell.name} cast for ${result.finalManaCost} Mana.`, manualEffects: describeManualEffects(result.manualEffects) }));
            }
          }}>{initiativeActive ? "Start Casting" : "Confirm Cast"}</button></> : null}

          {activeActionPanel === "creature-ability" ? <><label><span>Creature Ability</span><select value={selectedAbilityId} onChange={(event) => { setSelectedAbilityId(event.target.value); setAbilityPreview(null); setAbilitySelections({}); }}>{participant.creatureAbilities.map((ability) => <option key={ability.canonicalId} value={ability.canonicalId}>{ability.abilityName} · {ability.activation || "Activation unstructured"}</option>)}</select></label><label><span>Affected Encounter Participants</span><select multiple value={abilityTargetIds.map(String)} onChange={(event) => setAbilityTargetIds(selectedNumbers(event.target))}>{targets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select></label>{initiativeActive ? <label><span>Initiative Cost</span><input type="number" min="0.01" step="0.01" value={initiativeCost} onChange={(event) => setInitiativeCost(event.target.value)} /></label> : null}<button type="button" disabled={busy || !selectedAbilityId} onClick={() => {
            const request = abilityRequest(); if (!request) return;
            void perform(async () => setAbilityPreview(await prepareEncounterCreatureAbilityAction(encounterId, request)), "Creature Ability preview refreshed.");
          }}>Preview Ability</button>{abilityPreview ? <div className="combat-aid-action-preview"><strong>{abilityPreview.plan.ability.abilityName}</strong><span>{abilityPreview.plan.status} · {abilityPreview.plan.ability.activation || "No structured cost"}</span>{abilityPreview.plan.automaticApplications.filter(({ plan }) => plan.missingSelections.length).map((application) => <label key={application.applicationKey}><span>{application.targetName} · {application.plan.missingSelections.join(", ")}</span><select value={abilitySelections[application.applicationKey]?.poolKey ?? ""} onChange={(event) => setAbilitySelections((current) => ({ ...current, [application.applicationKey]: { poolKey: event.target.value || null } }))}><option value="">Choose HP Pool</option>{abilityPreview.plan.targets.find(({ characterId: id }) => id === application.targetCharacterId)?.anatomy.pools.map((pool) => <option key={pool.key} value={pool.key}>{pool.name}</option>)}</select></label>)}{abilityPreview.plan.issues.map((issue) => <small key={issue}>{issue}</small>)}</div> : null}<button type="button" className="is-primary" disabled={busy || !abilityPreview?.plan.ready} onClick={() => {
            const request = abilityRequest(); if (!request) return;
            const authoritative = { ...request, previewFingerprint: abilityPreview!.plan.fingerprint };
            if (initiativeActive) {
              void perform(() => startEncounterCreatureAbilityAction(encounterId, authoritative, Number(initiativeCost)), "Creature Ability action started; effects wait for completion.");
            } else {
              void perform(() => executeImmediateEncounterCreatureAbility(encounterId, authoritative), "Creature Ability executed through its authoritative runtime.", (result) => setLastRuntimeResult({ summary: `${result.ability.abilityName} resolved.`, manualEffects: describeManualEffects(result.manualEffects) }));
            }
          }}>{initiativeActive ? "Start Ability" : "Confirm Ability"}</button></> : null}
        </div>
      </article>
    </div>

    {selectedBinding && selectedPending ? <section className="combat-aid-resolution">
      <header><div><span>{selectedPending.status === "completed" ? "READY TO RESOLVE" : "AUTHORED ACTION"}</span><strong>{selectedPending.label}</strong></div><small>Source: {participant.identity.name} · Target: {boundTarget?.identity.name ?? "selection bound in runtime"} · Started {selectedPending.remainingInitiativeCost === 0 ? "complete" : `${selectedPending.remainingInitiativeCost} remaining`} · {selectedBinding.sourceRef}</small></header>
      {selectedPending.status === "completed" ? selectedBinding.sourceKind === "weapon" || selectedBinding.sourceKind === "creature-attack" ? <div className="combat-aid-operation-form"><label><span>Outcome</span><select value={attackOutcome} onChange={(event) => setAttackOutcome(event.target.value as typeof attackOutcome)}><option value="hit">Hit</option><option value="miss">Miss</option><option value="dodged">Dodged</option><option value="blocked">Blocked</option><option value="parried">Parried</option><option value="other">Other / G.O.D. ruling</option></select></label>{attackOutcome === "hit" ? <><label><span>Final numeric damage</span><input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><label><span>Damage selection</span><select value={resolutionSelectionMode} onChange={(event) => setResolutionSelectionMode(event.target.value as typeof resolutionSelectionMode)}><option value="pool">HP Pool</option><option value="hit-location">Exact Hit Location</option></select></label>{resolutionSelectionMode === "pool" ? <label><span>{boundTarget?.identity.name ?? "Target"} HP Pool</span><select value={resolutionPoolKey} onChange={(event) => setResolutionPoolKey(event.target.value)}><option value="">Choose HP Pool</option>{boundTarget?.health?.anatomy.pools.map((pool) => <option key={pool.key} value={pool.key}>{pool.name}</option>)}</select></label> : <label><span>{boundTarget?.identity.name ?? "Target"} Hit Location</span><select value={resolutionHitLocation} onChange={(event) => setResolutionHitLocation(event.target.value)}><option value="">Choose Hit Location</option>{boundTarget?.health?.anatomy.hitLocations.map((location) => <option key={location.result} value={location.result}>{location.result} · {location.name}</option>)}</select></label>}</> : null}<button type="button" className="is-primary" disabled={busy || attackOutcome === "hit" && (resolutionSelectionMode === "pool" ? !resolutionPoolKey : !resolutionHitLocation)} onClick={() => void perform(() => resolveEncounterAuthoredAction(encounterId, selectedBinding.id, { outcome: attackOutcome, finalDamage: attackOutcome === "hit" ? Number(amount) : null, poolKey: attackOutcome === "hit" && resolutionSelectionMode === "pool" ? resolutionPoolKey : null, hitLocationNumber: attackOutcome === "hit" && resolutionSelectionMode === "hit-location" ? Number(resolutionHitLocation) : null, rulingSummary: attackOutcome === "other" ? notes : undefined }), "Authored attack resolved exactly once.", (result) => setLastRuntimeResult({ summary: result.summary, manualEffects: describeManualEffects(result.manualEffects) }))}>Confirm Outcome</button></div> : <button type="button" className="is-primary" disabled={busy} onClick={() => void perform(() => resolveEncounterAuthoredAction(encounterId, selectedBinding.id, {}), `${selectedPending.label} executed through its authoritative runtime.`, (result) => setLastRuntimeResult({ summary: result.summary, manualEffects: describeManualEffects(result.manualEffects) }))}>Confirm Runtime Resolution</button> : <p>Consequences remain deferred until this action reaches Initiative completion.</p>}
    </section> : null}

    {unresolvedAttackBindings.length || participantReactions.length ? <section className="combat-aid-reactions">
      <header><div><span>REACTIONS</span><strong>G.O.D. declares and records the result</strong></div><small>No defense roll is automated.</small></header>
      {unresolvedAttackBindings.map((binding) => <div key={binding.id}><span><b>Against action #{binding.pendingActionId}</b><small>{binding.sourceRef}</small></span><button type="button" disabled={busy} onClick={() => void perform(() => declareEncounterReaction(encounterId, { pendingActionId: binding.pendingActionId, reactorCharacterId: characterId, reactionType: "dodge" }), "Dodge declared; 1 Initiative committed.")}>Dodge</button>{participant.equipment?.wieldedWeapons.map((weapon) => <span key={weapon.ownershipKey}><button type="button" disabled={busy || weapon.initiativeCost === null} onClick={() => void perform(() => declareEncounterReaction(encounterId, { pendingActionId: binding.pendingActionId, reactorCharacterId: characterId, reactionType: "parry", defendingItemId: weapon.itemId, defendingInstanceId: weapon.instanceId }), `${weapon.itemName} Parry declared; full Weapon cost committed.`)}>Parry with {weapon.itemName}</button><button type="button" disabled={busy || weapon.initiativeCost === null} onClick={() => void perform(() => declareEncounterReaction(encounterId, { pendingActionId: binding.pendingActionId, reactorCharacterId: characterId, reactionType: "block", defendingItemId: weapon.itemId, defendingInstanceId: weapon.instanceId }), `${weapon.itemName} Block declared; full Weapon cost committed.`)}>Block</button></span>)}<button type="button" disabled={busy} onClick={() => { setDeclinedReactionKeys((current) => new Set(current).add(`${binding.pendingActionId}:${characterId}`)); setFeedback({ kind: "success", message: "No Reaction selected; no Initiative was committed." }); }}>No Reaction</button></div>)}
      {participantReactions.map((reaction) => <div key={reaction.id}><span><b>{reaction.reactionType} · {reaction.status}</b><small>{reaction.committedInitiativeCost} committed{reaction.outcome ? ` · ${reaction.outcome}` : ""}</small></span>{reaction.status === "declared" ? <><button type="button" disabled={busy} onClick={() => void perform(() => resolveEncounterReaction(encounterId, reaction.id, true), `${reaction.reactionType} succeeded and Initiative was reconciled.`)}>Success</button><button type="button" disabled={busy} onClick={() => void perform(() => resolveEncounterReaction(encounterId, reaction.id, false), `${reaction.reactionType} failed; committed cost remains.`)}>Failure</button></> : null}{reaction.status === "needs-ruling" ? <><button type="button" disabled={busy} onClick={() => void perform(() => ruleOnInterruptedEncounterReaction(encounterId, reaction.id, "keep"), "Committed Reaction cost kept by G.O.D. ruling.")}>Keep Cost</button><button type="button" disabled={busy} onClick={() => void perform(() => ruleOnInterruptedEncounterReaction(encounterId, reaction.id, "refund"), "Committed Reaction cost refunded without rewinding the timeline.")}>Refund Cost</button></> : null}</div>)}
    </section> : null}

    {selectedPending?.status === "active" ? <section className="combat-aid-interruption"><strong>{participant.identity.name} is currently performing {selectedPending.label}.</strong><p>A successful effect may interrupt it. The software will not decide automatically.</p><button type="button" disabled={busy} onClick={() => void perform(() => interruptEncounterPendingAction(encounterId, selectedPending.id), `${selectedPending.label} was explicitly interrupted.`)}>Interrupt Action</button></section> : null}

    {participantHistory.length ? <section className="combat-aid-action-history"><header><div><span>AUTHORED ACTION HISTORY</span><strong>{participant.identity.name}</strong></div></header>{participantHistory.map((entry) => <div key={entry.id}><span><b>{entry.sourceKind} · {entry.sourceRef}</b><small>Targets: {entry.targetCharacterIds.map((id) => targets.find((target) => target.id === id)?.name ?? `#${id}`).join(", ") || "none"}</small></span><span className={`status-chip is-${entry.resolutionStatus}`}>{entry.resolutionStatus}</span>{entry.resolutionSummary ? <small>{entry.resolutionSummary}</small> : null}</div>)}</section> : null}
  </section>;
}
