import "server-only";

import { and, asc, eq } from "drizzle-orm";

import type { db } from "@/db";
import { skillExtension } from "@/db/skill-schema";
import {
  item,
  itemEffect,
  itemRuntimeProfile,
  weaponFiringMode,
  weaponProfile,
} from "@/db/item-schema";
import {
  campaignCharacter,
  campaignCharacterItem,
  campaignCharacterItemInstance,
  campaignCharacterSkillAllocation,
  campaignCharacterSpellDocument,
  campaignCreatureNpcProfile,
} from "@/db/realm-schema";
import { campaignSessionEncounterParticipant } from "@/db/tabletop-operations-schema";
import { decodeMechanicalEffect, type MechanicalEffect } from "@/features/mechanical-effects";
import {
  adaptCreatureAbilityToMechanicalEffects,
  normalizeCreatureAbilityDefinition,
} from "@/features/creatures/creature-ability";
import { loadCharacterDerivedAbilitiesInTransaction } from "@/features/derived-abilities/character-derived-ability-service";
import { adaptDerivedAbilityToMechanicalEffects } from "@/features/derived-abilities/derived-ability-effects";
import {
  resolveCharacterSkillLineageSelection,
  type CharacterWeaponGoverningSelection,
} from "@/features/items/character-weapon-governance";
import { lockActiveItemRootInTransaction } from "@/features/items/active-item-root-service";
import { loadCharacterSkillLineageInputInTransaction } from "@/features/items/character-weapon-governance-service";
import {
  prepareCharacterSpellCastInTransaction,
} from "@/features/characters/character-spell-runtime-service";
import type { SpellCastSourceRequest } from "@/features/characters/character-spell-runtime";
import { CHARACTER_ATTRIBUTE_KEYS, type CharacterAttributeKey } from "@/features/characters/models";
import {
  adaptProgressiveSpellToMechanicalEffects,
  adaptSpellToMechanicalEffects,
} from "@/features/spell-construction/mechanical-effects-adapter";
import { parseSpellDocument } from "@/features/spell-construction/spellDocumentCodec";

import type {
  FrozenActionAuthoredEffect,
  FrozenActionResourceCost,
  FrozenActionSourceSnapshot,
} from "./action-effect-bridge";
import type {
  ActionDeclarationDraft,
  LockedActionDeclarationSnapshot,
} from "./action-declaration";
import type { ActionDeclarationActor } from "./action-declaration-service";
import type { OwnedEncounterRuntimeContext } from "./runtime-integration-service";
import { resolveCreatureAttackInitiativeCost } from "./runtime-integration";

export type ActionSourceResolverTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ResolvedLockedActionSource = Readonly<{
  snapshot: FrozenActionSourceSnapshot;
  governing: LockedActionDeclarationSnapshot["governing"];
  authoritativeInitiativeCost: number | null;
}>;

type ParticipantSource = Readonly<{
  characterId: number;
  participantKind: string;
  creatureSnapshot: unknown;
  displayLabel: string;
  characterName: string | null;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function positiveId(value: unknown, label: string): number {
  const parsed = typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || (parsed as number) <= 0) throw new Error(`${label} is invalid.`);
  return parsed as number;
}

function requiredText(value: unknown, label: string, maximum = 500): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw new Error(`${label} is invalid.`);
  return normalized;
}

function optionalText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?(?:\d+\.?\d*|\.\d+)$/.test(value.trim())) return Number(value);
  return null;
}

function refId(ref: string | null, prefixes: readonly string[], label: string): number {
  const value = ref?.trim() ?? "";
  for (const prefix of prefixes) {
    if (value.startsWith(prefix)) return positiveId(value.slice(prefix.length), label);
  }
  return positiveId(value, label);
}

function sourcePayload(draft: ActionDeclarationDraft): Record<string, unknown> {
  return isRecord(draft.sourcePayload) ? structuredClone(draft.sourcePayload) : {};
}

function manualEffect(
  key: string,
  title: string,
  instruction: Readonly<Record<string, unknown>>,
  targets: readonly number[],
): FrozenActionAuthoredEffect {
  return {
    key,
    effect: null,
    instruction: { title, ...instruction },
    applicationSupported: false,
    requiresGodReview: true,
    targetParticipantIds: targets,
  };
}

function structuredEffect(
  key: string,
  effect: MechanicalEffect,
  targets: readonly number[],
  requiresGodReview = false,
  instruction: Readonly<Record<string, unknown>> = {},
): FrozenActionAuthoredEffect {
  const application = isRecord(instruction.application) ? instruction.application : null;
  const selectionRequired = effect.kind === "health.damage" || (effect.kind === "health.heal" && effect.scope === "area");
  const selectionPresent = !selectionRequired || (application !== null && (
    typeof application.poolKey === "string" && application.poolKey.trim().length > 0
    || Number.isSafeInteger(application.hitLocationNumber)
  ));
  return {
    key,
    effect: structuredClone(effect),
    instruction,
    applicationSupported: effect.kind !== "manual" && selectionPresent,
    requiresGodReview: requiresGodReview || effect.kind === "manual" || !selectionPresent,
    targetParticipantIds: targets,
  };
}

