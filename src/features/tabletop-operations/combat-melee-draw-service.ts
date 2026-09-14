import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import { item, weaponProfile, weaponFiringMode } from "@/db/item-schema";
import { campaignSessionEncounterActionDeclaration as declaration, campaignSessionEncounterActionDeclarationEvent as event,
  campaignSessionEncounterParticipant as member, campaignSessionEncounterPendingAction as pending,
  campaignSessionEncounterResponderOpportunity as opportunity } from "@/db/tabletop-operations-schema";
import { readCharacterEquipmentStateInTransaction, lockEquipmentStateCharacterInTransaction,
  setInstanceEquipmentStateInTransaction, setStackEquipmentStateInTransaction } from "@/features/items/equipment-state-service";
import { isSupportedAmmunitionWeaponType } from "@/features/items/firearm-classification";
import { assertActionChoiceAuthority, assertInstantPreparationOpportunity, createActionDeclarationDraftInTransaction,
  lockActionDeclarationInTransaction, commitActionDeclarationInTransaction, type ActionDeclarationActor } from "./action-declaration-service";
import { assertCombatWritableInTransaction } from "./combat-freeze-service";
import { readOpenDeclarationCheckpoint } from "./declaration-checkpoint-service";
import { parseActionDeclarationDraft, type LockedActionDeclarationSnapshot } from "./action-declaration";
import { loadInitiativeEngineInTransaction, type RuntimeIntegrationTransaction as Tx, type OwnedEncounterRuntimeContext } from "./runtime-integration-service";
import { initiativeAffordabilityIssue } from "./initiative-affordability";

export type MeleeDrawCommand = { characterId: number; itemId: number; instanceId: number | null; requestKey: string };
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export async function readMeleeDrawOptions(tx: Tx, characterId: number) {
  const equipment = await readCharacterEquipmentStateInTransaction(tx, characterId);
  const ids = [...new Set([...equipment.stacks, ...equipment.instances].map((entry) => entry.itemId))];
  if (!ids.length) return [];
  const profiles = await tx.select({ itemId: item.id, cost: weaponProfile.drawInitiativeCost }).from(weaponProfile)
    .innerJoin(item, eq(item.id, weaponProfile.itemId)).where(and(inArray(item.id, ids), isNull(item.archivedAt), eq(item.catalogScope, "equipment")));
  const mechanics = await tx.select().from(weaponProfile).where(inArray(weaponProfile.itemId, ids));
  const modes = mechanics.length ? await tx.select({ profileId: weaponFiringMode.weaponProfileId }).from(weaponFiringMode).where(inArray(weaponFiringMode.weaponProfileId, mechanics.map((entry) => entry.id))) : [];
  const allowed = new Map(profiles.filter((entry) => {
    const profile = mechanics.find((candidate) => candidate.itemId === entry.itemId);
    return profile?.profileRecordType === "Weapon" && !isSupportedAmmunitionWeaponType(profile.weaponType)
      && profile.ammunitionItemId === null && !modes.some((mode) => mode.profileId === profile.id);
  }).map((entry) => [entry.itemId, entry.cost]));
  return [
    ...equipment.stacks.filter((entry) => allowed.has(entry.itemId) && entry.inactiveQuantity + entry.equippedQuantity + entry.wornQuantity > 0).map((entry) => ({
      itemId: entry.itemId, instanceId: null as number | null, name: entry.itemName, cost: allowed.get(entry.itemId)!,
      before: { state: entry.inactiveQuantity > 0 ? "inactive" : entry.equippedQuantity > 0 ? "equipped" : "worn", wielded: entry.wieldedQuantity,
        equipped: entry.equippedQuantity, worn: entry.wornQuantity, owned: entry.ownedQuantity } })),
    ...equipment.instances.filter((entry) => allowed.has(entry.itemId) && entry.state !== "wielded").map((entry) => ({
      itemId: entry.itemId, instanceId: entry.instanceId, name: `${entry.itemName} · Copy #${entry.instanceId}`, cost: allowed.get(entry.itemId)!,
      before: { state: entry.state } })),
  ];
}

