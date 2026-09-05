import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { campaign } from "@/db/campaign-schema";
import { campaignCharacter } from "@/db/realm-schema";
import { resolveManagedCharacterAccess } from "@/features/authorization/managed-character-capability";
import { requireGodOrAdminAccessContext } from "@/lib/server-access";

export type ManagedCharacterCapabilities = {
  characterId: number;
  campaignId: number;
  canManageRecord: boolean;
  canOperateRuntime: boolean;
};

export async function getManagedCharacterCapabilities(
  characterId: number,
): Promise<ManagedCharacterCapabilities> {
  if (!Number.isInteger(characterId) || characterId <= 0) {
    throw new Error("A saved Character is required.");
  }

  const { session, roles } = await requireGodOrAdminAccessContext();
  const [record] = await db
    .select({
      characterId: campaignCharacter.id,
      campaignId: campaignCharacter.campaignId,
      campaignOwnerUserId: campaign.createdByUserId,
    })
    .from(campaignCharacter)
    .innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
    .where(eq(campaignCharacter.id, characterId))
    .limit(1);

  if (!record) {
    throw new Error("Character not found.");
  }

  return {
    characterId: record.characterId,
    campaignId: record.campaignId,
    ...resolveManagedCharacterAccess({
      actorUserId: session.user.id,
      roles,
      campaignOwnerUserId: record.campaignOwnerUserId,
    }),
  };
}
