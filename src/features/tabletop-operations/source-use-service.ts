import "server-only";

import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import { campaignCharacter } from "@/db/realm-schema";
import { campaignSession, campaignSessionEncounter, campaignSessionEncounterParticipant, campaignSessionRoster, campaignSessionScene, campaignSessionSceneMember } from "@/db/tabletop-operations-schema";
import { tabletopSourceUseEvent, tabletopSourceUseRequest } from "@/db/tabletop-source-use-schema";
import { executeCharacterItemUseInCallerTransaction, prepareCharacterItemUseInTransaction } from "@/app/characters/item-use-actions";
import { executeCharacterSpellCastInCallerTransaction, prepareCharacterSpellCastInTransaction } from "@/features/characters/character-spell-runtime-service";
import { itemUseSnapshot, spellUseSnapshot, stableSourceUseJson, type SourceUseRequestView, type SourceUseResult, type SourceUseSnapshot, type SourceUseStatus, type TabletopSourceUse } from "./source-use";
import { publishCharacterStateInvalidationInTransaction, publishTabletopInvalidationInTransaction } from "./tabletop-live-events";
import { bindPersistedEffectDurationInTransaction } from "./duration-lifecycle-service";
import type { PersistedMechanicalEffectIdentity } from "@/features/active-state/mechanical-effect-service";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Actor = { userId: string; role: "player" | "god" };
type RequestRow = typeof tabletopSourceUseRequest.$inferSelect;

function positiveId(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new Error("Invalid Tabletop identity.");
  return Number(value);
}

function boundedText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) throw new Error(`${label} must contain 1-${maximum} characters.`);
  return value.trim();
}

function sourceCharacterId(source: TabletopSourceUse): number {
  if (!source || !source.request || !["spell", "item"].includes(source.kind)) throw new Error("Choose an owned Spell or Item.");
  if (source.kind === "spell") {
    if (!source.request.source || !["catalog", "personal"].includes(source.request.source.kind)) throw new Error("Choose an owned catalog or personal Spell.");
    return positiveId(source.request.casterCharacterId);
  }
  return positiveId(source.request.sourceCharacterId);
}

async function authorizeCharacter(tx: Transaction, characterId: number, actor: Actor) {
  const [role] = await tx.select({ role: userRole.role }).from(userRole).where(and(eq(userRole.userId, actor.userId), eq(userRole.role, actor.role))).limit(1);
  const [row] = await tx.select({ characterId: campaignCharacter.id, name: campaignCharacter.name,
    campaignId: campaignCharacter.campaignId, playerUserId: campaignCharacter.playerUserId,
    isNpc: campaignCharacter.isNpc, ownerUserId: campaign.createdByUserId,
    memberUserId: campaignPlayer.userId,
  }).from(campaignCharacter).innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
    .leftJoin(campaignPlayer, and(eq(campaignPlayer.campaignId, campaign.id), eq(campaignPlayer.userId, actor.userId)))
    .where(and(eq(campaignCharacter.id, positiveId(characterId)), isNull(campaignCharacter.archivedAt), isNull(campaign.archivedAt))).limit(1);
  if (!role || !row || (actor.role === "god"
    ? row.ownerUserId !== actor.userId
    : row.isNpc || row.playerUserId !== actor.userId || row.memberUserId !== actor.userId)) {
    throw new Error("This Character is not available to you at this Table.");
  }
  return row;
}

async function authorizeGodSession(tx: Transaction, sessionId: number, actor: Actor) {
  const [row] = await tx.select({ id: campaignSession.id }).from(campaignSession)
    .innerJoin(campaign, eq(campaign.id, campaignSession.campaignId))
    .innerJoin(userRole, and(eq(userRole.userId, actor.userId), eq(userRole.role, "god")))
    .where(and(eq(campaignSession.id, positiveId(sessionId)), eq(campaign.createdByUserId, actor.userId), isNull(campaign.archivedAt))).limit(1);
  if (actor.role !== "god" || !row) throw new Error("Only the Campaign-owning G.O.D. may review these requests.");
}

