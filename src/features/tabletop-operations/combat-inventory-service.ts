import "server-only";
import { and, eq } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import { decimalAdd } from "@/lib/decimal";
import { campaignCharacterItemInstance as copy } from "@/db/realm-schema";
import { campaignCharacterFirearmState as firearm, campaignSessionEncounterActionDeclaration as declaration,
  campaignSessionEncounterActionDeclarationEvent as event, campaignSessionEncounterParticipant as member,
  campaignSessionEncounterPendingAction as pending, campaignSessionEncounterResponderOpportunity as opportunity,
  campaignSessionPlayerRulingRequest as request } from "@/db/tabletop-operations-schema";
import { beginContainerMutation, moveInventoryContentInTransaction, readPhysicalInventoryInTransaction } from "@/features/items/inventory-containment-service";
import { handleInventoryInTransaction } from "@/features/items/inventory-custody-service";
import { lockEquipmentStateCharacterInTransaction } from "@/features/items/equipment-state-service";
import { containerAccessState, requireInventoryAvailability, resolveInventoryAvailability } from "@/features/items/inventory-access";
import { assertActionChoiceAuthority, assertInstantPreparationOpportunity, createActionDeclarationDraftInTransaction,
  lockActionDeclarationInTransaction, commitActionDeclarationInTransaction, type ActionDeclarationActor } from "./action-declaration-service";
import { assertCombatWritableInTransaction } from "./combat-freeze-service";
import { readOpenDeclarationCheckpoint } from "./declaration-checkpoint-service";
import { parseActionDeclarationDraft, type LockedActionDeclarationSnapshot } from "./action-declaration";
import { loadInitiativeEngineInTransaction, type RuntimeIntegrationTransaction as Tx, type OwnedEncounterRuntimeContext as Context } from "./runtime-integration-service";
import { initiativeAffordabilityIssue } from "./initiative-affordability";
import { createPlayerCombatRulingRequestInTransaction } from "./player-combat-ruling-service";

export type CombatInventoryCommand = {
  characterId: number; expectedCommerceVersion: number; requestKey: string;
  operation: "retrieve" | "stow" | "open" | "close" | "drop";
  itemId: number; instanceId: number | null; quantity: number; containerInstanceId: number | null;
  rulingRequestId?: number; initiativeRuling?: { cost: number; reason: string };
};
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const json = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
const identity = (command: CombatInventoryCommand) => { const base = { ...command }; delete base.rulingRequestId; delete base.initiativeRuling; return base; };

async function inspect(tx: Tx, userId: string, command: CombatInventoryCommand) {
  if (!["retrieve", "stow", "open", "close", "drop"].includes(command.operation) || !/^[a-f0-9]{32}$/.test(command.requestKey)
    || !Number.isSafeInteger(command.quantity) || command.quantity <= 0 || !Number.isSafeInteger(command.itemId) || command.itemId <= 0
    || command.instanceId !== null && (!Number.isSafeInteger(command.instanceId) || command.instanceId <= 0 || command.quantity !== 1)) throw new Error("Choose an owned Item, whole quantity, and valid handling identity.");
  await beginContainerMutation(tx, userId, command, true);
  const view = await readPhysicalInventoryInTransaction(tx, userId, command.characterId);
  const source = command.instanceId === null ? { itemId: command.itemId, containerInstanceId: command.operation === "retrieve" ? command.containerInstanceId : null } : { instanceId: command.instanceId };
  const available = resolveInventoryAvailability(view.accessGraph, source);
  requireInventoryAvailability(available, command.operation === "stow" || command.operation === "drop");
  if (command.instanceId !== null && !view.instances.some(row => row.instanceId === command.instanceId && row.itemId === command.itemId)) throw new Error("Choose the exact owned Item.");
  let chain: number[] = [];
  if (command.operation === "retrieve") {
    if (command.containerInstanceId === null || available.containerInstanceId !== command.containerInstanceId || available.attached) throw new Error("Retrieve from the Item's current container to Loose.");
    chain = available.ancestors;
  } else if (command.operation === "stow") {
    if (command.containerInstanceId === null) throw new Error("Choose a destination container.");
    const destination = resolveInventoryAvailability(view.accessGraph, { instanceId: command.containerInstanceId });
    requireInventoryAvailability(destination, false);
    chain = [command.containerInstanceId, ...destination.ancestors];
  } else if (command.operation === "open" || command.operation === "close") {
    if (command.instanceId === null || command.containerInstanceId !== null) throw new Error("Choose the exact container to open or close.");
    chain = [command.instanceId];
  } else if (command.containerInstanceId !== null) throw new Error("Only Loose root inventory may be dropped.");
  if (command.operation === "retrieve" || command.operation === "stow") for (const id of chain) {
    if (containerAccessState(view.accessGraph, id) !== "open") throw new Error(`Open container #${id} before ${command.operation}.`);
  }
  const profiles = chain.map(id => {
    const entry = view.containers.find(row => row.instanceId === id);
    if (!entry) throw new Error("The accessed container chain changed.");
    return { instanceId: id, profile: entry.profile };
  });
  const costs = profiles.map(row => row.profile[`${command.operation === "drop" ? "retrieve" : command.operation}InitiativeCost`]);
  const cost = command.operation === "drop" || costs.some(value => value === null) ? null : costs.reduce<number>((sum, value) => decimalAdd(sum, value!), 0);
  if (cost !== null && !Number.isFinite(cost)) throw new Error("The combined container Initiative cost exceeds the supported finite range.");
  const copies = await tx.select().from(copy).where(eq(copy.characterId, command.characterId)).orderBy(copy.id);
  const firearms = await tx.select().from(firearm).where(eq(firearm.characterId, command.characterId)).orderBy(firearm.itemInstanceId);
  return { cost, chain, frozen: json({ access: view.accessGraph, profiles, copies, firearms, version: view.commerceVersion }) };
}

