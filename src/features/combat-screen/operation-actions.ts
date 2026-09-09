"use server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { requireGod, requirePlayer } from "@/lib/server-access";
import { campaignCharacter, campaignCreatureNpcProfile } from "@/db/realm-schema";
import { campaignSessionEncounterParticipant as member, campaignSessionEncounterRewardDecision as decision } from "@/db/tabletop-operations-schema";
import { lockOwnedEncounterRuntimeInTransaction, loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction, type RuntimeIntegrationTransaction as Tx } from "@/features/tabletop-operations/runtime-integration-service";
import { lockPlayerCombatContextInTransaction, readGodCombatRulingRequestsInTransaction } from "@/features/tabletop-operations/player-combat-ruling-service";
import { readOpenDeclarationCheckpoint } from "@/features/tabletop-operations/declaration-checkpoint-service";
import { readActionEffectWorkspaceInTransaction, applyRoutineCombatConsequencesInTransaction, ruleOrdinaryAttackConsequenceInTransaction, approveActionEffectPlanInTransaction, applyActionEffectPlanInTransaction } from "@/features/tabletop-operations/action-effect-plan-service";
import { readDefenseInterventionWorkspaceInTransaction, resolveDeclaredDefensesIfReadyInTransaction } from "@/features/tabletop-operations/defense-intervention-service";
import { readFirearmAttackWorkspaceInTransaction, commitFirearmAttackTriggerInTransaction } from "@/features/tabletop-operations/firearm-attack-service";
import { readRollLedgerInTransaction } from "@/features/tabletop-operations/roll-runtime-service";
import { publishTabletopInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
import { lockEncounterCloseoutContextInTransaction, readEncounterCloseoutInTransaction, finalizeEncounterCloseoutInTransaction, type FinalizeEncounterCloseoutInput } from "@/features/tabletop-operations/encounter-closeout-service";
import { assertCombatWritableInTransaction } from "@/features/tabletop-operations/combat-freeze-service";
import { assertExpectedInitiativeState } from "@/features/tabletop-operations/initiative-state-token";
import { closeInitiativeRuntime } from "@/features/tabletop-operations/initiative-runtime";
import type { ActionDeclarationActor } from "@/features/tabletop-operations/action-declaration-service";
import type { OrdinaryAttackRuling } from "@/features/tabletop-operations/ordinary-attack-consequence-service";
import type { CombatScreenScope } from "./screen-types";
import { readCombatEntityInformationInTransaction } from "@/features/tabletop-operations/combat-projection-service";
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
async function authorized<T>(scope: CombatScreenScope, operation: (tx: Tx, context: Awaited<ReturnType<typeof lockOwnedEncounterRuntimeInTransaction>>, actor: ActionDeclarationActor) => Promise<T>, publish = false) {
  if (scope.role !== "god" && scope.role !== "player") throw new Error("Invalid combat role.");
  const access = scope.role === "god" ? await requireGod() : await requirePlayer();
  return db.transaction(async (tx) => {
    const context = scope.role === "god" ? await lockOwnedEncounterRuntimeInTransaction(tx, scope.encounterId, access.user.id) : await lockPlayerCombatContextInTransaction(tx, scope.encounterId, scope.characterId, access.user.id);
    const actor: ActionDeclarationActor = scope.role === "god" ? { authority: "god-owner", userId: access.user.id } : { authority: "player", userId: access.user.id, characterId: scope.characterId };
    const result = await operation(tx, context, actor);
    if (publish) await publishTabletopInvalidationInTransaction(tx, { campaignId: context.campaignId, sessionId: context.sessionId, sceneId: context.sceneId, encounterId: context.encounterId, characterIds: [], category: "action" });
    return result;
  });
}
export async function readCombatOperations(scope: CombatScreenScope) {
  return authorized(scope, async (tx, context, actor) => {
    const rolls = await readRollLedgerInTransaction(tx, { userId: actor.userId, campaignId: context.campaignId, readAs: actor.authority === "god-owner" ? "god-owner" : "player", canRecordGodOnly: actor.authority === "god-owner", characterId: actor.authority === "player" ? actor.characterId : null }, context.sessionId, { encounterId: context.encounterId });
    const sealed = await readOpenDeclarationCheckpoint(tx, context.encounterId);
    const effects = sealed ? null : await readActionEffectWorkspaceInTransaction(tx, context);
    const defenses = sealed ? null : await readDefenseInterventionWorkspaceInTransaction(tx, context, actor);
    const firearms = sealed ? null : await readFirearmAttackWorkspaceInTransaction(tx, context, actor);
    const requests = actor.authority === "god-owner" && !sealed ? await readGodCombatRulingRequestsInTransaction(tx, context.encounterId) : [];
    return { rolls: rolls.rolls, sealed: !!sealed, plans: actor.authority === "god-owner" ? effects?.plans ?? [] : [], defenses, firearms, requests,
      outcomes: effects?.plans.flatMap((plan) => plan.effects.filter((effect) => actor.authority === "god-owner" || plan.actorParticipantId === actor.characterId || effect.targetParticipantId === actor.characterId).map((effect) => ({ id: effect.id, actor: plan.actorName, target: effect.targetName,
        label: plan.sourceSnapshot.displayName, status: effect.status, appliedAt: effect.appliedAt, amount: typeof effect.finalValue === "number" ? effect.finalValue : typeof object(effect.finalValue).netDamage === "number" ? Number(object(effect.finalValue).netDamage) : null }))) ?? [] };
  });
}
export async function readCombatRecoveryConditions(encounterId: number, participantId: number) {
  return authorized({ role: "god", encounterId }, async (tx, context, actor) => {
    const information = await readCombatEntityInformationInTransaction(tx, context, actor, participantId);
    const resources = information.resources;
    if (resources?.kind === "character") return resources.effects.conditions.filter((entry) => !entry.resolvedAt).map((entry) => ({ id: entry.id, name: entry.name, description: entry.description }));
    const conditions = object(resources?.state).conditions;
    return (Array.isArray(conditions) ? conditions.map(object) : []).filter((entry) => !entry.expiredAt && !entry.endedAt && typeof entry.effectPlanEffectId === "number").map((entry) => ({ id: Number(entry.effectPlanEffectId), name: String(entry.name), description: String(entry.description ?? "") }));
  });
}
export async function applyCombatResult(scope: CombatScreenScope, declarationId: number, planId?: number) {
  return authorized(scope, async (tx, context, actor) => {
    await resolveDeclaredDefensesIfReadyInTransaction(tx, context, actor, declarationId);
    return applyRoutineCombatConsequencesInTransaction(tx, context, actor, declarationId, planId);
  }, true);
}
export async function applyCombatAttackRuling(encounterId: number, planId: number, declarationId: number, ruling: OrdinaryAttackRuling) {
  return authorized({ role: "god", encounterId }, async (tx, context, actor) => {
    if (actor.authority !== "god-owner") throw new Error("Only the G.O.D. may rule on damage.");
    await ruleOrdinaryAttackConsequenceInTransaction(tx, context, actor, planId, ruling);
    return applyRoutineCombatConsequencesInTransaction(tx, context, actor, declarationId, planId);
  }, true);
}
export async function commitCombatFirearmTrigger(scope: CombatScreenScope, attackId: number) {
  return authorized(scope, (tx, context, actor) => commitFirearmAttackTriggerInTransaction(tx, context, actor, attackId), true);
}
export async function confirmCombatEffectRuling(encounterId: number, planId: number, reason: string) {
  return authorized({ role: "god", encounterId }, async (tx, context, actor) => {
    if (actor.authority !== "god-owner") throw new Error("Only the G.O.D. may confirm this ruling.");
    if (!reason.trim()) throw new Error("Record the specific effect ruling before applying its supported consequences.");
    await approveActionEffectPlanInTransaction(tx, context, actor, planId, reason);
    return applyActionEffectPlanInTransaction(tx, context, actor, planId);
  }, true);
}
export async function readCombatCloseout(encounterId: number) {
  return authorized({ role: "god", encounterId }, async (tx, context, actor) => {
    if (await readOpenDeclarationCheckpoint(tx, encounterId)) throw new Error("Wait for simultaneous choices to be revealed before reviewing closeout.");
    const closeout = await readEncounterCloseoutInTransaction(tx, await lockEncounterCloseoutContextInTransaction(tx, encounterId, actor.userId));
    const receipts = await tx.select().from(decision).where(eq(decision.encounterId, encounterId));
    const rows = await tx.select({ id: member.characterId, name: member.displayLabel, snapshot: member.creatureSnapshotJson, local: member.localStateJson,
      characterName: campaignCharacter.name, npcKind: campaignCharacter.npcKind, persistent: campaignCreatureNpcProfile.currentSnapshotJson }).from(member)
      .leftJoin(campaignCharacter, eq(campaignCharacter.id, member.characterId)).leftJoin(campaignCreatureNpcProfile, eq(campaignCreatureNpcProfile.characterId, member.characterId))
      .where(and(eq(member.encounterId, context.encounterId), eq(member.campaignId, context.campaignId)));
    const creatures = rows.filter((row) => (row.id < 0 || row.npcKind === "creature") && Object.keys(object(object(row.local).defeat)).length).map((row) => {
      const defeat = object(object(row.local).defeat), snapshot = row.snapshot ?? (row.persistent ? JSON.parse(row.persistent) : {});
      const value = defeat.defeatValueXp ?? object(object(snapshot).core).killXp;
      return { participantId: row.id, name: row.characterName || row.name, value: typeof value === "number" ? value : null,
        killerId: typeof object(defeat.credit).characterId === "number" ? Number(object(defeat.credit).characterId) : null, awarded: receipts.some((receipt) => receipt.sourceKey === `creature:${row.id}`) };
    });
    return { closeout, creatures, encounterAwarded: receipts.some((receipt) => receipt.sourceKey === "encounter") };
  });
}
export async function endCombatWithAwards(encounterId: number, expectedStateToken: string, input: FinalizeEncounterCloseoutInput) {
  return authorized({ role: "god", encounterId }, async (tx, context, actor) => {
    await assertCombatWritableInTransaction(tx, encounterId);
    const closeoutContext = await lockEncounterCloseoutContextInTransaction(tx, encounterId, actor.userId);
    if (context.encounterStatus !== "completed") {
      const before = await loadInitiativeEngineInTransaction(tx, encounterId, true);
      assertExpectedInitiativeState(before, expectedStateToken);
      const check = await readEncounterCloseoutInTransaction(tx, closeoutContext);
      const blockers = check.blockers.filter((entry) => entry.code !== "initiative-active");
      if (blockers.length) throw new Error(blockers.map((entry) => entry.message).join(" "));
      if (before.runtime.status === "active") await persistInitiativeEngineInTransaction(tx, context, before, closeInitiativeRuntime(before), "correction");
    }
    return finalizeEncounterCloseoutInTransaction(tx, closeoutContext, input);
  }, true);
}