function snapshot(input: Omit<FrozenActionSourceSnapshot, "schemaVersion">): FrozenActionSourceSnapshot {
  return { schemaVersion: 1, ...input };
}

async function loadParticipant(
  tx: ActionSourceResolverTransaction,
  context: OwnedEncounterRuntimeContext,
  participantKey: number,
): Promise<ParticipantSource> {
  const [row] = await tx.select({
    characterId: campaignSessionEncounterParticipant.characterId,
    participantKind: campaignSessionEncounterParticipant.participantKind,
    creatureSnapshot: campaignSessionEncounterParticipant.creatureSnapshotJson,
    persistentCreatureSnapshot: campaignCreatureNpcProfile.currentSnapshotJson,
    displayLabel: campaignSessionEncounterParticipant.displayLabel,
    characterName: campaignCharacter.name,
  }).from(campaignSessionEncounterParticipant)
    .leftJoin(campaignCharacter, eq(campaignCharacter.id, campaignSessionEncounterParticipant.characterId))
    .leftJoin(campaignCreatureNpcProfile, eq(campaignCreatureNpcProfile.characterId, campaignCharacter.id))
    .where(and(
      eq(campaignSessionEncounterParticipant.encounterId, context.encounterId),
      eq(campaignSessionEncounterParticipant.sceneId, context.sceneId),
      eq(campaignSessionEncounterParticipant.sessionId, context.sessionId),
      eq(campaignSessionEncounterParticipant.campaignId, context.campaignId),
      eq(campaignSessionEncounterParticipant.characterId, participantKey),
    )).limit(1);
  if (!row) throw new Error("The acting participant no longer belongs to the exact Encounter.");
  return {
    ...row,
    creatureSnapshot: row.creatureSnapshot ?? (row.persistentCreatureSnapshot
      ? JSON.parse(row.persistentCreatureSnapshot) as unknown
      : null),
  };
}

function participantName(participant: ParticipantSource): string {
  return participant.participantKind === "creature"
    ? requiredText(participant.displayLabel, "Encounter Creature label", 240)
    : requiredText(participant.characterName, "Character name", 240);
}

function requireCharacterSource(participant: ParticipantSource, label: string): void {
  if (participant.participantKind !== "campaign-character" || participant.characterId <= 0) {
    throw new Error(`${label} requires a persistent Character identity; a direct Creature occurrence cannot be routed through Character state.`);
  }
}

function allTargets(draft: ActionDeclarationDraft): readonly number[] {
  return draft.targetCharacterIds.length ? draft.targetCharacterIds : [draft.actorCharacterId];
}

function asSpellSource(value: unknown, ref: string | null): SpellCastSourceRequest {
  if (isRecord(value) && value.kind === "catalog") {
    return { kind: "catalog", allocationId: positiveId(value.allocationId, "Catalog Spell allocation") };
  }
  if (isRecord(value) && value.kind === "personal") {
    return { kind: "personal", savedSpellId: positiveId(value.savedSpellId, "Personal Spell") };
  }
  if (isRecord(value) && value.kind === "raw-saved") {
    return {
      kind: "raw-saved",
      savedSpellId: positiveId(value.savedSpellId, "Saved raw Spell"),
      circumstance: requiredText(value.circumstance, "Raw Spell circumstance", 100) as Extract<SpellCastSourceRequest, { kind: "raw-saved" }>["circumstance"],
    };
  }
  const normalized = ref?.trim() ?? "";
  if (normalized.startsWith("spell:catalog:")) return { kind: "catalog", allocationId: refId(normalized, ["spell:catalog:"], "Catalog Spell allocation") };
  if (normalized.startsWith("spell:raw-saved:")) {
    return { kind: "raw-saved", savedSpellId: refId(normalized, ["spell:raw-saved:"], "Saved raw Spell"), circumstance: "no-framework" };
  }
  return { kind: "personal", savedSpellId: refId(normalized, ["spell:personal:", "spell:"], "Personal Spell") };
}

function payloadTargetGroups(payload: Record<string, unknown>): Record<string, number[]> {
  const selections = isRecord(payload.selections) ? payload.selections : {};
  if (!isRecord(selections.targetGroups)) return {};
  const groups: Record<string, number[]> = {};
  for (const [key, value] of Object.entries(selections.targetGroups)) {
    if (!Array.isArray(value)) throw new Error("Spell target-group selections are invalid.");
    groups[key] = value.map((entry) => {
      if (!Number.isSafeInteger(entry) || Number(entry) === 0) throw new Error("Spell target participant identity is invalid.");
      return Number(entry);
    });
  }
  return groups;
}

function assertSameTargets(actual: readonly number[], expected: readonly number[], label: string): void {
  const left = [...new Set(actual)].sort((a, b) => a - b);
  const right = [...new Set(expected)].sort((a, b) => a - b);
  if (JSON.stringify(left) !== JSON.stringify(right)) throw new Error(`${label} does not match the locked declaration target identity.`);
}

