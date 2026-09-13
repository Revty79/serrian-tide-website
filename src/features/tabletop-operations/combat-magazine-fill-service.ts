import "server-only";
import { decimalMultiply, completedDecimalUnits } from "@/lib/decimal";
import { and, eq, sql } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import { magazineInventoryOperation as receiptTable } from "@/db/magazine-schema";
import { campaignCharacterItemInstance as copy, campaignCharacterItem as loose } from "@/db/realm-schema";
import { campaignSessionEncounterActionDeclaration as declaration, campaignSessionEncounterActionDeclarationEvent as event,
  campaignSessionEncounterPendingAction as pending, campaignSessionEncounterResponderOpportunity as opportunity } from "@/db/tabletop-operations-schema";
import { readMagazineInventoryInTransaction } from "@/features/items/magazine-inventory-service";
import { lockEquipmentStateCharacterInTransaction } from "@/features/items/equipment-state-service";
import { createActionDeclarationDraftInTransaction, lockActionDeclarationInTransaction, commitActionDeclarationInTransaction, assertActionChoiceAuthority, assertInstantPreparationOpportunity, type ActionDeclarationActor } from "./action-declaration-service";
import { assertCombatWritableInTransaction } from "./combat-freeze-service";
import { loadInitiativeEngineInTransaction, type RuntimeIntegrationTransaction as Tx, type OwnedEncounterRuntimeContext } from "./runtime-integration-service";
import type { InitiativeEngineState } from "./initiative-runtime";
import { initiativeAffordabilityIssue } from "./initiative-affordability";
import { parseActionDeclarationDraft } from "./action-declaration";

export type CombatMagazineFillCommand = { characterId: number; instanceId: number; ammunitionItemId: number; rounds: number; requestKey: string };
type FillRequest = CombatMagazineFillCommand & { encounterId: number; operation: "combat-fill"; costPerRound: number; initialRounds: number };
type FillResult = { declarationId: number | null; pendingActionId: number | null; roundsCompleted: number; status: string };

