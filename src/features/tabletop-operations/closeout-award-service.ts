import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { db } from "@/db";
import { user } from "@/db/auth-schema";
import { userRole } from "@/db/authorization-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import { campaignCharacter, campaignCharacterProfile } from "@/db/realm-schema";
import { campaignSession, campaignSessionRoster, campaignSessionScene, campaignSessionSceneMember } from "@/db/tabletop-operations-schema";
import { tabletopCloseoutAward, tabletopCloseoutAwardDecision } from "@/db/tabletop-closeout-award-schema";
import { assertCampaignRuntimeOperator } from "@/features/active-state/authorization";
import { assertOwnedRootManager } from "@/features/lifecycle/policy";
import type { LifecycleActor } from "@/features/lifecycle/types";
import { closeoutAwardTotalIsSafe, normalizeCloseoutAwards, type CloseoutAwardInput, type CloseoutAwardTarget, type CloseoutAwardView, type PlayerCloseoutAward } from "./closeout-awards";
import { publishCharacterStateInvalidationInTransaction } from "./tabletop-live-events";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function validateTarget(target: CloseoutAwardTarget) {
  if (!target || !Number.isSafeInteger(target.sessionId) || target.sessionId <= 0
    || (target.sceneId !== null && (!Number.isSafeInteger(target.sceneId) || target.sceneId <= 0))) throw new Error("Choose an exact Scene or Session.");
}

async function loadContext(tx: Transaction, target: CloseoutAwardTarget, actor: LifecycleActor, lock: boolean) {
  validateTarget(target);
  const fields = { campaignId: campaignSession.campaignId, sessionStatus: campaignSession.status, ownerUserId: campaign.createdByUserId, archivedAt: campaign.archivedAt };
  if (target.sceneId !== null) {
    const query = tx.select({ ...fields, status: campaignSessionScene.status }).from(campaignSessionScene)
      .innerJoin(campaignSession, eq(campaignSession.id, campaignSessionScene.sessionId))
      .innerJoin(campaign, eq(campaign.id, campaignSession.campaignId))
      .where(and(eq(campaignSessionScene.id, target.sceneId), eq(campaignSession.id, target.sessionId))).limit(1);
    const [row] = await (lock ? query.for("update") : query);
    if (!row) throw new Error("That Scene is unavailable.");
    assertOwnedRootManager(actor, row.ownerUserId, "Scene awards");
    return row;
  }
  const query = tx.select({ ...fields, status: campaignSession.status }).from(campaignSession)
    .innerJoin(campaign, eq(campaign.id, campaignSession.campaignId))
    .where(eq(campaignSession.id, target.sessionId)).limit(1);
  const [row] = await (lock ? query.for("update") : query);
  if (!row) throw new Error("That Session is unavailable.");
  assertOwnedRootManager(actor, row.ownerUserId, "Session awards");
  return row;
}

function decisionScope(target: CloseoutAwardTarget) {
  return and(eq(tabletopCloseoutAwardDecision.sessionId, target.sessionId), target.sceneId === null
    ? isNull(tabletopCloseoutAwardDecision.sceneId) : eq(tabletopCloseoutAwardDecision.sceneId, target.sceneId));
}

async function readDecision(tx: Transaction, target: CloseoutAwardTarget): Promise<CloseoutAwardView["decision"]> {
  const [decision] = await tx.select().from(tabletopCloseoutAwardDecision).where(decisionScope(target)).limit(1);
  if (!decision) return null;
  const rows = await tx.select().from(tabletopCloseoutAward).where(eq(tabletopCloseoutAward.decisionId, decision.id)).orderBy(asc(tabletopCloseoutAward.characterId));
  return { id: decision.id, awardedAt: decision.awardedAt.toISOString(), awardedBy: decision.awardedByName, note: decision.note,
    awards: rows.map(({ characterId, characterName, experience, fame, quintessence }) => ({ characterId, characterName, experience, fame, quintessence })) };
}

async function eligibleRecipients(tx: Transaction, target: CloseoutAwardTarget, campaignId: number) {
  const membership = target.sceneId === null
    ? tx.select({ id: campaignSessionRoster.characterId }).from(campaignSessionRoster).where(eq(campaignSessionRoster.sessionId, target.sessionId))
    : tx.select({ id: campaignSessionSceneMember.characterId }).from(campaignSessionSceneMember).where(eq(campaignSessionSceneMember.sceneId, target.sceneId));
  return tx.select({ characterId: campaignCharacter.id, characterName: campaignCharacter.name }).from(campaignCharacter)
    .innerJoin(campaignCharacterProfile, eq(campaignCharacterProfile.characterId, campaignCharacter.id))
    .where(and(eq(campaignCharacter.campaignId, campaignId), isNull(campaignCharacter.archivedAt), inArray(campaignCharacter.id, membership)))
    .orderBy(asc(campaignCharacter.id));
}

export async function readCloseoutAwardViewInTransaction(tx: Transaction, target: CloseoutAwardTarget, actor: LifecycleActor): Promise<CloseoutAwardView> {
  const context = await loadContext(tx, target, actor, false);
  return { recipients: await eligibleRecipients(tx, target, context.campaignId), decision: await readDecision(tx, target) };
}