async function resolveWeapon(
  tx: ActionSourceResolverTransaction,
  participant: ParticipantSource,
  draft: ActionDeclarationDraft,
  weapon: NonNullable<LockedActionDeclarationSnapshot["weapon"]>,
  governing: LockedActionDeclarationSnapshot["governing"],
): Promise<ResolvedLockedActionSource> {
  requireCharacterSource(participant, "Weapon use");
  const [row] = await tx.select({
    itemId: item.id,
    canonicalId: item.canonicalId,
    name: item.name,
    itemUpdatedAt: item.updatedAt,
    profileId: weaponProfile.id,
    damage: weaponProfile.damage,
    damageSource: weaponProfile.damageSource,
    damageType: weaponProfile.damageType,
    initiativeCost: weaponProfile.initiativeCost,
    rangeText: weaponProfile.rangeText,
    reachText: weaponProfile.reachText,
    ammunitionItemId: weaponProfile.ammunitionItemId,
    rulesText: weaponProfile.rulesText,
    profileUpdatedAt: weaponProfile.updatedAt,
    firingModeId: weaponFiringMode.id,
    firingModeName: weaponFiringMode.name,
    firingModeReviewRequired: weaponFiringMode.mechanicsReviewRequired,
    firingModeUpdatedAt: weaponFiringMode.updatedAt,
  }).from(weaponProfile)
    .innerJoin(item, eq(item.id, weaponProfile.itemId))
    .leftJoin(weaponFiringMode, and(
      eq(weaponFiringMode.weaponProfileId, weaponProfile.id),
      draft.firingModeId === null ? eq(weaponFiringMode.id, -1) : eq(weaponFiringMode.id, draft.firingModeId),
    ))
    .where(and(eq(weaponProfile.id, weapon.weaponProfileId), eq(weaponProfile.itemId, weapon.itemId)))
    .limit(1);
  if (!row) throw new Error("The selected canonical Weapon/Profile no longer exists.");
  if (draft.firingModeId !== null && row.firingModeId !== draft.firingModeId) throw new Error("The selected Firing Mode no longer belongs to that Weapon Profile.");
  const effects = [manualEffect("weapon-damage-instruction", `${row.name} attack`, {
    damage: row.damage,
    damageSource: row.damageSource,
    damageType: row.damageType,
    range: row.rangeText,
    reach: row.reachText,
    ammunitionItemId: row.ammunitionItemId,
    rulesText: row.rulesText,
    nonautomation: "Full weapon damage, ammunition, armor, soak, hit location, recoil, and Called Shot rules are deferred.",
  }, allTargets(draft))];
  return {
    authoritativeInitiativeCost: row.initiativeCost,
    governing,
    snapshot: snapshot({
      kind: "weapon",
      identity: `weapon-profile:${row.profileId};item:${row.canonicalId}${row.firingModeId ? `;mode:${row.firingModeId}` : ""}`,
      sourceId: row.profileId,
      sourceInstanceId: draft.sourceInstanceId,
      ownerParticipantId: draft.actorCharacterId,
      displayName: row.firingModeName ? `${row.name} — ${row.firingModeName}` : row.name,
      authoringHref: `/heavens/items?item=${row.itemId}`,
      liveRevision: [row.itemUpdatedAt, row.profileUpdatedAt, row.firingModeUpdatedAt].filter(Boolean).map((date) => date!.toISOString()).sort().at(-1) ?? null,
      resolutionMode: governing?.status === "resolved" ? "opposed-roll" : "manual-god-ruling",
      governingSource: governing?.status === "resolved" ? governing.source as FrozenActionSourceSnapshot["governingSource"] : null,
      governingSnapshot: null,
      authoredData: row,
      resourceCosts: [],
      effects,
      warnings: row.firingModeReviewRequired ? ["The selected Firing Mode is still marked mechanics-review-required."] : [],
    }),
  };
}