/** Noncombat use cannot spend resources through a Character in an active Encounter. */
async function assertNoncombat(tx: Transaction, characterIds: number[]): Promise<void> {
  for (const characterId of [...new Set(characterIds)].sort((a, b) => a - b)) {
    const participants = tx.select({ encounterId: campaignSessionEncounterParticipant.encounterId })
      .from(campaignSessionEncounterParticipant).where(eq(campaignSessionEncounterParticipant.characterId, characterId));
    const scenes = tx.select({ sceneId: campaignSessionSceneMember.sceneId })
      .from(campaignSessionSceneMember).where(eq(campaignSessionSceneMember.characterId, characterId));
    const active = await tx.select({ id: campaignSessionEncounter.id }).from(campaignSessionEncounter)
      .where(and(eq(campaignSessionEncounter.status, "active"), or(inArray(campaignSessionEncounter.id, participants), inArray(campaignSessionEncounter.sceneId, scenes))))
      .orderBy(asc(campaignSessionEncounter.id)).for("update");
    if (active.length) throw new Error("Use the Encounter controls while this Character is in active combat.");
  }
}

async function sessionContext(tx: Transaction, sessionId: number, characterId: number, campaignId: number) {
  const [session] = await tx.select({ status: campaignSession.status }).from(campaignSession)
    .innerJoin(campaignSessionRoster, and(eq(campaignSessionRoster.sessionId, campaignSession.id), eq(campaignSessionRoster.characterId, characterId)))
    .where(and(eq(campaignSession.id, positiveId(sessionId)), eq(campaignSession.campaignId, campaignId)))
    .limit(1).for("update", { of: campaignSession });
  if (!session) throw new Error("The Character must belong to this Session's roster.");
  return session;
}

async function assertOpenContext(tx: Transaction, row: RequestRow): Promise<void> {
  const session = await sessionContext(tx, row.sessionId, row.characterId, row.campaignId);
  if (session.status !== "active") throw new Error("This request belongs to a Session that is no longer active. Cancel it and request again at the current Table.");
  if (row.sceneId !== null) {
    const [scene] = await tx.select({ status: campaignSessionScene.status }).from(campaignSessionScene)
      .innerJoin(campaignSessionSceneMember, and(eq(campaignSessionSceneMember.sceneId, campaignSessionScene.id), eq(campaignSessionSceneMember.characterId, row.characterId)))
      .where(eq(campaignSessionScene.id, row.sceneId)).limit(1).for("update", { of: campaignSessionScene });
    if (scene?.status !== "active") throw new Error("This request's Scene or membership changed. Cancel it and request again in the current Scene.");
  }
}

async function loadSnapshot(tx: Transaction, source: TabletopSourceUse, actor: Actor): Promise<SourceUseSnapshot> {
  const characterId = sourceCharacterId(source);
  await authorizeCharacter(tx, characterId, actor);
  await assertNoncombat(tx, [characterId]);
  const snapshot = source.kind === "spell"
    ? await prepareCharacterSpellCastInTransaction(tx, source.request, actor.userId).then(({ plan }) => {
      if (!plan.ready) throw new Error(plan.issues.join(" ") || "Complete the Spell selections and check available Mana first.");
      return spellUseSnapshot(plan);
    })
    : await prepareCharacterItemUseInTransaction(tx, source.request, actor.userId).then(({ plan }) => {
      if (!plan.ready) throw new Error(plan.issues.join(" ") || "Complete the Item selections and check available resources first.");
      return itemUseSnapshot(plan);
    });
  await assertNoncombat(tx, snapshot.targets.map(({ characterId: id }) => id));
  return snapshot;
}

async function notifyRequest(tx: Transaction, row: Pick<RequestRow, "campaignId" | "sessionId" | "sceneId" | "characterId">) {
  await publishTabletopInvalidationInTransaction(tx, { campaignId: row.campaignId, sessionId: row.sessionId,
    sceneId: row.sceneId, encounterId: null, characterIds: [row.characterId], category: "character-state" });
}