export async function startCombatMagazineFill(tx: Tx, context: OwnedEncounterRuntimeContext, actor: ActionDeclarationActor, command: CombatMagazineFillCommand) {
  await assertCombatWritableInTransaction(tx, context.encounterId);
  await assertActionChoiceAuthority(tx, context, actor, command.characterId);
  await lockEquipmentStateCharacterInTransaction(tx, command.characterId);
  if (!command.requestKey.trim() || command.requestKey.length > 160 || !Number.isSafeInteger(command.rounds) || command.rounds <= 0) throw new Error("Choose a magazine, positive whole rounds, and a valid retry identity.");
  const [prior] = await tx.select().from(receiptTable).where(and(eq(receiptTable.characterId, command.characterId), eq(receiptTable.requestKey, command.requestKey)));
  if (prior) {
    const request = prior.request as FillRequest;
    const { encounterId, operation } = request;
    const original = { characterId: request.characterId, instanceId: request.instanceId, ammunitionItemId: request.ammunitionItemId, rounds: request.rounds, requestKey: request.requestKey };
    if (prior.actorUserId !== actor.userId || encounterId !== context.encounterId || operation !== "combat-fill" || !isDeepStrictEqual(original, command)) throw new Error("This retry identity belongs to a different magazine operation.");
    return prior.result as FillResult;
  }
  const inventory = await readMagazineInventoryInTransaction(tx, command.characterId, actor.userId);
  if (!inventory.canManage) throw new Error("Only the combatant's authorized controller can fill this magazine.");
  const selected = inventory.magazines.find((entry) => entry.instanceId === command.instanceId);
  if (!selected || selected.archived) throw new Error("Choose an active, owned magazine copy.");
  if (selected.attachedWeaponInstanceId) throw new Error("Remove the magazine from its firearm before filling it.");
  const ammo = selected.ammunition.find((entry) => entry.id === command.ammunitionItemId && !entry.archived);
  if (!ammo || ammo.quantity < command.rounds) throw new Error("Choose compatible loose ammunition and an available number of rounds.");
  if (selected.loadedRounds > 0 && selected.ammunitionItemId !== command.ammunitionItemId) throw new Error("Choose the ammunition already in this magazine; mixed loads are not supported.");
  if (selected.loadedRounds + command.rounds > selected.capacity) throw new Error("These rounds exceed the magazine's capacity. Add fewer rounds.");
  if (selected.fillInitiativeCostPerRound === null) throw new Error("Set Fill Initiative per Round in Heavens → Items → Magazine before filling this magazine in combat.");
  const cost = decimalMultiply(selected.fillInitiativeCostPerRound, command.rounds);
  if (cost === 0) await assertInstantPreparationOpportunity(tx, context, command.characterId);
  const actorState = (await loadInitiativeEngineInTransaction(tx, context.encounterId)).participants.find((entry) => entry.characterId === command.characterId);
  if (!actorState) throw new Error("Enroll the combatant in Initiative before filling a magazine.");
  const issue = initiativeAffordabilityIssue(cost, actorState.currentInitiative);
  if (issue) throw new Error(issue);
  const request: FillRequest = { ...command, encounterId: context.encounterId, operation: "combat-fill", costPerRound: selected.fillInitiativeCostPerRound, initialRounds: selected.loadedRounds };
  let declarationId: number | null = null, pendingActionId: number | null = null;
  if (cost > 0) {
    declarationId = await createActionDeclarationDraftInTransaction(tx, context, actor, { actorCharacterId: command.characterId, targetCharacterIds: [],
      label: `Fill ${selected.name} copy #${selected.instanceId}: ${command.rounds} rounds`, actionKind: `magazine-fill:${command.instanceId}`, sourceKind: "no-roll",
      sourceRef: `magazine:${command.instanceId}`, sourceInstanceId: command.instanceId, sourcePayload: { instruction: "Insert rounds into the exact detached magazine as their authored Initiative cost completes.", magazineFill: request },
      weaponItemId: null, firingModeId: null, attackMode: "Fill magazine", initiativeCost: cost, allowsMultiRound: false, heldIntervention: false, windowKind: "preparation", aimDeclared: false,
      calledShot: { declared: false, label: "", assignedPenalty: null }, explicitModifiers: [], preparesForDeclarationId: null, godNotes: "" });
    await lockActionDeclarationInTransaction(tx, context, actor, declarationId);
    pendingActionId = await commitActionDeclarationInTransaction(tx, context, actor, declarationId);
  }
  const result: FillResult = { declarationId, pendingActionId, roundsCompleted: 0, status: "pending" };
  const [receipt] = await tx.insert(receiptTable).values({ characterId: command.characterId, instanceId: command.instanceId, requestKey: command.requestKey, actorUserId: actor.userId, request, result }).returning();
  if (cost === 0) await progressFill(tx, receipt.id, 0, "completed", actor.userId);
  return cost === 0 ? { ...result, roundsCompleted: command.rounds, status: "completed" } : result;
}