async function resolveItem(
  tx: ActionSourceResolverTransaction,
  participant: ParticipantSource,
  draft: ActionDeclarationDraft,
): Promise<ResolvedLockedActionSource> {
  requireCharacterSource(participant, "Item use");
  const itemId = refId(draft.sourceRef, ["item:"], "Item");
  await lockActiveItemRootInTransaction(tx, itemId);
  const [row] = await tx.select({
    id: item.id,
    canonicalId: item.canonicalId,
    name: item.name,
    updatedAt: item.updatedAt,
    useMode: itemRuntimeProfile.useMode,
    quantityPerUse: itemRuntimeProfile.quantityPerUse,
    maximumCharges: itemRuntimeProfile.maximumCharges,
    chargesPerUse: itemRuntimeProfile.chargesPerUse,
    activationLabel: itemRuntimeProfile.activationLabel,
    useNotes: itemRuntimeProfile.useNotes,
    rechargeNotes: itemRuntimeProfile.rechargeNotes,
  }).from(item).leftJoin(itemRuntimeProfile, eq(itemRuntimeProfile.itemId, item.id)).where(eq(item.id, itemId)).limit(1);
  if (!row) throw new Error("The selected canonical Item no longer exists.");
  if (draft.sourceInstanceId === null) {
    const [owned] = await tx.select({ quantity: campaignCharacterItem.quantity }).from(campaignCharacterItem).where(and(
      eq(campaignCharacterItem.characterId, draft.actorCharacterId),
      eq(campaignCharacterItem.itemId, itemId),
    )).limit(1);
    if (!owned || owned.quantity <= 0) throw new Error("The acting Character no longer owns the selected Item stack.");
    if (row.useMode === "charges") throw new Error("This Item requires one exact owned Item-instance identity.");
  } else {
    if (row.useMode !== "charges") {
      throw new Error("This Item uses stack ownership and cannot be locked with an Item-instance identity.");
    }
    const [owned] = await tx.select({ id: campaignCharacterItemInstance.id }).from(campaignCharacterItemInstance).where(and(
      eq(campaignCharacterItemInstance.id, draft.sourceInstanceId),
      eq(campaignCharacterItemInstance.characterId, draft.actorCharacterId),
      eq(campaignCharacterItemInstance.itemId, itemId),
    )).limit(1);
    if (!owned) throw new Error("The acting Character no longer owns that exact Item instance.");
  }
  const effectRows = await tx.select().from(itemEffect).where(eq(itemEffect.itemId, itemId)).orderBy(asc(itemEffect.sortOrder), asc(itemEffect.id));
  const targets = allTargets(draft);
  const itemPayload = sourcePayload(draft);
  const itemSelections = isRecord(itemPayload.effectSelections) ? itemPayload.effectSelections : {};
  const effects = effectRows.map((effectRow) => structuredEffect(
    `item-effect:${effectRow.id}`,
    decodeMechanicalEffect({ schemaVersion: effectRow.schemaVersion, effectJson: effectRow.effectJson }),
    targets,
    false,
    { application: isRecord(itemSelections[String(effectRow.id)]) ? itemSelections[String(effectRow.id)] as Record<string, unknown> : {} },
  ));
  const costs: FrozenActionResourceCost[] = row.useMode === "consume-item"
    ? [{ key: `item:${itemId}:quantity`, kind: "item-quantity", amount: row.quantityPerUse, resourceKey: row.canonicalId, instruction: "Consume the authored Item quantity through the Item runtime.", applicationSupported: true }]
    : row.useMode === "charges"
      ? [{ key: `item:${itemId}:charges`, kind: "item-charges", amount: row.chargesPerUse, resourceKey: row.canonicalId, instruction: "Spend the authored charges on the exact owned Item instance.", applicationSupported: true }]
      : [];
  return {
    authoritativeInitiativeCost: null,
    governing: null,
    snapshot: snapshot({
      kind: "item",
      identity: `item:${row.canonicalId}${draft.sourceInstanceId ? `;instance:${draft.sourceInstanceId}` : ";stack"}`,
      sourceId: row.id,
      sourceInstanceId: draft.sourceInstanceId,
      ownerParticipantId: draft.actorCharacterId,
      displayName: row.activationLabel ? `${row.name} — ${row.activationLabel}` : row.name,
      authoringHref: `/heavens/items?item=${row.id}`,
      liveRevision: row.updatedAt.toISOString(),
      resolutionMode: "automatic-no-roll",
      governingSource: null,
      governingSnapshot: null,
      authoredData: row,
      resourceCosts: costs,
      effects,
      warnings: effects.length ? [] : ["This Item has no structured authored Mechanical Effects."],
    }),
  };
}

async function loadSpellDocument(
  tx: ActionSourceResolverTransaction,
  characterId: number,
  source: SpellCastSourceRequest,
): Promise<{ spell: ReturnType<typeof parseSpellDocument>; revision: string | null }> {
  if (source.kind === "catalog") {
    const [allocation] = await tx.select({
      skillId: campaignCharacterSkillAllocation.skillId,
      points: campaignCharacterSkillAllocation.points,
      updatedAt: campaignCharacterSkillAllocation.updatedAt,
      dataJson: skillExtension.dataJson,
    }).from(campaignCharacterSkillAllocation)
      .innerJoin(skillExtension, and(
        eq(skillExtension.skillId, campaignCharacterSkillAllocation.skillId),
        eq(skillExtension.extensionType, "spell-construction"),
      ))
      .where(and(
        eq(campaignCharacterSkillAllocation.id, source.allocationId),
        eq(campaignCharacterSkillAllocation.characterId, characterId),
      )).limit(1);
    if (!allocation || allocation.points <= 0) throw new Error("The actor no longer owns that exact Catalog Spell allocation.");
    return { spell: parseSpellDocument(allocation.dataJson), revision: allocation.updatedAt.toISOString() };
  }
  if (source.kind === "raw-formula") throw new Error("An unsaved raw formula has no durable action-source identity.");
  const [row] = await tx.select().from(campaignCharacterSpellDocument).where(and(
    eq(campaignCharacterSpellDocument.id, source.savedSpellId),
    eq(campaignCharacterSpellDocument.characterId, characterId),
  )).limit(1);
  if (!row) throw new Error("The exact saved Spell no longer belongs to the acting Character.");
  if (source.kind === "personal" && !row.inSpellbook) throw new Error("The selected Personal Spell is no longer in this Character's Spellbook.");
  if (source.kind === "raw-saved" && row.inSpellbook) throw new Error("The selected Spellbook Spell cannot be locked as a raw formula.");
  return { spell: parseSpellDocument(JSON.parse(row.documentJson)), revision: row.updatedAt.toISOString() };
}

