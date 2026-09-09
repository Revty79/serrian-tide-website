"use server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { requireGod, requirePlayer } from "@/lib/server-access";
import { campaignCharacter, campaignCreatureNpcProfile } from "@/db/realm-schema";
import { campaignSessionEncounterParticipant as member } from "@/db/tabletop-operations-schema";
import { getCharacter } from "@/app/characters/actions";
import { readCharacterEquipmentStateInTransaction } from "@/features/items/equipment-state-service";
import { readActiveHealthInTransaction } from "@/features/active-state/active-health-service";
import { readFirearmWorkspaceInTransaction } from "@/features/tabletop-operations/firearm-readiness-service";
import { readDefenseInterventionWorkspaceInTransaction, declareDefenseInterventionInTransaction, previewDefenseInterventionInTransaction, type DefenseDeclarationInput } from "@/features/tabletop-operations/defense-intervention-service";
import { readOpenDeclarationCheckpoint } from "@/features/tabletop-operations/declaration-checkpoint-service";
import { lockOwnedEncounterRuntimeInTransaction, type RuntimeIntegrationTransaction as Tx } from "@/features/tabletop-operations/runtime-integration-service";
import { lockPlayerCombatContextInTransaction } from "@/features/tabletop-operations/player-combat-ruling-service";
import { resolveInitiativeCapacityOptionsInTransaction } from "@/features/tabletop-operations/initiative-capacity-service";
import { assemblePlayerTabletopSpells, assemblePlayerTabletopDerivedAbilities } from "@/features/tabletop-operations/player-tabletop-console";
import { prepareCharacterSpellCastInTransaction } from "@/features/characters/character-spell-runtime-service";
import { publishTabletopInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
import type { SpellCastSourceRequest } from "@/features/characters/character-spell-runtime";
import type { ActionDeclarationActor, DeclarationRollInput } from "@/features/tabletop-operations/action-declaration-service";
import { previewCombatChoiceInTransaction, submitCombatChoiceInTransaction } from "./choice-service";
import type { CombatChoice, CombatSubmission, CombatSourceChoice } from "./choice-types";
import type { CombatScreenScope } from "./screen-types";
import { readPlayerCombatRulingRequestsInTransaction } from "@/features/tabletop-operations/player-combat-ruling-service";
import { resolveCombatMovementInTransaction } from "@/features/tabletop-operations/combat-movement-service";

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
    const firearms = participantId > 0 ? await readFirearmWorkspaceInTransaction(tx, context, participantId, null, actor.authority === "player" || row.isNpc ? actor : undefined) : null;
    const defenses = checkpoint ? null : await readDefenseInterventionWorkspaceInTransaction(tx, context, actor);
    const requests = actor.authority === "player" ? await readPlayerCombatRulingRequestsInTransaction(tx, context.encounterId, actor.characterId, actor.userId) : [];
    const movement = await resolveInitiativeCapacityOptionsInTransaction(tx, participantId, context.campaignId).catch(() => null);
    const snapshot = row.snapshot ?? (row.persistentSnapshot ? JSON.parse(row.persistentSnapshot) : null);
    return { equipment, firearms, requests, defense: defenses?.participants.find((entry) => entry.characterId === participantId) ?? null,
      movement: movement?.movementModes ?? [], snapshot, isNpc: row.isNpc, rulings: records(object(row.local).combatSourceResolutionHistory) };
  });
  const sources: CombatSourceChoice[] = [];
  for (const weapon of loaded.equipment?.wieldedWeapons ?? []) sources.push({ kind: "weapon", ref: weapon.ownershipKey, name: weapon.itemName, instanceId: weapon.instanceId, itemId: weapon.itemId, description: weapon.initiativeCost === null ? "Needs an authored timing ruling." : `${weapon.initiativeCost} Initiative` });
  for (const firearm of loaded.firearms?.firearms ?? []) if (!sources.some((source) => source.instanceId === firearm.itemInstanceId)) sources.push({ kind: "weapon", ref: `instance:${firearm.itemInstanceId}`, name: firearm.itemName, instanceId: firearm.itemInstanceId, itemId: firearm.itemId, description: "Inspect ammunition and preparation before firing." });
  for (const attack of records(object(loaded.snapshot).attacks)) sources.push({ kind: "creature-attack", ref: String(attack.canonicalId), name: String(attack.attackName), instanceId: null, itemId: null, description: `${attack.attackPercentage ?? "?"}% · ${attack.damage ?? "?"} damage` });
  for (const ability of records(object(loaded.snapshot).abilities)) sources.push({ kind: "creature-ability", ref: String(ability.canonicalId), name: String(ability.abilityName), instanceId: null, itemId: null, description: String(ability.description ?? "") });
  let aggregateIssue = "";
  if (participantId > 0) {
    try {
      const aggregate = await getCharacter(participantId, scope.role === "god");
      for (const spell of assemblePlayerTabletopSpells(aggregate)) sources.push({ kind: "spell", ref: spell.castSource?.kind === "catalog" ? `catalog:${spell.castSource.allocationId}` : spell.castSource && "savedSpellId" in spell.castSource ? `${spell.castSource.kind}:${spell.castSource.savedSpellId}` : spell.key,
        name: spell.name, instanceId: null, itemId: null, description: [spell.tradition, spell.activationLabel, ...spell.effects].join(" · "), unavailable: !spell.available || !spell.castSource ? spell.issues.join(" ") || "The required casting source is unavailable." : spell.castSource.kind !== "catalog" ? "Learn this spell as a Skill before casting it in combat." : undefined });
      for (const ability of assemblePlayerTabletopDerivedAbilities(aggregate)) sources.push({ kind: "derived-ability", ref: `derived-ability:${ability.id}`, name: ability.name, instanceId: null, itemId: null, description: [ability.description, ...ability.costs, ...ability.limits].join(" · "), unavailable: ability.availability === "Available" ? undefined : ability.availability });
      for (const owned of aggregate.items) {
        const profile = aggregate.authorizedItems.find((entry) => entry.id === owned.itemId)?.runtimeProfile;
        if (profile && profile.useMode !== "none") sources.push({ kind: "item", ref: `item:${owned.itemId}`, name: owned.name, instanceId: null, itemId: null, description: `${owned.quantity} available · ${profile.activationLabel}` });
      }
      for (const owned of aggregate.itemInstances) if (owned.runtimeProfile.useMode !== "none") sources.push({ kind: "item", ref: `item:${owned.itemId}`, name: `${owned.name} · copy ${owned.id}`, instanceId: owned.id, itemId: null, description: `${owned.currentCharges ?? "?"} charges · ${owned.runtimeProfile.activationLabel}` });
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
    const { plan } = await prepareCharacterSpellCastInTransaction(tx, { casterCharacterId: participantId, source, selections: { targetGroups: {}, applications: {} } }, actor.userId, true);
    return { groups: plan.targetGroups, mastery: plan.caster.practitionerLevel, manaCost: plan.finalManaCost, initiativeCost: plan.finalInitiativeCost,
      warnings: [...plan.issues, ...plan.warnings] };
  });
}
export async function previewCombatChoice(scope: CombatScreenScope, choice: CombatChoice) { return authorized(scope, (tx, context, actor) => previewCombatChoiceInTransaction(tx, context, actor, choice)); }
export async function submitCombatChoice(scope: CombatScreenScope, input: CombatSubmission) { return authorized(scope, (tx, context, actor) => submitCombatChoiceInTransaction(tx, context, actor, input), true); }
export async function submitCombatDefense(scope: CombatScreenScope, input: DefenseDeclarationInput, roll?: DeclarationRollInput) { return authorized(scope, (tx, context, actor) => declareDefenseInterventionInTransaction(tx, context, actor, input, roll), true); }
export async function previewCombatDefense(scope: CombatScreenScope, input: DefenseDeclarationInput) { return authorized(scope, (tx, context, actor) => previewDefenseInterventionInTransaction(tx, context, actor, input)); }
export async function previewCombatMovement(scope: CombatScreenScope, participantId: number, mode: string, distance: number) {
  return authorized(scope, (tx, context, actor) => {
    if (actor.authority === "player" && actor.characterId !== participantId) throw new Error("Choose your own Character.");
    return resolveCombatMovementInTransaction(tx, context, participantId, mode, distance);
  });
}
