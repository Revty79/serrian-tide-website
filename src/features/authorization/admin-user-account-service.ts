import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { userRole } from "@/db/authorization-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import { campaignCharacter } from "@/db/realm-schema";

import {
  buildAdminUserAccountSummary,
  type AdminUserAccountSummary,
} from "./admin-user-account";

export async function getAdminUserAccountSummary(
  userId: string,
): Promise<AdminUserAccountSummary | null> {
  const [account] = await db
    .select({
      id: user.id,
      name: user.name,
      username: user.username,
      displayUsername: user.displayUsername,
      email: user.email,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!account) return null;

  const [roleRows, campaignsCreated, campaignsJoined, characters] =
    await Promise.all([
      db
        .select({ role: userRole.role })
        .from(userRole)
        .where(eq(userRole.userId, userId)),
      db
        .select({ id: campaign.id, name: campaign.name })
        .from(campaign)
        .where(eq(campaign.createdByUserId, userId))
        .orderBy(asc(campaign.name), asc(campaign.id)),
      db
        .select({ id: campaign.id, name: campaign.name })
        .from(campaignPlayer)
        .innerJoin(campaign, eq(campaign.id, campaignPlayer.campaignId))
        .where(eq(campaignPlayer.userId, userId))
        .orderBy(asc(campaign.name), asc(campaign.id)),
      db
        .select({
          id: campaignCharacter.id,
          name: campaignCharacter.name,
          campaignId: campaign.id,
          campaignName: campaign.name,
          isNpc: campaignCharacter.isNpc,
        })
        .from(campaignCharacter)
        .innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
        .where(eq(campaignCharacter.playerUserId, userId))
        .orderBy(
          asc(campaign.name),
          asc(campaignCharacter.name),
          asc(campaignCharacter.id),
        ),
    ]);

  return buildAdminUserAccountSummary({
    account,
    roles: roleRows.map(({ role }) => role),
    campaignsCreated,
    campaignsJoined,
    characters,
  });
}