async function resolveSpell(
  tx: ActionSourceResolverTransaction,
  participant: ParticipantSource,
  draft: ActionDeclarationDraft,
  actingUserId: string,
): Promise<ResolvedLockedActionSource> {
  requireCharacterSource(participant, "Spell casting");
  const payload = sourcePayload(draft);
  const source = asSpellSource(payload.source, draft.sourceRef);
  const targetGroups = payloadTargetGroups(payload);
  const spellSelections = isRecord(payload.selections) && isRecord(payload.selections.applications)
    ? payload.selections.applications
    : {};
  const selectedTargets = Object.values(targetGroups).flat();
  if (selectedTargets.length) assertSameTargets(selectedTargets, draft.targetCharacterIds, "Spell target selection");
  const loaded = await loadSpellDocument(tx, draft.actorCharacterId, source);
  const preview = await prepareCharacterSpellCastInTransaction(tx, {
    casterCharacterId: draft.actorCharacterId,
    source,
    selections: { targetGroups: {}, applications: {} },
  }, actingUserId);
  const adapted = preview.plan.activeProgressiveTier
    ? adaptProgressiveSpellToMechanicalEffects(loaded.spell, preview.plan.activeProgressiveTier)
    : adaptSpellToMechanicalEffects(loaded.spell);
  const targets = allTargets(draft);
  const effects = adapted.valid
    ? adapted.effects.flatMap((entry) => {
        const groupId = [...entry.containerPath].reverse().find((id) => targetGroups[id] !== undefined);
        const exactTargets = groupId ? targetGroups[groupId]! : targets;
        return exactTargets.map((targetId) => structuredEffect(
          `spell-effect:${entry.spellEffectId}:target:${targetId}`,
          entry.definition.effect,
          [targetId],
          groupId === undefined && draft.targetCharacterIds.length > 0,
          {
            spellEffectId: entry.spellEffectId,
            ruleId: entry.ruleId,
            containerPath: entry.containerPath,
            application: isRecord(spellSelections[`${entry.spellEffectId}:${targetId}`])
              ? spellSelections[`${entry.spellEffectId}:${targetId}`] as Record<string, unknown>
              : {},
          },
        ));
      })
    : [manualEffect("spell-invalid-effects", loaded.spell.name, { issues: adapted.issues }, targets)];
  return {
    authoritativeInitiativeCost: preview.plan.finalInitiativeCost,
    governing: {
      status: "needs-god-ruling",
      source: null,
      rollOverTarget: null,
      explanation: "The current canonical Spell runtime does not author a casting Roll resolution mode. A no-roll, Skill, Attribute, opposed, or manual ruling must be explicit.",
    },
    snapshot: snapshot({
      kind: "spell",
      identity: `spell:${preview.plan.source.identity};document:${loaded.spell.id}`,
      sourceId: preview.plan.source.identity,
      sourceInstanceId: null,
      ownerParticipantId: draft.actorCharacterId,
      displayName: loaded.spell.name,
      authoringHref: `/realms/characters/${draft.actorCharacterId}/spellbook`,
      liveRevision: loaded.revision,
      resolutionMode: "manual-god-ruling",
      governingSource: null,
      governingSnapshot: null,
      authoredData: { spell: loaded.spell, casting: preview.plan },
      resourceCosts: [{
        key: `spell-mana:${preview.plan.source.identity}`,
        kind: "mana",
        amount: preview.plan.finalManaCost,
        resourceKey: preview.plan.caster.system,
        instruction: `Spend the canonical ${preview.plan.caster.system} Mana cost at approved application.`,
        applicationSupported: true,
      }],
      effects,
      warnings: [
        "The Spell source and costs are frozen, but its casting Roll mode requires an explicit G.O.D. ruling.",
        ...preview.plan.warnings,
        ...preview.plan.issues,
      ],
    }),
  };
}