async function apply(tx: Tx, userId: string, command: CombatInventoryCommand, sceneId: number) {
  if (command.operation === "retrieve" || command.operation === "stow") return moveInventoryContentInTransaction(tx, userId, {
    characterId: command.characterId, expectedCommerceVersion: command.expectedCommerceVersion,
    fromContainerInstanceId: command.operation === "retrieve" ? command.containerInstanceId : null,
    toContainerInstanceId: command.operation === "stow" ? command.containerInstanceId : null,
    ...(command.instanceId === null ? { kind: "stack", itemId: command.itemId, quantity: command.quantity } : { kind: "instance", instanceId: command.instanceId }),
  }, true);
  return handleInventoryInTransaction(tx, userId, { characterId: command.characterId, expectedCommerceVersion: command.expectedCommerceVersion,
    requestKey: command.requestKey, operation: command.operation, instanceId: command.instanceId, itemId: command.itemId, quantity: command.quantity, sceneId }, true);
}
/** A savepoint validates physical, equipment, ownership and closure rules before Initiative is committed. */
async function preflight(tx: Tx, userId: string, command: CombatInventoryCommand, sceneId: number) {
  const rollback = new Error("inventory-preflight-complete");
  try { await tx.transaction(async nested => { await apply(nested, userId, command, sceneId); throw rollback; }); }
  catch (error) { if (error !== rollback) throw error; }
}
async function costFor(tx: Tx, context: Context, actor: ActionDeclarationActor, command: CombatInventoryCommand, authored: number | null) {
  if (authored !== null) return { cost: authored, reason: "Authored container access costs" };
  let ruling = command.initiativeRuling;
  if (actor.authority === "player") {
    if (ruling) throw new Error("Only the Campaign-owning G.O.D. can supply an unresolved Initiative cost.");
    const [approved] = command.rulingRequestId ? await tx.select().from(request).where(and(eq(request.id, command.rulingRequestId), eq(request.encounterId, context.encounterId))).for("update") : [];
    if (!approved || approved.status !== "approved" || approved.requestType !== "manual-action" || approved.characterId !== command.characterId || approved.requestedByUserId !== actor.userId
      || approved.resolvedByUserId !== context.ownerUserId || approved.linkedDeclarationId !== null || object(approved.rulingJson).inventoryConsumedKey
      || !isDeepStrictEqual(object(approved.frozenRequestJson).inventoryHandling, identity(command))) throw new Error("This action needs an approved G.O.D. Initiative cost and reason for this exact handling request.");
    const amount = object(approved.rulingJson).initiativeCost;
    ruling = { cost: typeof amount === "number" ? amount : NaN, reason: approved.godResponse };
  } else if (actor.userId !== context.ownerUserId) throw new Error("Only the Campaign-owning G.O.D. may rule on handling costs.");
  if (!ruling || typeof ruling.cost !== "number" || !Number.isFinite(ruling.cost) || ruling.cost < 0 || !ruling.reason.trim()) throw new Error("Unconfigured handling requires an explicit G.O.D. Initiative cost (including zero) and reason.");
  return ruling;
}