async function event(tx: Transaction, row: RequestRow, actor: Actor, status: SourceUseStatus, note: string) {
  await tx.insert(tabletopSourceUseEvent).values({ requestId: row.id, status, note, actorUserId: actor.userId, actorKind: actor.role });
  await notifyRequest(tx, row);
}

export async function requestSourceUseInTransaction(tx: Transaction, actor: Actor,
  input: { sessionId: number; source: TabletopSourceUse; intent: string; idempotencyKey: string },
): Promise<number> {
  if (actor.role !== "player") throw new Error("A Player submits this request; G.O.D. reviews it.");
  const characterId = sourceCharacterId(input.source);
  const character = await authorizeCharacter(tx, characterId, actor);
  const intent = boundedText(input.intent, "Intent / circumstances", 2000);
  const idempotencyKey = boundedText(input.idempotencyKey, "Request identity", 100);
  const session = await sessionContext(tx, input.sessionId, characterId, character.campaignId);
  const [previous] = await tx.select().from(tabletopSourceUseRequest)
    .where(and(eq(tabletopSourceUseRequest.requestedByUserId, actor.userId), eq(tabletopSourceUseRequest.idempotencyKey, idempotencyKey))).limit(1);
  if (previous) {
    if (previous.sessionId !== input.sessionId || previous.intent !== intent || stableSourceUseJson(previous.sourceJson) !== stableSourceUseJson(input.source)) throw new Error("That request identity was already used for different selections.");
    return previous.id;
  }
  if (session.status !== "active") throw new Error("G.O.D. ruling requests require an active Session.");
  const pending = await tx.select({ id: tabletopSourceUseRequest.id }).from(tabletopSourceUseRequest)
    .where(and(eq(tabletopSourceUseRequest.characterId, characterId), inArray(tabletopSourceUseRequest.status, ["pending", "approved"])));
  if (pending.length >= 10) throw new Error("Finish or cancel an existing request before submitting another.");
  const snapshot = await loadSnapshot(tx, input.source, actor);
  if (!snapshot.manualEffects.length) throw new Error("This use does not require a G.O.D. ruling. Use its ordinary confirmation.");
  const [scene] = await tx.select({ id: campaignSessionScene.id }).from(campaignSessionScene)
    .innerJoin(campaignSessionSceneMember, and(eq(campaignSessionSceneMember.sceneId, campaignSessionScene.id), eq(campaignSessionSceneMember.characterId, characterId)))
    .where(and(eq(campaignSessionScene.sessionId, input.sessionId), eq(campaignSessionScene.status, "active"))).limit(1).for("update", { of: campaignSessionScene });
  const [row] = await tx.insert(tabletopSourceUseRequest).values({ campaignId: character.campaignId,
    sessionId: input.sessionId, sceneId: scene?.id ?? null, characterId, requestedByUserId: actor.userId,
    idempotencyKey, sourceJson: input.source, snapshotJson: snapshot, intent,
  }).returning();
  await event(tx, row, actor, "pending", intent);
  return row.id;
}

async function lockRequest(tx: Transaction, requestId: number, actor: Actor): Promise<RequestRow> {
  const [identity] = await tx.select().from(tabletopSourceUseRequest).where(eq(tabletopSourceUseRequest.id, positiveId(requestId))).limit(1);
  if (!identity) throw new Error("That Tabletop request is unavailable.");
  await authorizeCharacter(tx, identity.characterId, actor);
  if (actor.role === "player" && identity.requestedByUserId !== actor.userId) throw new Error("That request belongs to another Player.");
  await sessionContext(tx, identity.sessionId, identity.characterId, identity.campaignId);
  const [row] = await tx.select().from(tabletopSourceUseRequest).where(eq(tabletopSourceUseRequest.id, requestId)).limit(1).for("update");
  return row;
}

