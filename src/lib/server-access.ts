import { and, eq, or } from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@/db";
import { userRole, type SerrianRole } from "@/db/authorization-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import { auth } from "@/lib/auth";

export async function requireSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error("You must be signed in.");
  }

  return session;
}

export async function requireRole(role: "admin" | "god" | "player") {
  return (await requireAccessContext(role)).session;
}

export async function requireAccessContext(
  role: "admin" | "god" | "player",
): Promise<{ session: Awaited<ReturnType<typeof requireSession>>; roles: SerrianRole[] }> {
  const session = await requireSession();

  const access = await db
    .select({ role: userRole.role })
    .from(userRole)
    .where(eq(userRole.userId, session.user.id));
  const roles = access.map(({ role: assignedRole }) => assignedRole);

  if (!roles.includes(role)) {
    throw new Error(`${role === "god" ? "G.O.D." : role} access is required.`);
  }

  return { session, roles };
}

export function requireAdmin() {
  return requireRole("admin");
}

export function requireGod() {
  return requireRole("god");
}

export function requirePlayer() {
  return requireRole("player");
}

export async function requireCampaignOwner(campaignId: number) {
  const session = await requireSession();

  const [ownedCampaign] = await db
    .select({ id: campaign.id })
    .from(campaign)
    .where(
      and(
        eq(campaign.id, campaignId),
        eq(campaign.createdByUserId, session.user.id),
      ),
    )
    .limit(1);

  if (!ownedCampaign) {
    throw new Error("Only the Campaign creator can modify this Campaign.");
  }

  return session;
}

export async function requireCampaignAccess(campaignId: number) {
  const session = await requireSession();

  const [accessibleCampaign] = await db
    .select({ id: campaign.id })
    .from(campaign)
    .leftJoin(
      campaignPlayer,
      and(
        eq(campaignPlayer.campaignId, campaign.id),
        eq(campaignPlayer.userId, session.user.id),
      ),
    )
    .where(
      and(
        eq(campaign.id, campaignId),
        or(
          eq(campaign.createdByUserId, session.user.id),
          eq(campaignPlayer.userId, session.user.id),
        ),
      ),
    )
    .limit(1);

  if (!accessibleCampaign) {
    throw new Error("You do not have access to this Campaign.");
  }

  return session;
}