export async function requestInventoryCost(tx: Tx, context: Context, actor: ActionDeclarationActor, command: CombatInventoryCommand) {
  await assertCombatWritableInTransaction(tx, context.encounterId);
  await assertActionChoiceAuthority(tx, context, actor, command.characterId);
  if (actor.authority !== "player") throw new Error("G.O.D. supplies a cost and reason directly for NPC handling.");
  const selected = await inspect(tx, actor.userId, command);
  await preflight(tx, actor.userId, command, context.sceneId);
  if (selected.cost !== null) throw new Error("This handling already has authored Initiative costs.");
  return createPlayerCombatRulingRequestInTransaction(tx, context, actor, { requestType: "manual-action", sourceKind: "item",
    sourceRef: command.instanceId === null ? `stack:${command.itemId}` : `instance:${command.instanceId}`, sourceInstanceId: command.instanceId,
    intent: `${command.operation} Item #${command.itemId}${command.instanceId === null ? ` × ${command.quantity}` : ` copy #${command.instanceId}`}`,
    blockedReason: "Container handling needs a total Initiative cost and reason.", frozenRequest: { inventoryHandling: identity(command), chain: selected.chain }, idempotencyKey: command.requestKey });
}

export async function startCombatInventory(tx: Tx, context: Context, actor: ActionDeclarationActor, command: CombatInventoryCommand) {
  await assertCombatWritableInTransaction(tx, context.encounterId);
  await assertActionChoiceAuthority(tx, context, actor, command.characterId);
  await lockEquipmentStateCharacterInTransaction(tx, command.characterId);
  const rows = await tx.select().from(declaration).where(and(eq(declaration.encounterId, context.encounterId), eq(declaration.actorCharacterId, command.characterId)));
  const prior = rows.find(row => parseActionDeclarationDraft(row.draftJson).sourcePayload?.inventoryKey === command.requestKey);
  if (prior) {
    if (prior.createdByUserId !== actor.userId || !isDeepStrictEqual(parseActionDeclarationDraft(prior.draftJson).sourcePayload?.inventoryHandling, command)) throw new Error("This retry identity belongs to different inventory handling.");
    return { declarationId: prior.id };
  }
  const [participant] = await tx.select().from(member).where(and(eq(member.encounterId, context.encounterId), eq(member.characterId, command.characterId))).for("update");
  if (!participant) throw new Error("Choose an enrolled encounter participant.");
  const local = object(participant.localStateJson), history = Array.isArray(local.instantInventoryHandling) ? local.instantInventoryHandling : [];
  const receipt = history.map(object).find(row => object(row.command).requestKey === command.requestKey);
  if (receipt) {
    if (receipt.actorUserId !== actor.userId || !isDeepStrictEqual(receipt.command, command)) throw new Error("This retry identity belongs to different inventory handling.");
    return { declarationId: null };
  }
  const selected = await inspect(tx, actor.userId, command);
  const ruling = await costFor(tx, context, actor, command, selected.cost);
  await preflight(tx, actor.userId, command, context.sceneId);
  const state = (await loadInitiativeEngineInTransaction(tx, context.encounterId)).participants.find(row => row.characterId === command.characterId);
  if (!state) throw new Error("Enroll this combatant in Initiative first.");
  const issue = initiativeAffordabilityIssue(ruling.cost, state.currentInitiative);
  if (issue) throw new Error(issue);
  let id: number | null = null;
  if (ruling.cost === 0) {
    if (await readOpenDeclarationCheckpoint(tx, context.encounterId)) throw new Error("Resolve simultaneous choices before instantaneous handling.");
    await assertInstantPreparationOpportunity(tx, context, command.characterId);
    await apply(tx, actor.userId, command, context.sceneId);
    await tx.update(member).set({ localStateJson: { ...local, instantInventoryHandling: [...history, { command, actorUserId: actor.userId, ruling, at: new Date().toISOString() }] }, updatedAt: new Date() }).where(eq(member.participantId, participant.participantId));
  } else {
    id = await createActionDeclarationDraftInTransaction(tx, context, actor, {
      actorCharacterId: command.characterId, targetCharacterIds: [], label: `${command.operation} Item #${command.itemId}`, actionKind: "combat-inventory",
      sourceKind: "no-roll", sourceRef: `item:${command.itemId}`, sourceInstanceId: command.instanceId,
      sourcePayload: { inventoryHandling: command, inventoryKey: command.requestKey, inventoryBefore: selected.frozen, inventoryRuling: ruling },
      weaponItemId: null, firingModeId: null, attackMode: "Inventory handling", initiativeCost: ruling.cost, allowsMultiRound: true,
      heldIntervention: false, windowKind: "preparation", aimDeclared: false, calledShot: { declared: false, label: "", assignedPenalty: null },
      explicitModifiers: [], preparesForDeclarationId: null, godNotes: ruling.reason });
    await lockActionDeclarationInTransaction(tx, context, actor, id);
    await commitActionDeclarationInTransaction(tx, context, actor, id);
  }
  if (actor.authority === "player" && command.rulingRequestId && selected.cost === null) {
    const [approval] = await tx.select().from(request).where(eq(request.id, command.rulingRequestId));
    await tx.update(request).set({ linkedDeclarationId: id, rulingJson: { ...object(approval.rulingJson), inventoryConsumedKey: command.requestKey }, updatedAt: new Date() }).where(eq(request.id, approval.id));
  }
  return { declarationId: id };
}