export async function ruleSourceUseInTransaction(tx: Transaction, actor: Actor,
  input: { requestId: number; decision: "approved" | "rejected"; ruling: string },
): Promise<void> {
  if (actor.role !== "god" || !["approved", "rejected"].includes(input.decision)) throw new Error("Only G.O.D. may approve or reject a request.");
  const row = await lockRequest(tx, input.requestId, actor);
  const ruling = boundedText(input.ruling, "G.O.D. ruling", 4000);
  if (row.status === input.decision && row.ruling === ruling && row.ruledByUserId === actor.userId) return;
  if (row.status !== "pending") throw new Error("This request has already been decided. Refresh to see its current state.");
  if (input.decision === "approved") {
    await assertOpenContext(tx, row);
    // Review using the requester's actual access, never G.O.D.'s broader target permissions.
    const snapshot = await loadSnapshot(tx, row.sourceJson, { userId: row.requestedByUserId, role: "player" });
    if (snapshot.signature !== row.snapshotJson.signature) throw new Error("The source, costs, or targets changed. Reject this request and ask for an updated preview.");
  }
  await tx.update(tabletopSourceUseRequest).set({ status: input.decision, ruling, ruledByUserId: actor.userId, ruledAt: new Date() }).where(eq(tabletopSourceUseRequest.id, row.id));
  await event(tx, row, actor, input.decision, ruling);
}

export async function cancelSourceUseInTransaction(tx: Transaction, actor: Actor, requestId: number): Promise<void> {
  const row = await lockRequest(tx, requestId, actor);
  if (row.status === "cancelled") return;
  if (row.status !== "pending" && row.status !== "approved") throw new Error("Only a pending or unused approved request can be cancelled.");
  await tx.update(tabletopSourceUseRequest).set({ status: "cancelled" }).where(eq(tabletopSourceUseRequest.id, row.id));
  await event(tx, row, actor, "cancelled", "Cancelled without spending resources.");
}

async function executeSource(tx: Transaction, actor: Actor, source: TabletopSourceUse, approved?: SourceUseSnapshot): Promise<SourceUseResult> {
  const characterId = sourceCharacterId(source);
  await authorizeCharacter(tx, characterId, actor);
  await assertNoncombat(tx, [characterId]);
  const [scene] = await tx.select({ sceneId: campaignSessionScene.id, sessionId: campaignSessionScene.sessionId, campaignId: campaignSessionScene.campaignId })
    .from(campaignSessionScene).innerJoin(campaignSession, eq(campaignSession.id, campaignSessionScene.sessionId))
    .innerJoin(campaignSessionSceneMember, and(eq(campaignSessionSceneMember.sceneId, campaignSessionScene.id), eq(campaignSessionSceneMember.characterId, characterId)))
    .where(and(eq(campaignSessionScene.status, "active"), eq(campaignSession.status, "active")))
    .limit(1).for("update", { of: campaignSessionScene });
  async function bindDuration(effect: PersistedMechanicalEffectIdentity) {
    if (effect.duration.kind === "until-removed") return;
    if (!scene) throw new Error("This effect needs an active Scene for its duration.");
    if (effect.duration.kind !== "scene") throw new Error("Combat-timed effects must be used through the Encounter controls.");
    await bindPersistedEffectDurationInTransaction(tx, scene, effect);
  }
  let targets: number[] = [];
  async function verify(snapshot: SourceUseSnapshot) {
    targets = snapshot.targets.map(({ characterId: id }) => id);
    await assertNoncombat(tx, targets);
    if (approved ? snapshot.signature !== approved.signature : snapshot.manualEffects.length > 0) {
      throw new Error(approved ? "The approved source, costs, or targets changed. Cancel this request and prepare a new one." : "This use needs a G.O.D. ruling before resources can be spent.");
    }
  }
  const result: SourceUseResult = source.kind === "spell"
    ? { kind: "spell", result: await executeCharacterSpellCastInCallerTransaction(tx, source.request, actor.userId, true, bindDuration, (plan) => verify(spellUseSnapshot(plan))) }
    : { kind: "item", result: await executeCharacterItemUseInCallerTransaction(tx, source.request, actor.userId, bindDuration, (plan) => verify(itemUseSnapshot(plan))) };
  for (const id of new Set([characterId, ...targets])) await publishCharacterStateInvalidationInTransaction(tx, id);
  return result;
}

