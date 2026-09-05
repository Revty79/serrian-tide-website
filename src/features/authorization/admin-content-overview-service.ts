import "server-only";

import { asc, count, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { campaign } from "@/db/campaign-schema";
import { creature } from "@/db/creature-schema";
import { derivedAbility } from "@/db/derived-ability-schema";
import { item } from "@/db/item-schema";
import { race } from "@/db/race-schema";
import { campaignCharacter } from "@/db/realm-schema";
import { skill } from "@/db/skill-schema";
import { requireAdmin } from "@/lib/server-access";

import {
  buildAdminContentOverview,
  type AdminContentOverview,
} from "./admin-content-overview";

function value(row: { value: number } | undefined): number {
  return Number(row?.value ?? 0);
}

export async function getAdminContentOverview(): Promise<AdminContentOverview> {
  await requireAdmin();

  const [
    campaigns,
    characters,
    [activeRaces],
    [archivedRaces],
    [activeCreatures],
    [archivedCreatures],
    [activeSkills],
    [archivedSkills],
    [activeItems],
    [archivedItems],
    [activeDerivedAbilities],
    [archivedDerivedAbilities],
  ] = await Promise.all([
    db.select({
      id: campaign.id,
      name: campaign.name,
      createdByUserId: campaign.createdByUserId,
      archivedAt: campaign.archivedAt,
      archiveReason: campaign.archiveReason,
    }).from(campaign).orderBy(asc(campaign.name), asc(campaign.id)),
    db.select({
      id: campaignCharacter.id,
      name: campaignCharacter.name,
      campaignId: campaign.id,
      campaignName: campaign.name,
      campaignArchivedAt: campaign.archivedAt,
      campaignOwnerUserId: campaign.createdByUserId,
      controllerUserId: campaignCharacter.playerUserId,
      isNpc: campaignCharacter.isNpc,
      npcKind: campaignCharacter.npcKind,
      npcBuildMode: campaignCharacter.npcBuildMode,
      npcRoleLabel: campaignCharacter.npcRoleLabel,
      archivedAt: campaignCharacter.archivedAt,
      archiveReason: campaignCharacter.archiveReason,
    }).from(campaignCharacter)
      .innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
      .orderBy(asc(campaign.name), asc(campaignCharacter.name), asc(campaignCharacter.id)),
    db.select({ value: count() }).from(race).where(isNull(race.archivedAt)),
    db.select({ value: count() }).from(race).where(isNotNull(race.archivedAt)),
    db.select({ value: count() }).from(creature).where(isNull(creature.archivedAt)),
    db.select({ value: count() }).from(creature).where(isNotNull(creature.archivedAt)),
    db.select({ value: count() }).from(skill).where(isNull(skill.archivedAt)),
    db.select({ value: count() }).from(skill).where(isNotNull(skill.archivedAt)),
    db.select({ value: count() }).from(item).where(isNull(item.archivedAt)),
    db.select({ value: count() }).from(item).where(isNotNull(item.archivedAt)),
    db.select({ value: count() }).from(derivedAbility).where(isNull(derivedAbility.archivedAt)),
    db.select({ value: count() }).from(derivedAbility).where(isNotNull(derivedAbility.archivedAt)),
  ]);

  const accountIds = [...new Set([
    ...campaigns.map((entry) => entry.createdByUserId),
    ...characters.flatMap((entry) => [entry.campaignOwnerUserId, entry.controllerUserId]),
  ])];
  const accounts = accountIds.length > 0
    ? await db.select({
      id: user.id,
      name: user.name,
      username: user.username,
      displayUsername: user.displayUsername,
    }).from(user).where(inArray(user.id, accountIds))
    : [];

  return buildAdminContentOverview({
    accounts,
    campaigns,
    characters,
    sharedCatalogs: [
      { key: "races", label: "Races", href: "/heavens/races", active: value(activeRaces), archived: value(archivedRaces) },
      { key: "creatures", label: "Creatures", href: "/heavens/creatures", active: value(activeCreatures), archived: value(archivedCreatures) },
      { key: "skills", label: "Skills", href: "/heavens/skills", active: value(activeSkills), archived: value(archivedSkills) },
      { key: "items", label: "Items & Equipment", href: "/heavens/inventory", active: value(activeItems), archived: value(archivedItems) },
      { key: "derived-abilities", label: "Derived Abilities", href: "/heavens/derived-abilities", active: value(activeDerivedAbilities), archived: value(archivedDerivedAbilities) },
    ],
  });
}