export async function validateInventoryCommit(tx: Tx, context: Context, actor: ActionDeclarationActor, snapshot: LockedActionDeclarationSnapshot) {
  const payload = snapshot.source.payload ?? {}, command = object(payload.inventoryHandling) as CombatInventoryCommand;
  if (command.characterId !== snapshot.actorCharacterId) throw new Error("Inventory handling must belong to the acting Character.");
  const selected = await inspect(tx, actor.userId, command);
  const ruling = await costFor(tx, context, actor, command, selected.cost);
  if (ruling.cost !== snapshot.initiativeCost || !isDeepStrictEqual(selected.frozen, payload.inventoryBefore)) throw new Error("Inventory or access costs changed. Prepare this handling again.");
  await preflight(tx, actor.userId, command, context.sceneId);
}

export async function completeCombatInventory(tx: Tx, declarationId: number, actorUserId: string) {
  const [row] = await tx.select().from(declaration).where(eq(declaration.id, declarationId)).for("update");
  if (!row || ["resolved", "cancelled", "abandoned"].includes(row.status) || !row.pendingActionId) return;
  const draft = parseActionDeclarationDraft(row.draftJson);
  if (draft.actionKind !== "combat-inventory") return;
  const [timing] = await tx.select().from(pending).where(eq(pending.id, row.pendingActionId));
  if (timing?.status !== "completed") return;
  const [open] = await tx.select({ id: opportunity.id }).from(opportunity).where(and(eq(opportunity.declarationId, row.id), eq(opportunity.status, "pending"))).limit(1);
  if (open) return;
  await assertCombatWritableInTransaction(tx, row.encounterId);
  const command = draft.sourcePayload!.inventoryHandling as CombatInventoryCommand;
  let failure: string | null = null;
  try { await tx.transaction(async nested => {
    const selected = await inspect(nested, row.createdByUserId, command);
    if (!isDeepStrictEqual(selected.frozen, draft.sourcePayload!.inventoryBefore)) throw new Error("The frozen inventory location, access, equipment or firearm state changed.");
    await apply(nested, row.createdByUserId, command, row.sceneId);
  }); } catch (error) { failure = error instanceof Error ? error.message : "Inventory handling could not complete."; }
  const status = failure ? "cancelled" : "resolved";
  await tx.update(declaration).set({ status, endedByUserId: actorUserId, endedAt: new Date(), updatedAt: new Date() }).where(eq(declaration.id, row.id));
  await tx.insert(event).values({ declarationId: row.id, encounterId: row.encounterId, sceneId: row.sceneId, sessionId: row.sessionId, campaignId: row.campaignId,
    fromStatus: row.status, toStatus: status, eventKind: failure ? "inventory-handling-invalidated" : "inventory-handling-completed", actorUserId,
    metadata: { pendingActionId: row.pendingActionId, command, failure } });
}
