import "server-only";

import { and, asc, eq, inArray, ne } from "drizzle-orm";
import type { db } from "@/db";
import { campaignCharacter } from "@/db/realm-schema";
import { campaignSession, campaignSessionScene, campaignSessionSceneMember } from "@/db/tabletop-operations-schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Called inside an authorized Scene mutation, before activation or active membership writes. */
export async function assertNoActiveSceneMemberOverlapInTransaction(
  tx: Tx,
  context: { sessionId: number; campaignId: number; sceneId: number },
  characterIds?: readonly number[],
): Promise<void> {
  // All Scene mutation paths already lock this parent. Keep that lock through the
  // write so concurrent starts, reopens and member additions cannot both pass.
  const [session] = await tx.select({ id: campaignSession.id }).from(campaignSession)
    .where(and(eq(campaignSession.id, context.sessionId), eq(campaignSession.campaignId, context.campaignId)))
    .for("update");
  if (!session) throw new Error("That Session no longer exists.");
  const members = characterIds ?? (await tx.select({ characterId: campaignSessionSceneMember.characterId })
    .from(campaignSessionSceneMember)
    .where(and(eq(campaignSessionSceneMember.sceneId, context.sceneId), eq(campaignSessionSceneMember.sessionId, context.sessionId))))
    .map(({ characterId }) => characterId);
  if (!members.length) return;
  const [conflict] = await tx.select({ characterName: campaignCharacter.name, sceneTitle: campaignSessionScene.title })
    .from(campaignSessionSceneMember)
    .innerJoin(campaignSessionScene, eq(campaignSessionScene.id, campaignSessionSceneMember.sceneId))
    .innerJoin(campaignCharacter, eq(campaignCharacter.id, campaignSessionSceneMember.characterId))
    .where(and(
      eq(campaignSessionScene.sessionId, context.sessionId),
      eq(campaignSessionScene.campaignId, context.campaignId),
      eq(campaignSessionScene.status, "active"),
      ne(campaignSessionScene.id, context.sceneId),
      inArray(campaignSessionSceneMember.characterId, [...members]),
    ))
    .orderBy(asc(campaignSessionScene.sequenceNumber), asc(campaignCharacter.name), asc(campaignCharacter.id))
    .limit(1);
  if (conflict) {
    throw new Error(`${conflict.characterName} is already participating in the active Scene “${conflict.sceneTitle}”. Remove them from that Scene first.`);
  }
}