async function resolveDerivedAbility(
  tx: ActionSourceResolverTransaction,
  participant: ParticipantSource,
  draft: ActionDeclarationDraft,
  actingUserId: string,
): Promise<ResolvedLockedActionSource> {
  requireCharacterSource(participant, "Derived Ability use");
  const abilityId = refId(draft.sourceRef, ["derived-ability:"], "Derived Ability");
  const state = await loadCharacterDerivedAbilitiesInTransaction(tx, draft.actorCharacterId, actingUserId, false);
  const ability = state.catalog.find(({ id }) => id === abilityId);
  const status = state.resolution.statuses.find(({ abilityId: id }) => id === abilityId);
  if (!ability || !status?.possessed || !status.available) throw new Error("The exact Derived Ability is not possessed and available to the acting Character.");
  const adapted = adaptDerivedAbilityToMechanicalEffects(ability);
  const payload = sourcePayload(draft);
  const selections = isRecord(payload.effectSelections) ? payload.effectSelections : {};
  const targets = allTargets(draft);
  const effects = adapted.effects.map((entry) => {
    const selection = isRecord(selections[String(entry.sortOrder)]) ? selections[String(entry.sortOrder)] as Record<string, unknown> : null;
    const selectedTarget = selection?.targetCharacterId === undefined || selection.targetCharacterId === null
      ? null
      : Number(selection.targetCharacterId);
    if (selectedTarget !== null && (!Number.isSafeInteger(selectedTarget) || !targets.includes(selectedTarget))) {
      throw new Error("A Derived Ability effect target is outside the locked declaration target set.");
    }
    return structuredEffect(
      `derived-effect:${entry.sortOrder}`,
      entry.definition.effect,
      selectedTarget === null ? targets : [selectedTarget],
      selectedTarget === null && draft.targetCharacterIds.length > 1,
      {
        compatibilityFallback: entry.compatibilityFallback,
        sortOrder: entry.sortOrder,
        application: selection ?? {},
      },
    );
  });
  const resourceCosts: FrozenActionResourceCost[] = ability.costs.map((cost) => ({
    key: `derived-cost:${cost.sortOrder}`,
    kind: cost.costType === "mana" ? "mana" : cost.costType === "initiative" ? "manual" : "manual",
    amount: cost.amount,
    resourceKey: cost.resourceKey,
    instruction: `${cost.costType} cost: ${cost.amount}${cost.resourceKey ? ` ${cost.resourceKey}` : ""}.`,
    applicationSupported: cost.costType === "mana" && typeof cost.resourceKey === "string",
  }));
  const initiative = ability.costs.filter(({ costType }) => costType === "initiative").reduce((sum, cost) => sum + cost.amount, 0);
  return {
    authoritativeInitiativeCost: initiative > 0 ? initiative : null,
    governing: {
      status: "needs-god-ruling",
      source: null,
      rollOverTarget: null,
      explanation: "This Derived Ability has authored activation, costs, limits, and effects, but no canonical Roll resolution-mode field. Acquisition requirements and prose were not used to infer one.",
    },
    snapshot: snapshot({
      kind: "derived-ability",
      identity: `derived-ability:${ability.id}${status.ownershipId ? `;ownership:${status.ownershipId}` : ";automatic"}`,
      sourceId: ability.id,
      sourceInstanceId: status.ownershipId,
      ownerParticipantId: draft.actorCharacterId,
      displayName: ability.name,
      authoringHref: `/heavens/derived-abilities?ability=${ability.id}`,
      liveRevision: null,
      resolutionMode: "manual-god-ruling",
      governingSource: null,
      governingSnapshot: null,
      authoredData: { ability, resolvedStatus: status },
      resourceCosts,
      effects,
      warnings: ["Missing canonical Derived Ability execution mode; G.O.D. ruling required."],
    }),
  };
}

async function resolveSkillOrAttribute(
  tx: ActionSourceResolverTransaction,
  participant: ParticipantSource,
  draft: ActionDeclarationDraft,
): Promise<ResolvedLockedActionSource> {
  requireCharacterSource(participant, "Character Skill or Attribute use");
  const selection: CharacterWeaponGoverningSelection = draft.sourceKind === "skill"
    ? { kind: "skill", allocationId: refId(draft.sourceRef, ["skill-allocation:", "skill:"], "Skill allocation") }
    : (() => {
        const attributeKey = requiredText(draft.sourceRef?.replace(/^attribute:/, ""), "Attribute", 20).toUpperCase() as CharacterAttributeKey;
        if (!CHARACTER_ATTRIBUTE_KEYS.includes(attributeKey)) throw new Error("The selected Character Attribute is invalid.");
        return { kind: "attribute" as const, attributeKey };
      })();
  const resolved = resolveCharacterSkillLineageSelection(
    await loadCharacterSkillLineageInputInTransaction(tx, draft.actorCharacterId),
    selection,
  );
  if (!resolved || resolved.source.kind === "manual") throw new Error("The exact Character Skill allocation lineage or Attribute cannot be resolved.");
  const sourceId = resolved.source.kind === "skill" ? resolved.source.allocationId : resolved.source.attributeKey;
  const name = resolved.source.kind === "skill" ? resolved.source.skillName : `${resolved.source.attributeKey} straight Attribute`;
  const sourceKind = draft.sourceKind === "skill" ? "skill" as const : "attribute" as const;
  const governing = {
    status: "resolved" as const,
    source: resolved.rollGoverningSource,
    rollOverTarget: resolved.source.originalTarget,
    explanation: resolved.source.kind === "skill"
      ? `Exact Skill allocation #${resolved.source.allocationId} and its parent-allocation lineage were frozen.`
      : `Exact ${resolved.source.attributeKey} Character Attribute was frozen.`,
  };
  return {
    authoritativeInitiativeCost: null,
    governing,
    snapshot: snapshot({
      kind: sourceKind,
      identity: resolved.source.kind === "skill" ? `skill-allocation:${resolved.source.allocationId}` : `attribute:${resolved.source.attributeKey}`,
      sourceId,
      sourceInstanceId: resolved.source.kind === "skill" ? resolved.source.allocationId : null,
      ownerParticipantId: draft.actorCharacterId,
      displayName: name,
      authoringHref: `/realms/characters/${draft.actorCharacterId}`,
      liveRevision: null,
      resolutionMode: resolved.source.kind === "skill" ? "skill-roll" : "attribute-roll",
      governingSource: resolved.rollGoverningSource,
      governingSnapshot: resolved.rollGoverningSourceSnapshot,
      authoredData: { resolvedSource: resolved.source },
      resourceCosts: [],
      effects: [manualEffect("unstructured-character-action", name, {
        instruction: "This exact Character source has no structured authored consequence. The G.O.D. must record the outcome without interpreting the Skill or Attribute name as an effect.",
      }, allTargets(draft))],
      warnings: [],
    }),
  };
}