async function applyDraw(tx: Tx, command: MeleeDrawCommand, before: unknown) {
  await lockEquipmentStateCharacterInTransaction(tx, command.characterId);
  const selected = (await readMeleeDrawOptions(tx, command.characterId)).find((entry) => entry.itemId === command.itemId && entry.instanceId === command.instanceId);
  if (!selected || !isDeepStrictEqual(selected.before, before)) throw new Error("This weapon's equipment changed during drawing. Interrupt the action and review its equipment state.");
  if (command.instanceId !== null) await setInstanceEquipmentStateInTransaction(tx, { characterId: command.characterId, instanceId: command.instanceId, state: "wielded" });
  else {
    const state = selected.before as { state: string; wielded: number; equipped: number; worn: number };
    if (state.state === "equipped" || state.state === "worn") await setStackEquipmentStateInTransaction(tx, {
      characterId: command.characterId, itemId: command.itemId, state: state.state, quantity: state[state.state] - 1 });
    await setStackEquipmentStateInTransaction(tx, { characterId: command.characterId, itemId: command.itemId, state: "wielded", quantity: state.wielded + 1 });
  }
}

export async function startMeleeDraw(tx: Tx, context: OwnedEncounterRuntimeContext, actor: ActionDeclarationActor, input: MeleeDrawCommand) {
  const command: MeleeDrawCommand = { characterId: input.characterId, itemId: input.itemId, instanceId: input.instanceId, requestKey: input.requestKey };
  if (!Number.isSafeInteger(command.characterId) || command.characterId <= 0 || !Number.isSafeInteger(command.itemId) || command.itemId <= 0
    || command.instanceId !== null && (!Number.isSafeInteger(command.instanceId) || command.instanceId <= 0)
    || typeof command.requestKey !== "string" || !command.requestKey.trim() || command.requestKey.length > 160) throw new Error("Choose an exact owned weapon and a valid retry identity.");
  await assertCombatWritableInTransaction(tx, context.encounterId);
  await assertActionChoiceAuthority(tx, context, actor, command.characterId);
  await lockEquipmentStateCharacterInTransaction(tx, command.characterId);
  const rows = await tx.select().from(declaration).where(and(eq(declaration.encounterId, context.encounterId), eq(declaration.actorCharacterId, command.characterId)));
  const prior = rows.find((row) => parseActionDeclarationDraft(row.draftJson).sourcePayload?.meleeDrawKey === command.requestKey);
  if (prior) {
    if (!isDeepStrictEqual(parseActionDeclarationDraft(prior.draftJson).sourcePayload?.meleeDraw, command)) throw new Error("This retry identity belongs to a different draw action.");
    return { declarationId: prior.id };
  }
  const [participant] = await tx.select().from(member).where(and(eq(member.encounterId, context.encounterId), eq(member.characterId, command.characterId))).for("update");
  if (!participant) throw new Error("Choose an exact encounter participant.");
  const local = object(participant.localStateJson), history = Array.isArray(local.instantMeleeDraws) ? local.instantMeleeDraws : [];
  const receipt = history.map(object).find((entry) => object(entry.command).requestKey === command.requestKey);
  if (receipt) {
    if (!isDeepStrictEqual(receipt.command, command)) throw new Error("This retry identity belongs to a different draw action.");
    return { declarationId: null };
  }
  const selected = (await readMeleeDrawOptions(tx, command.characterId)).find((entry) => entry.itemId === command.itemId && entry.instanceId === command.instanceId);
  if (!selected) throw new Error("Choose an owned melee weapon that is not already wielded.");
  if (selected.cost === null) throw new Error("Set Draw Initiative in Heavens → Items → Weapon preparation before drawing this weapon in combat.");
  if (!Number.isFinite(selected.cost) || selected.cost < 0) throw new Error("Draw Initiative must be a finite nonnegative amount.");
  const engine = await loadInitiativeEngineInTransaction(tx, context.encounterId);
  const actorState = engine.participants.find((entry) => entry.characterId === command.characterId);
  if (!actorState) throw new Error("Enroll this combatant in Initiative first.");
  const issue = initiativeAffordabilityIssue(selected.cost, actorState.currentInitiative);
  if (issue) throw new Error(issue);
  if (selected.cost === 0) {
    if (await readOpenDeclarationCheckpoint(tx, context.encounterId)) throw new Error("Resolve simultaneous choices before instantaneous preparation.");
    await assertInstantPreparationOpportunity(tx, context, command.characterId);
    await applyDraw(tx, command, selected.before);
    await tx.update(member).set({ localStateJson: { ...local, instantMeleeDraws: [...history, { command, actorUserId: actor.userId, at: new Date().toISOString() }] }, updatedAt: new Date() }).where(eq(member.participantId, participant.participantId));
    return { declarationId: null };
  }
  const id = await createActionDeclarationDraftInTransaction(tx, context, actor, {
    actorCharacterId: command.characterId, targetCharacterIds: [], label: `Draw ${selected.name}`, actionKind: "combat-melee-draw",
    sourceKind: "no-roll", sourceRef: `item:${command.itemId}`, sourceInstanceId: command.instanceId,
    sourcePayload: { meleeDraw: command, meleeDrawKey: command.requestKey, equipmentBefore: selected.before },
    weaponItemId: null, firingModeId: null, attackMode: "Draw weapon", initiativeCost: selected.cost, allowsMultiRound: true,
    heldIntervention: false, windowKind: "preparation", aimDeclared: false, calledShot: { declared: false, label: "", assignedPenalty: null },
    explicitModifiers: [], preparesForDeclarationId: null, godNotes: "" });
  await lockActionDeclarationInTransaction(tx, context, actor, id);
  await commitActionDeclarationInTransaction(tx, context, actor, id);
  return { declarationId: id };
}