export async function executeUnruledSourceUseInTransaction(tx: Transaction, actor: Actor, source: TabletopSourceUse): Promise<SourceUseResult> {
  return executeSource(tx, actor, source);
}

export async function completeSourceUseInTransaction(tx: Transaction, actor: Actor, requestId: number): Promise<SourceUseResult> {
  if (actor.role !== "player") throw new Error("The Player confirms the approved use.");
  const row = await lockRequest(tx, requestId, actor);
  if (row.status === "completed" && row.resultJson) return row.resultJson;
  if (row.status !== "approved") throw new Error("G.O.D. must approve this request before you confirm use.");
  await assertOpenContext(tx, row);
  const result = await executeSource(tx, actor, row.sourceJson, row.snapshotJson);
  await tx.update(tabletopSourceUseRequest).set({ status: "completed", resultJson: result, completedAt: new Date() }).where(eq(tabletopSourceUseRequest.id, row.id));
  await event(tx, row, actor, "completed", "Use confirmed; resources spent and supported effects applied. Manual effects follow the recorded G.O.D. ruling.");
  return result;
}

export async function readSourceUseRequestsInTransaction(tx: Transaction, actor: Actor,
  scope: { characterId: number } | { sessionId: number },
): Promise<SourceUseRequestView[]> {
  if ("characterId" in scope) await authorizeCharacter(tx, scope.characterId, actor);
  else await authorizeGodSession(tx, scope.sessionId, actor);
  const filter = "characterId" in scope
    ? and(eq(tabletopSourceUseRequest.characterId, scope.characterId), ...(actor.role === "player" ? [eq(tabletopSourceUseRequest.requestedByUserId, actor.userId)] : []))
    : eq(tabletopSourceUseRequest.sessionId, scope.sessionId);
  const query = () => tx.select({ row: tabletopSourceUseRequest, name: campaignCharacter.name,
    sessionStatus: campaignSession.status, sceneStatus: campaignSessionScene.status,
  }).from(tabletopSourceUseRequest).innerJoin(campaignCharacter, eq(campaignCharacter.id, tabletopSourceUseRequest.characterId))
    .innerJoin(campaignSession, eq(campaignSession.id, tabletopSourceUseRequest.sessionId))
    .leftJoin(campaignSessionScene, eq(campaignSessionScene.id, tabletopSourceUseRequest.sceneId));
  const open = await query().where(and(filter, inArray(tabletopSourceUseRequest.status, ["pending", "approved"]))).orderBy(asc(tabletopSourceUseRequest.id));
  const history = await query().where(and(filter, inArray(tabletopSourceUseRequest.status, ["rejected", "cancelled", "completed"]))).orderBy(desc(tabletopSourceUseRequest.id)).limit(30);
  const rows = [...open, ...history];
  const events = rows.length ? await tx.select().from(tabletopSourceUseEvent).where(inArray(tabletopSourceUseEvent.requestId, rows.map(({ row }) => row.id))).orderBy(asc(tabletopSourceUseEvent.id)) : [];
  return rows.map(({ row, name, sessionStatus, sceneStatus }) => ({ id: row.id, characterId: row.characterId,
    characterName: name, kind: row.sourceJson.kind, status: row.status, intent: row.intent,
    snapshot: { ...row.snapshotJson, signature: "" }, ruling: row.ruling,
    contextActive: sessionStatus === "active" && (row.sceneId === null || sceneStatus === "active"),
    createdAt: row.createdAt.toISOString(), events: events.filter(({ requestId }) => requestId === row.id)
      .map(({ status, note, actorKind, createdAt }) => ({ status, note, actor: actorKind, createdAt: createdAt.toISOString() })),
  }));
}