function creatureSnapshot(participant: ParticipantSource): Record<string, unknown> {
  if (!isRecord(participant.creatureSnapshot)) throw new Error("The exact encounter Creature snapshot is missing or malformed.");
  return participant.creatureSnapshot;
}

async function resolveCreatureSource(
  participant: ParticipantSource,
  draft: ActionDeclarationDraft,
): Promise<ResolvedLockedActionSource> {
  const frozen = creatureSnapshot(participant);
  const targets = allTargets(draft);
  if (draft.sourceKind === "creature-attack") {
    const attacks = Array.isArray(frozen.attacks) ? frozen.attacks.filter(isRecord) : [];
    const sourceRef = requiredText(draft.sourceRef, "Creature Attack identity");
    const attack = attacks.find((candidate) => candidate.canonicalId === sourceRef);
    if (!attack) throw new Error("The exact authored Creature Attack is no longer present in this encounter snapshot.");
    const target = numeric(attack.attackPercentage);
    const governingSource = target === null ? null : { kind: "manual" as const, label: `${participantName(participant)} — ${requiredText(attack.attackName, "Creature Attack name")}`, originalTarget: target };
    const governing = target === null ? {
      status: "needs-god-ruling" as const,
      source: null,
      rollOverTarget: null,
      explanation: "The Creature Attack has no exact numeric authored attack percentage.",
    } : {
      status: "resolved" as const,
      source: governingSource,
      rollOverTarget: target,
      explanation: "Used the exact numeric attack percentage from this encounter occurrence's frozen Creature snapshot.",
    };
    const initiative = resolveCreatureAttackInitiativeCost({
      attackName: requiredText(attack.attackName, "Creature Attack name"),
      damage: typeof attack.damage === "string" || typeof attack.damage === "number" ? attack.damage : null,
    });
    return {
      authoritativeInitiativeCost: initiative.cost,
      governing,
      snapshot: snapshot({
        kind: "creature-attack",
        identity: `creature-attack:${sourceRef}`,
        sourceId: sourceRef,
        sourceInstanceId: null,
        ownerParticipantId: draft.actorCharacterId,
        displayName: requiredText(attack.attackName, "Creature Attack name"),
        authoringHref: null,
        liveRevision: null,
        resolutionMode: governingSource ? "opposed-roll" : "manual-god-ruling",
        governingSource,
        governingSnapshot: governingSource,
        authoredData: attack,
        resourceCosts: [],
        effects: [manualEffect("creature-attack-instruction", requiredText(attack.attackName, "Creature Attack name"), {
          damage: attack.damage ?? null,
          damageType: attack.damageType ?? "",
          specialEffect: attack.specialEffect ?? "",
          requirements: attack.requirements ?? "",
          nonautomation: "Attack damage, armor, soak, hit location, and narrative consequences remain deferred.",
        }, targets)],
        warnings: [
          ...(governingSource ? [] : ["Creature Attack Roll requires a G.O.D. ruling."]),
          ...(initiative.cost === null ? ["Creature Attack Initiative Cost requires a G.O.D. ruling."] : []),
        ],
      }),
    };
  }
  const abilities = Array.isArray(frozen.abilities) ? frozen.abilities : [];
  const sourceRef = requiredText(draft.sourceRef, "Creature Ability identity");
  const candidate = abilities.find((ability) => isRecord(ability) && ability.canonicalId === sourceRef);
  if (!candidate) throw new Error("The exact authored Creature Ability is no longer present in this encounter snapshot.");
  const ability = normalizeCreatureAbilityDefinition(candidate);
  const adapted = adaptCreatureAbilityToMechanicalEffects(ability);
  const payload = sourcePayload(draft);
  const selections = isRecord(payload.effectSelections) ? payload.effectSelections : {};
  const effects = adapted.valid
    ? adapted.effects.flatMap((entry) => targets.map((targetId) => structuredEffect(
        `creature-ability-effect:${entry.effectKey}:target:${targetId}`,
        entry.definition.effect,
        [targetId],
        true,
        {
          effectKey: entry.effectKey,
          compatibilityFallback: entry.compatibilityFallback,
          application: isRecord(selections[`${entry.effectKey}:${targetId}`])
            ? selections[`${entry.effectKey}:${targetId}`] as Record<string, unknown>
            : {},
        },
      )))
    : [manualEffect("creature-ability-invalid", ability.abilityName, { issues: adapted.issues }, targets)];
  const directOccurrence = participant.participantKind === "creature";
  return {
    authoritativeInitiativeCost: null,
    governing: {
      status: "needs-god-ruling",
      source: null,
      rollOverTarget: null,
      explanation: "The Creature Ability has no safe explicitly authored Roll executor. Its exact identity and effects are frozen for G.O.D. review.",
    },
    snapshot: snapshot({
      kind: "creature-ability",
      identity: `creature-ability:${ability.canonicalId}`,
      sourceId: ability.canonicalId,
      sourceInstanceId: null,
      ownerParticipantId: draft.actorCharacterId,
      displayName: ability.abilityName,
      authoringHref: null,
      liveRevision: null,
      resolutionMode: "manual-god-ruling",
      governingSource: null,
      governingSnapshot: null,
      authoredData: ability as unknown as Record<string, unknown>,
      resourceCosts: [],
      effects,
      warnings: [directOccurrence
        ? "Direct Creature ability effects require G.O.D. approval; supported mutations remain occurrence-local."
        : "Creature NPC ability execution mode requires a G.O.D. ruling."],
    }),
  };
}