export async function validateMeleeDrawCommit(tx: Tx, snapshot: LockedActionDeclarationSnapshot) {
  const payload = snapshot.source.payload ?? {};
  const command = object(payload.meleeDraw) as MeleeDrawCommand;
  if (command.characterId !== snapshot.actorCharacterId) throw new Error("The draw must belong to its acting Character.");
  const selected = (await readMeleeDrawOptions(tx, snapshot.actorCharacterId)).find((entry) => entry.itemId === command.itemId && entry.instanceId === command.instanceId);
  if (!selected || selected.cost !== snapshot.initiativeCost || !isDeepStrictEqual(selected.before, payload.equipmentBefore)) throw new Error("The weapon or its draw cost changed. Prepare the draw again.");
}

export async function completeMeleeDraw(tx: Tx, declarationId: number, actorUserId: string) {
  const [row] = await tx.select().from(declaration).where(eq(declaration.id, declarationId)).for("update");
  if (!row || ["resolved", "cancelled", "abandoned"].includes(row.status) || !row.pendingActionId) return;
  const draft = parseActionDeclarationDraft(row.draftJson);
  if (draft.actionKind !== "combat-melee-draw") return;
  const [timing] = await tx.select().from(pending).where(eq(pending.id, row.pendingActionId));
  if (timing?.status !== "completed") return;
  const [open] = await tx.select({ id: opportunity.id }).from(opportunity).where(and(eq(opportunity.declarationId, row.id), eq(opportunity.status, "pending"))).limit(1);
  if (open) return;
  await applyDraw(tx, draft.sourcePayload!.meleeDraw as MeleeDrawCommand, draft.sourcePayload!.equipmentBefore);
  await tx.update(declaration).set({ status: "resolved", endedByUserId: actorUserId, endedAt: new Date(), updatedAt: new Date() }).where(eq(declaration.id, row.id));
  await tx.insert(event).values({ declarationId: row.id, encounterId: row.encounterId, sceneId: row.sceneId, sessionId: row.sessionId, campaignId: row.campaignId,
    fromStatus: row.status, toStatus: "resolved", eventKind: "melee-weapon-drawn", actorUserId, metadata: { pendingActionId: row.pendingActionId, weapon: draft.sourcePayload!.meleeDraw } });
}
