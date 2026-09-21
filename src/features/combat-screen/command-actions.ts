"use server";
import { readAbilityResponseChoicesInTransaction } from "@/features/tabletop-operations/ability-response-service";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { requireGod, requirePlayer } from "@/lib/server-access";
import { campaignCharacter, campaignCreatureNpcProfile } from "@/db/realm-schema";
import { campaignCharacterItem, campaignCharacterItemInstance } from "@/db/realm-schema";
import { item, itemPower, itemPowerConstruction, itemPowerEffect, itemPowerResource, itemPowerSource } from "@/db/item-schema";
import { skill, skillExtension } from "@/db/skill-schema";
import { campaignSessionEncounterParticipant as member } from "@/db/tabletop-operations-schema";
import { getCharacter } from "@/app/characters/actions";
import { readCharacterEquipmentStateInTransaction } from "@/features/items/equipment-state-service";
import { readActiveHealthInTransaction } from "@/features/active-state/active-health-service";
import { readFirearmWorkspaceInTransaction, applyFirearmCatalogConfigurationInTransaction } from "@/features/tabletop-operations/firearm-readiness-service";
import { readDefenseInterventionWorkspaceInTransaction, declareDefenseInterventionInTransaction, previewDefenseInterventionInTransaction, type DefenseDeclarationInput } from "@/features/tabletop-operations/defense-intervention-service";
import { readOpenDeclarationCheckpoint } from "@/features/tabletop-operations/declaration-checkpoint-service";
import { lockOwnedEncounterRuntimeInTransaction, type RuntimeIntegrationTransaction as Tx } from "@/features/tabletop-operations/runtime-integration-service";
import { lockPlayerCombatContextInTransaction } from "@/features/tabletop-operations/player-combat-ruling-service";
import { resolveInitiativeCapacityOptionsInTransaction } from "@/features/tabletop-operations/initiative-capacity-service";
import { assemblePlayerTabletopSpells, assemblePlayerTabletopDerivedAbilities } from "@/features/tabletop-operations/player-tabletop-console";
import { prepareCharacterSpellCastInTransaction } from "@/features/characters/character-spell-runtime-service";
import { resolveItemPowerConstruction } from "@/features/items/item-powers";
import { analyzeSpellTargetGroups } from "@/features/spell-construction/spell-target-groups";
import { parseSpellDocument } from "@/features/spell-construction/spellDocumentCodec";
import { publishTabletopInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
import type { SpellCastSourceRequest } from "@/features/characters/character-spell-runtime";
import type { ActionDeclarationActor, DeclarationRollInput } from "@/features/tabletop-operations/action-declaration-service";
import { previewCombatChoiceInTransaction, submitCombatChoiceInTransaction } from "./choice-service";
import type { CombatChoice, CombatSubmission, CombatSourceChoice } from "./choice-types";
import type { CombatScreenScope } from "./screen-types";
import { readPlayerCombatRulingRequestsInTransaction } from "@/features/tabletop-operations/player-combat-ruling-service";
import { resolveCombatMovementInTransaction } from "@/features/tabletop-operations/combat-movement-service";
import { isSupportedAmmunitionWeaponType, UNSUPPORTED_PROJECTILE_MESSAGE } from "@/features/items/firearm-classification";
import { readMagazineInventoryInTransaction } from "@/features/items/magazine-inventory-service";
import { startCombatMagazineFill, type CombatMagazineFillCommand } from "@/features/tabletop-operations/combat-magazine-fill-service";
import { readMeleeDrawOptions, startMeleeDraw, type MeleeDrawCommand } from "@/features/tabletop-operations/combat-melee-draw-service";
import { weaponAttackMode } from "@/features/items/weapon-range";

async function authorized<T>(scope: CombatScreenScope, operation: (tx: Tx, context: Awaited<ReturnType<typeof lockOwnedEncounterRuntimeInTransaction>>, actor: ActionDeclarationActor) => Promise<T>, publish = false) {
  if (scope.role !== "god" && scope.role !== "player") throw new Error("Invalid combat role.");
  const access = scope.role === "god" ? await requireGod() : await requirePlayer();
  return db.transaction(async (tx) => {
    const context = scope.role === "god" ? await lockOwnedEncounterRuntimeInTransaction(tx, scope.encounterId, access.user.id)
      : await lockPlayerCombatContextInTransaction(tx, scope.encounterId, scope.characterId, access.user.id);
    const actor: ActionDeclarationActor = scope.role === "god" ? { authority: "god-owner", userId: access.user.id } : { authority: "player", userId: access.user.id, characterId: scope.characterId };
    const result = await operation(tx, context, actor);
    if (publish) await publishTabletopInvalidationInTransaction(tx, { campaignId: context.campaignId, sessionId: context.sessionId, sceneId: context.sceneId, encounterId: scope.encounterId, characterIds: [], category: "action" });
    return result;
  });
}
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const records = (value: unknown) => Array.isArray(value) ? value.map(object) : [];

export async function readCombatCommandSources(scope: CombatScreenScope, participantId: number) {
  const loaded = await authorized(scope, async (tx, context, actor) => {
    if (actor.authority === "player" && actor.characterId !== participantId) throw new Error("Only your own Character's sources are readable.");
    const [row] = await tx.select({ snapshot: member.creatureSnapshotJson, local: member.localStateJson, isNpc: campaignCharacter.isNpc,
      npcKind: campaignCharacter.npcKind, persistentSnapshot: campaignCreatureNpcProfile.currentSnapshotJson }).from(member)
      .leftJoin(campaignCharacter, eq(campaignCharacter.id, member.characterId)).leftJoin(campaignCreatureNpcProfile, eq(campaignCreatureNpcProfile.characterId, member.characterId))
      .where(and(eq(member.encounterId, context.encounterId), eq(member.characterId, participantId)));
    if (!row) throw new Error("Choose an exact encounter member.");
    const checkpoint = await readOpenDeclarationCheckpoint(tx, context.encounterId);
    if (checkpoint && actor.authority === "god-owner" && participantId > 0 && !row.isNpc) throw new Error("Inspect source rulings after simultaneous choices are revealed.");
    const equipment = participantId > 0 ? await readCharacterEquipmentStateInTransaction(tx, participantId) : null;
    const meleeDraws = participantId > 0 ? await readMeleeDrawOptions(tx, participantId) : [];
    const magazines = participantId > 0 ? await readMagazineInventoryInTransaction(tx, participantId, actor.userId) : null;
    const firearms = participantId > 0 ? await readFirearmWorkspaceInTransaction(tx, context, participantId, null, actor.authority === "player" || row.isNpc ? actor : undefined) : null;
    const defenses = checkpoint ? null : await readDefenseInterventionWorkspaceInTransaction(tx, context, actor);
    const requests = actor.authority === "player" ? await readPlayerCombatRulingRequestsInTransaction(tx, context.encounterId, actor.characterId, actor.userId) : [];
    const movement = await resolveInitiativeCapacityOptionsInTransaction(tx, participantId, context.campaignId).catch(() => null);
    const abilityStacks = participantId > 0 ? await tx.select({ itemId: campaignCharacterItem.itemId, quantity: campaignCharacterItem.quantity, itemName: item.name, canonicalId: item.canonicalId, powerId: itemPower.id, powerName: itemPower.name, initiativeCost: itemPower.initiativeCost, resourceKind: itemPower.resourceCostKind, resourceAmount: itemPower.resourceCostAmount, hasPowerPool: itemPowerResource.itemId }).from(campaignCharacterItem).innerJoin(item, eq(item.id, campaignCharacterItem.itemId)).innerJoin(itemPower, eq(itemPower.itemId, item.id)).leftJoin(itemPowerResource, eq(itemPowerResource.itemId, item.id)).where(and(eq(campaignCharacterItem.characterId, participantId), eq(itemPower.trigger, "activated"))) : [];
    const abilityInstances = participantId > 0 ? await tx.select({ instanceId: campaignCharacterItemInstance.id, itemId: campaignCharacterItemInstance.itemId, currentCharges: campaignCharacterItemInstance.currentCharges, itemName: item.name, canonicalId: item.canonicalId, powerId: itemPower.id, powerName: itemPower.name, initiativeCost: itemPower.initiativeCost, resourceKind: itemPower.resourceCostKind, resourceAmount: itemPower.resourceCostAmount, hasPowerPool: itemPowerResource.itemId }).from(campaignCharacterItemInstance).innerJoin(item, eq(item.id, campaignCharacterItemInstance.itemId)).innerJoin(itemPower, eq(itemPower.itemId, item.id)).leftJoin(itemPowerResource, eq(itemPowerResource.itemId, item.id)).where(and(eq(campaignCharacterItemInstance.characterId, participantId), isNull(campaignCharacterItemInstance.retiredAt), eq(itemPower.trigger, "activated"))) : [];
    const snapshot = row.snapshot ?? (row.persistentSnapshot ? JSON.parse(row.persistentSnapshot) : null);
    return { equipment, meleeDraws, firearms, magazines, requests, defense: defenses?.participants.find((entry) => entry.characterId === participantId) ?? null,
      movement: movement?.movementModes ?? [], snapshot, isNpc: row.isNpc, abilityStacks, abilityInstances, rulings: records(object(row.local).combatSourceResolutionHistory) };
  });
  const sources: CombatSourceChoice[] = [];
  for (const weapon of loaded.equipment?.wieldedWeapons ?? []) {
    let mode = weapon.rangeMode;
    let modeIssue: string | undefined;
    try { mode = mode === "hybrid" ? mode : weaponAttackMode(mode, null, !!weapon.ammunitionTiming || isSupportedAmmunitionWeaponType(weapon.weaponType), weapon.weaponType); }
    catch (error) { modeIssue = error instanceof Error ? error.message : "This weapon needs an authored attack mode."; }
    sources.push({ kind: "weapon", ref: weapon.ownershipKey, name: weapon.itemName, instanceId: weapon.instanceId, itemId: weapon.itemId, handedness: weapon.handedness,
      rangeMode: mode, distanceUnit: weapon.distanceUnit,
      unavailable: modeIssue ?? (!isSupportedAmmunitionWeaponType(weapon.weaponType) && (weapon.ammunitionTiming || weapon.firingModes.length) ? UNSUPPORTED_PROJECTILE_MESSAGE : undefined),
      description: isSupportedAmmunitionWeaponType(weapon.weaponType) ? "" : weapon.initiativeCost === null ? "Needs an authored timing ruling." : `${weapon.initiativeCost} Initiative` });
  }
  for (const firearm of loaded.firearms?.firearms ?? []) if (!sources.some((source) => source.instanceId === firearm.itemInstanceId)) sources.push({ kind: "weapon", ref: `instance:${firearm.itemInstanceId}`, name: firearm.itemName, instanceId: firearm.itemInstanceId, itemId: firearm.itemId, handedness: firearm.canonical.handedness, description: "Inspect ammunition and preparation before firing." });
  for (const attack of records(object(loaded.snapshot).attacks)) sources.push({ kind: "creature-attack", ref: String(attack.canonicalId), name: String(attack.attackName), instanceId: null, itemId: null, description: `${attack.attackPercentage ?? "?"}% · ${attack.damage ?? "?"} damage` });
  for (const ability of records(object(loaded.snapshot).abilities)) sources.push({ kind: "creature-ability", ref: String(ability.canonicalId), name: String(ability.abilityName), instanceId: null, itemId: null, description: String(ability.description ?? ""), unavailable: object(ability.authoring).activationType === "passive" ? "Passive trait: automatic lifecycle is not supported yet; this is not an activated action." : undefined });
  let aggregateIssue = "";
  if (participantId > 0) {
    try {
      const aggregate = await getCharacter(participantId, scope.role === "god");
      for (const spell of assemblePlayerTabletopSpells(aggregate)) sources.push({ kind: "spell", ref: spell.castSource?.kind === "catalog" ? `catalog:${spell.castSource.allocationId}` : spell.castSource && "savedSpellId" in spell.castSource ? `${spell.castSource.kind}:${spell.castSource.savedSpellId}` : spell.key,
        name: spell.name, instanceId: null, itemId: null, description: [spell.tradition, spell.activationLabel, ...spell.effects].join(" · "), unavailable: !spell.available || !spell.castSource ? spell.issues.join(" ") || "The required casting source is unavailable." : spell.castSource.kind !== "catalog" ? "Learn this spell as a Skill before casting it in combat." : undefined });
      for (const ability of assemblePlayerTabletopDerivedAbilities(aggregate)) sources.push({ kind: "derived-ability", ref: `derived-ability:${ability.id}`, name: ability.name, instanceId: null, itemId: null, description: [ability.description, ...ability.costs, ...ability.limits].join(" · "), unavailable: ability.availability === "Available" ? undefined : ability.availability });
      for (const owned of aggregate.items) {
        const profile = aggregate.authorizedItems.find((entry) => entry.id === owned.itemId)?.runtimeProfile;
        if (profile && profile.useMode !== "none") sources.push({ kind: "item", ref: `item:${owned.itemId}`, name: owned.name, instanceId: null, itemId: null, description: profile.useMode === "charges" ? "Needs rebuilding: legacy charged Item Use is retired." : `${owned.quantity} available · ${profile.activationLabel}`, unavailable: profile.useMode === "charges" ? "Rebuild with Abilities and a Shared Power Charge Pool." : undefined });
      }
      for (const owned of aggregate.itemInstances) if (owned.runtimeProfile.useMode !== "none") sources.push({ kind: "item", ref: `item:${owned.itemId}`, name: `${owned.name} · copy ${owned.id}`, instanceId: owned.id, itemId: null, description: owned.runtimeProfile.useMode === "charges" ? "Needs rebuilding: legacy charged Item Use is retired." : `${owned.currentCharges ?? "?"} charges · ${owned.runtimeProfile.activationLabel}`, unavailable: owned.runtimeProfile.useMode === "charges" ? "Rebuild with Abilities and a Shared Power Charge Pool." : undefined });
      for (const ability of loaded.abilityStacks) if (ability.resourceKind !== "shared-charges" && ability.quantity > 0) {
        const stack = loaded.equipment?.stacks.find(({ itemId }) => itemId === ability.itemId);
        const cost = ability.resourceAmount ?? 0;
        const unavailable = ability.resourceKind === "consume-item" && (!stack || stack.inactiveQuantity < cost)
          ? "This Ability does not have enough Inactive Item quantity to pay its cost." : undefined;
        sources.push({ kind: "item", ref: `item-power:${ability.powerId}`, name: `${ability.itemName} — ${ability.powerName}`, instanceId: null, itemId: ability.itemId, description: `${ability.initiativeCost ?? "?"} Initiative${ability.resourceKind !== "none" ? ` · ${ability.resourceAmount} ${ability.resourceKind === "consume-item" ? "Item" : "Charges"}` : ""}`, unavailable });
      }
      for (const ability of loaded.abilityInstances) if (ability.resourceKind === "shared-charges" || ability.resourceKind !== "consume-item") {
        const cost = ability.resourceAmount ?? 0;
        const unavailable = ability.resourceKind === "shared-charges" && ability.hasPowerPool === null
          ? "This Ability requires a shared Power Charge Pool."
          : ability.resourceKind === "shared-charges" && ability.currentCharges < cost
            ? "This exact Item instance has insufficient Charges." : undefined;
        sources.push({ kind: "item", ref: `item-power:${ability.powerId}`, name: `${ability.itemName} — ${ability.powerName}`, instanceId: ability.instanceId, itemId: ability.itemId, description: `${ability.initiativeCost ?? "?"} Initiative${ability.resourceKind !== "none" ? ` · ${ability.resourceAmount} ${ability.resourceKind === "consume-item" ? "Item" : "Charges"}` : ""}`, unavailable });
      }
    } catch (error) { aggregateIssue = error instanceof Error ? error.message : "Some owned sources could not be read."; }
  }
  if (scope.role === "god" && participantId > 0 && !loaded.isNpc) await authorized(scope, async (tx, context) => {
    if (await readOpenDeclarationCheckpoint(tx, context.encounterId)) throw new Error("Inspect source rulings after simultaneous choices are revealed.");
  });
  return { ...loaded, sources, aggregateIssue };
}

export async function readCombatTargetAnatomy(scope: CombatScreenScope, targetId: number) {
  return authorized(scope, async (tx, context) => {
    const [row] = await tx.select({ snapshot: member.creatureSnapshotJson, npcKind: campaignCharacter.npcKind }).from(member)
      .leftJoin(campaignCharacter, eq(campaignCharacter.id, member.characterId)).where(and(eq(member.encounterId, context.encounterId), eq(member.characterId, targetId)));
    if (!row) throw new Error("That target is not in this encounter.");
    if (targetId < 0) return records(object(row.snapshot).hitLocations).map((entry) => ({ number: Number(entry.hitLocationNumber), name: String(entry.locationName), poolKey: typeof entry.hpPoolCanonicalId === "string" ? entry.hpPoolCanonicalId : null }));
    return (await readActiveHealthInTransaction(tx, targetId, row.npcKind ?? "race")).anatomy.hitLocations.map((entry) => ({ number: entry.result, name: entry.name, poolKey: entry.poolKey }));
  });
}

export async function readCombatSpellOptions(scope: CombatScreenScope, participantId: number, source: SpellCastSourceRequest) {
  return authorized(scope, async (tx, context, actor) => {
    if (actor.authority === "player" && participantId !== actor.characterId) throw new Error("Only your own Spell sources are readable.");
    const [row] = await tx.select({ isNpc: campaignCharacter.isNpc }).from(member).leftJoin(campaignCharacter, eq(campaignCharacter.id, member.characterId)).where(and(eq(member.encounterId, context.encounterId), eq(member.characterId, participantId)));
    if (!row) throw new Error("The caster must belong to this encounter.");
    if (await readOpenDeclarationCheckpoint(tx, context.encounterId) && actor.authority === "god-owner" && !row.isNpc) throw new Error("Inspect source rulings after simultaneous choices are revealed.");
    const preparation = await prepareCharacterSpellCastInTransaction(tx, { casterCharacterId: participantId, source, selections: { targetGroups: {}, applications: {} } }, actor.userId, true);
    return { groups: preparation.authoredTargetGroups, mastery: preparation.plan.caster.practitionerLevel, manaCost: preparation.plan.finalManaCost, initiativeCost: preparation.plan.finalInitiativeCost,
      warnings: [...preparation.plan.issues, ...preparation.plan.warnings] };
  });
}
export async function readCombatItemAbilityOptions(scope: CombatScreenScope, participantId: number, powerIdInput: number) {
  return authorized(scope, async (tx, context, actor) => {
    if (actor.authority === "player" && participantId !== actor.characterId) throw new Error("Only your own Item Ability sources are readable.");
    const [row] = await tx.select({ constructionJson: itemPowerConstruction.documentJson, sourceDataJson: skillExtension.dataJson, fixedPowerLevel: itemPower.fixedPowerLevel })
      .from(itemPower)
      .innerJoin(item, eq(item.id, itemPower.itemId))
      .leftJoin(itemPowerSource, eq(itemPowerSource.itemPowerId, itemPower.id))
      .leftJoin(skill, eq(skill.id, itemPowerSource.sourceSkillId))
      .leftJoin(skillExtension, and(eq(skillExtension.skillId, itemPowerSource.sourceSkillId), eq(skillExtension.extensionType, "spell-construction")))
      .leftJoin(itemPowerConstruction, eq(itemPowerConstruction.itemPowerId, itemPower.id))
      .where(and(eq(itemPower.id, powerIdInput), eq(itemPower.trigger, "activated"))).limit(1);
    if (!row) throw new Error("That activated Item Ability no longer exists.");
    const directEffects = await tx.select({ id: itemPowerEffect.id }).from(itemPowerEffect).where(eq(itemPowerEffect.itemPowerId, powerIdInput));
    const magicJson = row.constructionJson ?? row.sourceDataJson;
    if (!magicJson) return { groups: [], requiresGenericTarget: true };
    const document = parseSpellDocument(magicJson);
    const resolved = resolveItemPowerConstruction(document, row.fixedPowerLevel);
    if (!resolved.adapter.valid) throw new Error("The Item Ability Magic source cannot be resolved into combat effects.");
    return {
      groups: analyzeSpellTargetGroups(resolved.spell, resolved.adapter.effects).groups,
      requiresGenericTarget: directEffects.length > 0,
    };
  });
}
export async function previewCombatChoice(scope: CombatScreenScope, choice: CombatChoice) { return authorized(scope, (tx, context, actor) => previewCombatChoiceInTransaction(tx, context, actor, choice)); }
export async function submitCombatChoice(scope: CombatScreenScope, input: CombatSubmission) { return authorized(scope, (tx, context, actor) => submitCombatChoiceInTransaction(tx, context, actor, input), true); }
export async function submitCombatDefense(scope: CombatScreenScope, input: DefenseDeclarationInput, roll?: DeclarationRollInput) { return authorized(scope, (tx, context, actor) => declareDefenseInterventionInTransaction(tx, context, actor, input, roll), true); }
export async function previewCombatDefense(scope: CombatScreenScope, input: DefenseDeclarationInput) { return authorized(scope, (tx, context, actor) => previewDefenseInterventionInTransaction(tx, context, actor, input)); }
export async function readCombatAbilityResponseChoices(scope: CombatScreenScope, participantId: number, opportunityId: number) {
  return authorized(scope, async (tx, context, actor) => (await readAbilityResponseChoicesInTransaction(tx, context, actor, participantId, opportunityId))
    .map(({ kind, ref, name, activationType, status, explanation, initiativeCost, definition, ruling }) => ({ kind, ref, name, activationType, status, explanation, initiativeCost,
      requiresResolutionRuling: "abilityName" in definition ? !definition.authoring || definition.authoring.resolutionMode === "manual" : !ruling?.mode || ruling.mode === "manual-god-ruling" })));
}
export async function previewCombatMovement(scope: CombatScreenScope, participantId: number, mode: string, distance: number) {
  return authorized(scope, (tx, context, actor) => {
    if (actor.authority === "player" && actor.characterId !== participantId) throw new Error("Choose your own Character.");
    return resolveCombatMovementInTransaction(tx, context, participantId, mode, distance);
  });
}

export async function fillCombatMagazine(scope: CombatScreenScope, command: CombatMagazineFillCommand) {
  return authorized(scope, (tx, context, actor) => startCombatMagazineFill(tx, context, actor, command), true);
}

export async function drawCombatMeleeWeapon(scope: CombatScreenScope, command: MeleeDrawCommand) {
  return authorized(scope, (tx, context, actor) => startMeleeDraw(tx, context, actor, command), true);
}

export async function applyCombatFirearmCatalog(scope: CombatScreenScope, command: { characterId: number; itemInstanceId: number; expectedVersion: number }) {
  return authorized(scope, (tx, context, actor) => applyFirearmCatalogConfigurationInTransaction(tx, context, actor, command), true);
}