function resolveNoRollOrManual(
  context: OwnedEncounterRuntimeContext,
  actor: ActionDeclarationActor,
  participant: ParticipantSource,
  declarationId: number,
  draft: ActionDeclarationDraft,
): ResolvedLockedActionSource {
  const kind = draft.sourceKind === "manual" || (draft.sourceKind === "generic" && participant.participantKind === "creature")
    ? "manual" as const
    : "no-roll" as const;
  if (kind === "manual" && (actor.authority !== "god-owner" || actor.userId !== context.ownerUserId)) {
    throw new Error("Only the Campaign-owning G.O.D. may lock a Manual G.O.D. ruling source.");
  }
  const payload = sourcePayload(draft);
  const instruction = optionalText(payload.instruction) || draft.godNotes;
  const effects = kind === "manual" && instruction
    ? [manualEffect("god-manual-instruction", draft.label, { instruction }, allTargets(draft))]
    : [];
  return {
    authoritativeInitiativeCost: null,
    governing: kind === "manual" ? {
      status: "needs-god-ruling",
      source: null,
      rollOverTarget: null,
      explanation: "This action source is an explicit manual G.O.D. ruling.",
    } : null,
    snapshot: snapshot({
      kind,
      identity: `${kind}:declaration:${declarationId}`,
      sourceId: declarationId,
      sourceInstanceId: null,
      ownerParticipantId: draft.actorCharacterId,
      displayName: kind === "manual" ? `G.O.D. ruling — ${draft.label}` : draft.label,
      authoringHref: null,
      liveRevision: null,
      resolutionMode: kind === "manual" ? "manual-god-ruling" : "automatic-no-roll",
      governingSource: null,
      governingSnapshot: null,
      authoredData: { label: draft.label, actionKind: draft.actionKind, instruction },
      resourceCosts: [],
      effects,
      warnings: draft.sourceKind === "generic" ? ["Legacy Generic source was preserved as an explicit no-roll descriptive action."] : [],
    }),
  };
}

export async function resolveLockedActionSourceInTransaction(
  tx: ActionSourceResolverTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: ActionDeclarationActor,
  declarationId: number,
  draft: ActionDeclarationDraft,
  existing: {
    weapon: LockedActionDeclarationSnapshot["weapon"];
    governing: LockedActionDeclarationSnapshot["governing"];
  },
): Promise<ResolvedLockedActionSource> {
  const participant = await loadParticipant(tx, context, draft.actorCharacterId);
  if (draft.sourceKind === "weapon") {
    if (!existing.weapon) throw new Error("A Weapon source requires the exact locked Weapon Profile.");
    return resolveWeapon(tx, participant, draft, existing.weapon, existing.governing);
  }
  if (draft.sourceKind === "item") return resolveItem(tx, participant, draft);
  if (draft.sourceKind === "spell") return resolveSpell(tx, participant, draft, actor.userId);
  if (draft.sourceKind === "derived-ability") return resolveDerivedAbility(tx, participant, draft, actor.userId);
  if (draft.sourceKind === "skill" || draft.sourceKind === "attribute") return resolveSkillOrAttribute(tx, participant, draft);
  if (draft.sourceKind === "creature-attack" || draft.sourceKind === "creature-ability") {
    return resolveCreatureSource(participant, draft);
  }
  return resolveNoRollOrManual(context, actor, participant, declarationId, draft);
}