/** The caller closes the root in this same transaction. One decision survives every reopen. */
export async function applyCloseoutAwardsInTransaction(tx: Transaction, target: CloseoutAwardTarget, actor: LifecycleActor, raw: CloseoutAwardInput): Promise<void> {
  const input = normalizeCloseoutAwards(raw);
  const context = await loadContext(tx, target, actor, true);
  assertCampaignRuntimeOperator(actor, context.ownerUserId, "closeout awards");
  const [god] = await tx.select({ name: user.name }).from(user)
    .innerJoin(userRole, and(eq(userRole.userId, user.id), eq(userRole.role, "god")))
    .where(eq(user.id, actor.userId)).limit(1);
  if (!god || context.archivedAt) throw new Error("Only the active Campaign-owning G.O.D. can award closeout rewards.");
  const previous = await readDecision(tx, target);
  if (previous) {
    const recorded = normalizeCloseoutAwards({ note: previous.note, awards: previous.awards });
    if (JSON.stringify(input) !== JSON.stringify(recorded) && (input.awards.length > 0 || input.note)) {
      throw new Error("Awards were already recorded for this closeout. Reopening cannot issue another award.");
    }
    return;
  }
  if (context.status !== "active" || context.sessionStatus !== "active") throw new Error("Awards can only accompany the first completion of an active Scene or Session.");
  const recipients = await eligibleRecipients(tx, target, context.campaignId);
  const names = new Map(recipients.map(({ characterId, characterName }) => [characterId, characterName]));
  if (input.awards.some(({ characterId }) => !names.has(characterId))) throw new Error("Every award recipient must be a current member with an active Character profile. Refresh the closeout before confirming.");
  const ids = input.awards.map(({ characterId }) => characterId);
  const profiles = ids.length ? await tx.select().from(campaignCharacterProfile)
    .where(inArray(campaignCharacterProfile.characterId, ids)).orderBy(asc(campaignCharacterProfile.characterId)).for("update") : [];
  if (profiles.length !== ids.length) throw new Error("An award recipient's Character profile is unavailable.");
  for (const award of input.awards) {
    const profile = profiles.find(({ characterId }) => characterId === award.characterId)!;
    if (!closeoutAwardTotalIsSafe(profile.experience, award.experience) || !closeoutAwardTotalIsSafe(profile.fame, award.fame) || !closeoutAwardTotalIsSafe(profile.quintessence, award.quintessence)) throw new Error("An award would exceed the supported Character balance.");
  }
  const [decision] = await tx.insert(tabletopCloseoutAwardDecision).values({ ...target, campaignId: context.campaignId, awardedByUserId: actor.userId, awardedByName: god.name, note: input.note }).returning();
  for (const award of input.awards) {
    // Lifetime XP/Quintessence fields track spending in this system, not new grants.
    if (award.experience || award.fame || award.quintessence) await tx.update(campaignCharacterProfile).set({ experience: sql`${campaignCharacterProfile.experience} + ${award.experience}`,
      fame: sql`${campaignCharacterProfile.fame} + ${award.fame}`, quintessence: sql`${campaignCharacterProfile.quintessence} + ${award.quintessence}`, updatedAt: new Date() })
      .where(eq(campaignCharacterProfile.characterId, award.characterId));
    await tx.insert(tabletopCloseoutAward).values({ ...award, decisionId: decision.id, campaignId: context.campaignId, characterName: names.get(award.characterId)! });
    if (award.experience || award.fame || award.quintessence) await publishCharacterStateInvalidationInTransaction(tx, award.characterId);
  }
}

export async function readPlayerCloseoutAwardsInTransaction(tx: Transaction, characterId: number, userId: string): Promise<PlayerCloseoutAward[]> {
  const [owned] = await tx.select({ id: campaignCharacter.id }).from(campaignCharacter)
    .innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
    .innerJoin(campaignPlayer, and(eq(campaignPlayer.campaignId, campaign.id), eq(campaignPlayer.userId, userId)))
    .innerJoin(userRole, and(eq(userRole.userId, userId), eq(userRole.role, "player")))
    .where(and(eq(campaignCharacter.id, characterId), eq(campaignCharacter.playerUserId, userId), eq(campaignCharacter.isNpc, false), isNull(campaign.archivedAt), isNull(campaignCharacter.archivedAt))).limit(1);
  if (!owned) throw new Error("This Character's award history is unavailable to you.");
  const rows = await tx.select({ award: tabletopCloseoutAward, sessionTitle: campaignSession.title, sceneTitle: campaignSessionScene.title, awardedAt: tabletopCloseoutAwardDecision.awardedAt, note: tabletopCloseoutAwardDecision.note })
    .from(tabletopCloseoutAward).innerJoin(tabletopCloseoutAwardDecision, eq(tabletopCloseoutAwardDecision.id, tabletopCloseoutAward.decisionId))
    .innerJoin(campaignSession, eq(campaignSession.id, tabletopCloseoutAwardDecision.sessionId))
    .leftJoin(campaignSessionScene, eq(campaignSessionScene.id, tabletopCloseoutAwardDecision.sceneId))
    .where(eq(tabletopCloseoutAward.characterId, characterId)).orderBy(desc(tabletopCloseoutAward.id)).limit(30);
  return rows.map(({ award, sessionTitle, sceneTitle, awardedAt, note }) => ({ id: award.id, characterId, experience: award.experience, fame: award.fame, quintessence: award.quintessence, sessionTitle, sceneTitle, awardedAt: awardedAt.toISOString(), note }));
}