async function progressFill(tx: Tx, receiptId: number, spent: number, actionStatus: string, actorUserId: string) {
  const [receipt] = await tx.select().from(receiptTable).where(eq(receiptTable.id, receiptId)).for("update");
  const request = receipt.request as FillRequest, result = receipt.result as FillResult;
  if (request.operation !== "combat-fill" || ["completed", "cancelled"].includes(result.status)) return;
  const reached = Math.min(request.rounds, request.costPerRound === 0 ? request.rounds : completedDecimalUnits(spent, request.costPerRound));
  const inserted = reached - result.roundsCompleted;
  if (inserted > 0) {
    const view = await readMagazineInventoryInTransaction(tx, request.characterId, actorUserId), selected = view.magazines.find((entry) => entry.instanceId === request.instanceId);
    if (!selected || selected.attachedWeaponInstanceId || selected.loadedRounds !== request.initialRounds + result.roundsCompleted
      || selected.loadedRounds + inserted > selected.capacity || selected.loadedRounds > 0 && selected.ammunitionItemId !== request.ammunitionItemId) throw new Error("This magazine changed during filling. Interrupt the action and review its exact contents.");
    const [owned] = await tx.select().from(copy).where(eq(copy.id, request.instanceId)).for("update");
    const [stock] = await tx.select().from(loose).where(and(eq(loose.characterId, request.characterId), eq(loose.itemId, request.ammunitionItemId))).for("update");
    if (!stock || stock.quantity < inserted) throw new Error("The next magazine insertion needs more compatible loose ammunition. Restore those rounds or interrupt filling.");
    const loadedRounds = owned.loadedRounds + inserted, unitCost = (owned.loadedRounds * owned.loadedAmmunitionUnitCostCredits + inserted * stock.unitCostCredits) / loadedRounds;
    if (stock.quantity === inserted) await tx.delete(loose).where(and(eq(loose.characterId, request.characterId), eq(loose.itemId, request.ammunitionItemId)));
    else await tx.update(loose).set({ quantity: stock.quantity - inserted }).where(and(eq(loose.characterId, request.characterId), eq(loose.itemId, request.ammunitionItemId)));
    await tx.update(copy).set({ loadedRounds, loadedAmmunitionItemId: request.ammunitionItemId, loadedAmmunitionUnitCostCredits: unitCost, updatedAt: new Date() }).where(eq(copy.id, request.instanceId));
    if (result.declarationId) {
      const [row] = await tx.select().from(declaration).where(eq(declaration.id, result.declarationId));
      await tx.insert(event).values({ declarationId: row.id, encounterId: row.encounterId, sceneId: row.sceneId, sessionId: row.sessionId, campaignId: row.campaignId,
        fromStatus: row.status, toStatus: row.status, eventKind: "magazine-rounds-inserted", actorUserId,
        metadata: { instanceId: request.instanceId, ammunitionItemId: request.ammunitionItemId, inserted, roundsCompleted: reached, loadedRounds, initiativeSpent: spent, costPerRound: request.costPerRound } });
    }
  }
  const status = ["ended", "abandoned"].includes(actionStatus) ? "cancelled" : actionStatus === "interrupted" ? "interrupted" : actionStatus === "completed" ? "completed" : "pending";
  await tx.update(receiptTable).set({ result: { ...result, roundsCompleted: Math.max(reached, result.roundsCompleted), status } }).where(eq(receiptTable.id, receipt.id));
  if (result.declarationId && status === "completed") await finalizeMagazineFillDeclaration(tx, result.declarationId, actorUserId);
}

export async function finalizeMagazineFillDeclaration(tx: Tx, declarationId: number, actorUserId: string) {
  const [row] = await tx.select().from(declaration).where(eq(declaration.id, declarationId)).for("update");
  if (!row || !parseActionDeclarationDraft(row.draftJson).actionKind.startsWith("magazine-fill:") || !row.pendingActionId || ["resolved", "cancelled", "abandoned"].includes(row.status)) return;
  const [timing] = await tx.select().from(pending).where(eq(pending.id, row.pendingActionId));
  if (timing?.status !== "completed") return;
  const [open] = await tx.select({ id: opportunity.id }).from(opportunity).where(and(eq(opportunity.declarationId, row.id), eq(opportunity.status, "pending"))).limit(1);
  if (open) return;
  await tx.update(declaration).set({ status: "resolved", endedByUserId: actorUserId, endedAt: new Date(), updatedAt: new Date() }).where(eq(declaration.id, row.id));
  await tx.insert(event).values({ declarationId: row.id, encounterId: row.encounterId, sceneId: row.sceneId, sessionId: row.sessionId, campaignId: row.campaignId,
    fromStatus: row.status, toStatus: "resolved", eventKind: "magazine-fill-completed", actorUserId, metadata: { pendingActionId: row.pendingActionId } });
}

export async function reconcileMagazineFillProgress(tx: Tx, before: InitiativeEngineState, after: InitiativeEngineState, actorUserId: string) {
  for (const action of after.pendingActions.filter((entry) => entry.actionKind.startsWith("magazine-fill:"))) {
    const prior = before.pendingActions.find((entry) => entry.id === action.id);
    if (!prior || prior.status === action.status && prior.initiativeSpent === action.initiativeSpent) continue;
    const [receipt] = await tx.select({ id: receiptTable.id }).from(receiptTable).where(sql`${receiptTable.result}->>'pendingActionId' = ${String(action.id)} and ${receiptTable.request}->>'encounterId' = ${String(before.runtime.encounterId)}`);
    if (!receipt) throw new Error("The magazine filling action has no exact inventory receipt.");
    await progressFill(tx, receipt.id, action.initiativeSpent, action.status, actorUserId);
  }
}
