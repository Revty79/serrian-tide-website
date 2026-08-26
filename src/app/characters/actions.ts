"use server";

import {
  and,
  asc,
  eq,
  inArray,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { user } from "@/db/auth-schema";
import {
  campaign,
  campaignAllowedSystem,
  campaignDerivedCurrency,
  campaignPlayer,
} from "@/db/campaign-schema";
import { armorProfile, item, weaponProfile } from "@/db/item-schema";
import {
  race,
  raceAttributeCap,
  raceMovementMode,
  raceSkillLink,
} from "@/db/race-schema";
import { creature } from "@/db/creature-schema";
import {
  campaignAllowedRace,
  campaignCharacter,
  campaignCharacterAttribute,
  campaignCharacterCurrencyHolding,
  campaignCharacterItem,
  campaignCharacterProfile,
  campaignCharacterSkillAllocation,
  campaignCreatureNpcProfile,
  campaignInventoryItem,
} from "@/db/realm-schema";
import {
  skill,
  skillExtension,
  skillRelationship,
} from "@/db/skill-schema";
import {
  CHARACTER_ATTRIBUTE_KEYS,
  type CharacterAggregate,
  type CharacterAttributeKey,
  type CharacterDraft,
  type CharacterRaceAggregate,
} from "@/features/characters/models";
import {
  evaluateCharacterReadiness,
  getCreationPurchasedSkillMaximum,
  getEffectiveSkillPoints,
  getRacialSkillGrant,
  getSkillUnlockThreshold,
  isSkillAllowedByCampaign,
} from "@/features/characters/character-rules";
import {
  getExperienceFromQuintessence,
  getQuintessenceCost,
  type CharacterQuintessencePurchaseType,
} from "@/features/characters/quintessence-rules";
import { requireGod, requirePlayer, requireSession } from "@/lib/server-access";

export type PlayerCampaignSummary = { id: number; name: string };
export type CharacterSummary = {
  id: number;
  campaignId: number;
  playerUserId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  creationCompletedAt: string | null;
  isNpc: boolean;
  npcKind: "race" | "creature";
  creatureTemplateName: string | null;
};
export type CampaignPlayerSummary = {
  userId: string;
  username: string;
  name: string;
  addedAt: string;
};
export type GodCampaignSummary = { id: number; name: string };

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function required(value: string | null | undefined, label: string) {
  const result = clean(value);
  if (!result) throw new Error(`${label} is required.`);
  return result;
}

function nonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be zero or greater.`);
  }
  return value;
}

function optionalWholeNonNegative(value: number | null, label: string) {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a whole number zero or greater.`);
  }
  return value;
}

async function isCampaignOwner(campaignId: number, userId: string) {
  const [row] = await db
    .select({ id: campaign.id })
    .from(campaign)
    .where(and(eq(campaign.id, campaignId), eq(campaign.createdByUserId, userId)))
    .limit(1);
  return Boolean(row);
}

async function isCampaignMember(campaignId: number, userId: string) {
  const [row] = await db
    .select({ campaignId: campaignPlayer.campaignId })
    .from(campaignPlayer)
    .where(and(eq(campaignPlayer.campaignId, campaignId), eq(campaignPlayer.userId, userId)))
    .limit(1);
  return Boolean(row);
}

async function requireCharacterAccess(characterId: number, godMode: boolean) {
  const session = await requireSession();
  const [row] = await db
    .select({
      id: campaignCharacter.id,
      campaignId: campaignCharacter.campaignId,
      playerUserId: campaignCharacter.playerUserId,
      isNpc: campaignCharacter.isNpc,
    })
    .from(campaignCharacter)
    .where(eq(campaignCharacter.id, characterId))
    .limit(1);

  if (!row) throw new Error("Character not found.");

  if (godMode) {
    await requireGod();
    if (!(await isCampaignOwner(row.campaignId, session.user.id))) {
      throw new Error("Only the Campaign creator can administratively edit this Character.");
    }
  } else {
    await requirePlayer();
    if (row.isNpc || row.playerUserId !== session.user.id) {
      throw new Error("A Player may only access their own Character.");
    }
    if (!(await isCampaignMember(row.campaignId, session.user.id))) {
      throw new Error("This Character is not in one of your Campaign memberships.");
    }
  }

  return { session, row };
}

async function readRaceAggregate(raceId: number): Promise<CharacterRaceAggregate | null> {
  const [raceRow] = await db
    .select({
      id: race.id,
      name: race.name,
      size: race.size,
      baseMagic: race.baseMagic,
      ageMin: race.ageMin,
      ageMax: race.ageMax,
      ageRangeText: race.ageRangeText,
      physicalDescription: race.physicalDescription,
      racialQuirkName: race.racialQuirkName,
      quirkSuccessEffect: race.quirkSuccessEffect,
      quirkFailureEffect: race.quirkFailureEffect,
    })
    .from(race)
    .where(eq(race.id, raceId))
    .limit(1);
  if (!raceRow) return null;

  const [caps, movement, links] = await Promise.all([
    db.select({ attributeKey: raceAttributeCap.attributeKey, maxValue: raceAttributeCap.maxValue })
      .from(raceAttributeCap).where(eq(raceAttributeCap.raceId, raceId)).orderBy(asc(raceAttributeCap.sortOrder)),
    db.select({ movementMode: raceMovementMode.movementMode, baseValue: raceMovementMode.baseValue, notes: raceMovementMode.notes })
      .from(raceMovementMode).where(eq(raceMovementMode.raceId, raceId)).orderBy(asc(raceMovementMode.sortOrder)),
    db.select({
      skillId: raceSkillLink.skillId,
      skillName: skill.name,
      skillClassification: skill.classification,
      linkType: raceSkillLink.linkType,
      value: raceSkillLink.value,
    }).from(raceSkillLink)
      .innerJoin(skill, eq(skill.id, raceSkillLink.skillId))
      .where(eq(raceSkillLink.raceId, raceId))
      .orderBy(asc(raceSkillLink.sortOrder), asc(raceSkillLink.id)),
  ]);

  return { race: raceRow, attributeCaps: caps, movementModes: movement, skillLinks: links };
}

function readSpellImportReference(dataJson: string) {
  try {
    const parsed = JSON.parse(dataJson) as {
      spreadsheetReference?: { masteryLabel?: unknown; statedSpellCost?: unknown };
    };
    const mastery = parsed.spreadsheetReference?.masteryLabel;
    const cost = parsed.spreadsheetReference?.statedSpellCost;
    return {
      spellLevel: typeof mastery === "string" ? mastery : null,
      manaCost: typeof cost === "number" && Number.isFinite(cost)
        ? cost
        : typeof cost === "string" && cost.trim() && Number.isFinite(Number(cost))
          ? Number(cost)
          : null,
    };
  } catch {
    return { spellLevel: null, manaCost: null };
  }
}

export async function listPlayerCampaigns(): Promise<PlayerCampaignSummary[]> {
  const session = await requirePlayer();
  return db
    .select({ id: campaign.id, name: campaign.name })
    .from(campaignPlayer)
    .innerJoin(campaign, eq(campaign.id, campaignPlayer.campaignId))
    .where(eq(campaignPlayer.userId, session.user.id))
    .orderBy(asc(campaign.name), asc(campaign.id));
}

export async function listGodCampaigns(): Promise<GodCampaignSummary[]> {
  const session = await requireGod();
  return db
    .select({ id: campaign.id, name: campaign.name })
    .from(campaign)
    .where(eq(campaign.createdByUserId, session.user.id))
    .orderBy(asc(campaign.name), asc(campaign.id));
}

export async function listCampaignPlayers(campaignId: number): Promise<CampaignPlayerSummary[]> {
  const session = await requireGod();
  if (!(await isCampaignOwner(campaignId, session.user.id))) {
    throw new Error("Only the Campaign creator can manage its Players.");
  }
  return db
    .select({
      userId: user.id,
      username: user.username,
      name: user.name,
      addedAt: campaignPlayer.createdAt,
    })
    .from(campaignPlayer)
    .innerJoin(user, eq(user.id, campaignPlayer.userId))
    .where(eq(campaignPlayer.campaignId, campaignId))
    .orderBy(asc(user.username), asc(user.name), asc(user.id))
    .then((rows) => rows.map((row) => ({
      userId: row.userId,
      username: row.username ?? row.name,
      name: row.name,
      addedAt: row.addedAt.toISOString(),
    })));
}

export async function listCharactersForCampaign(
  campaignId: number,
  playerUserId?: string,
  includeNpcs = false,
): Promise<CharacterSummary[]> {
  const session = await requireSession();
  const godMode = await isCampaignOwner(campaignId, session.user.id);

  if (!godMode) {
    await requirePlayer();
    if (!(await isCampaignMember(campaignId, session.user.id))) {
      throw new Error("You do not have access to this Campaign.");
    }
  }

  const ownerId = godMode && playerUserId ? playerUserId : session.user.id;
  const conditions = [eq(campaignCharacter.campaignId, campaignId)];
  if (includeNpcs && godMode) {
    conditions.push(eq(campaignCharacter.isNpc, true));
  } else {
    conditions.push(eq(campaignCharacter.isNpc, false));
    conditions.push(eq(campaignCharacter.playerUserId, ownerId));
  }

  const rows = await db
    .select({
      id: campaignCharacter.id,
      campaignId: campaignCharacter.campaignId,
      playerUserId: campaignCharacter.playerUserId,
      name: campaignCharacter.name,
      createdAt: campaignCharacter.createdAt,
      updatedAt: campaignCharacter.updatedAt,
      creationCompletedAt: campaignCharacterProfile.creationCompletedAt,
      isNpc: campaignCharacter.isNpc,
      npcKind: campaignCharacter.npcKind,
      creatureTemplateName: creature.canonicalName,
    })
    .from(campaignCharacter)
    .leftJoin(campaignCharacterProfile, eq(campaignCharacterProfile.characterId, campaignCharacter.id))
    .leftJoin(campaignCreatureNpcProfile, eq(campaignCreatureNpcProfile.characterId, campaignCharacter.id))
    .leftJoin(
      creature,
      eq(creature.id, campaignCreatureNpcProfile.creatureId),
    )
    .where(and(...conditions))
    .orderBy(asc(campaignCharacter.name), asc(campaignCharacter.id));

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    creationCompletedAt: row.creationCompletedAt?.toISOString() ?? null,
    npcKind: row.npcKind === "creature" ? "creature" : "race",
  }));
}

export async function createCharacter(
  campaignId: number,
  playerUserId?: string,
): Promise<CharacterAggregate> {
  const session = await requireSession();
  const targetUserId = playerUserId ?? session.user.id;
  const ownerMode = await isCampaignOwner(campaignId, session.user.id);

  if (targetUserId !== session.user.id || ownerMode) {
    await requireGod();
    if (!ownerMode) throw new Error("Only the Campaign creator can create a Character for another Player.");
  } else {
    await requirePlayer();
  }

  if (!(await isCampaignMember(campaignId, targetUserId))) {
    throw new Error("The selected Player must belong to this Campaign before a Character can be created.");
  }

  const [campaignRow] = await db
    .select({ startingCreditAmount: campaign.startingCreditAmount, fatePointMethod: campaign.fatePointMethod, assignedFatePoints: campaign.assignedFatePoints })
    .from(campaign).where(eq(campaign.id, campaignId)).limit(1);
  if (!campaignRow) throw new Error("Campaign not found.");

  const characterId = await db.transaction(async (tx) => {
    const [created] = await tx.insert(campaignCharacter).values({
      campaignId,
      playerUserId: targetUserId,
      name: "New Character",
      isNpc: false,
      npcKind: "race",
    }).returning({ id: campaignCharacter.id });

    await tx.insert(campaignCharacterProfile).values({
      characterId: created.id,
      creditsRemaining: campaignRow.startingCreditAmount,
      fatePoints: campaignRow.fatePointMethod === "Assigned" ? campaignRow.assignedFatePoints ?? 0 : null,
    });
    await tx.insert(campaignCharacterAttribute).values(
      CHARACTER_ATTRIBUTE_KEYS.map((attributeKey) => ({ characterId: created.id, attributeKey, value: 25 })),
    );
    return created.id;
  });

  revalidatePath("/realms");
  revalidatePath("/heavens");
  return getCharacter(characterId, ownerMode);
}

export async function createRaceNpc(campaignId: number): Promise<CharacterAggregate> {
  const session = await requireGod();
  if (!(await isCampaignOwner(campaignId, session.user.id))) {
    throw new Error("Only the Campaign creator can create its NPCs.");
  }

  const [campaignRow] = await db.select({ startingCreditAmount: campaign.startingCreditAmount }).from(campaign).where(eq(campaign.id, campaignId)).limit(1);
  if (!campaignRow) throw new Error("Campaign not found.");

  await db.insert(campaignPlayer).values({ campaignId, userId: session.user.id, isNpcController: true }).onConflictDoNothing();

  const characterId = await db.transaction(async (tx) => {
    const [created] = await tx.insert(campaignCharacter).values({
      campaignId,
      playerUserId: session.user.id,
      name: "New NPC",
      isNpc: true,
      npcKind: "race",
    }).returning({ id: campaignCharacter.id });
    await tx.insert(campaignCharacterProfile).values({ characterId: created.id, creditsRemaining: campaignRow.startingCreditAmount });
    await tx.insert(campaignCharacterAttribute).values(CHARACTER_ATTRIBUTE_KEYS.map((attributeKey) => ({ characterId: created.id, attributeKey, value: 25 })));
    return created.id;
  });

  revalidatePath("/heavens/npcs");
  return getCharacter(characterId, true);
}

export async function getCharacter(characterId: number, godMode = false): Promise<CharacterAggregate> {
  const { row } = await requireCharacterAccess(characterId, godMode);

  const [profileRow] = await db.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, characterId)).limit(1);
  if (!profileRow) throw new Error("The Character aggregate is missing its profile row.");

  const [
    attributeRows,
    allocationRows,
    ownedItems,
    currencyHoldings,
    allowedSystemRows,
    currencies,
    allowedRaceRows,
    skillRows,
    relationshipRows,
    extensionRows,
    authorizedRows,
    characterRow,
  ] = await Promise.all([
    db.select().from(campaignCharacterAttribute).where(eq(campaignCharacterAttribute.characterId, characterId)),
    db.select({
      id: campaignCharacterSkillAllocation.id,
      characterId: campaignCharacterSkillAllocation.characterId,
      skillId: campaignCharacterSkillAllocation.skillId,
      skillName: skill.name,
      skillClassification: skill.classification,
      skillTier: skill.tier,
      primaryAttribute: skill.primaryAttribute,
      parentAllocationId: campaignCharacterSkillAllocation.parentAllocationId,
      points: campaignCharacterSkillAllocation.points,
      createdAt: campaignCharacterSkillAllocation.createdAt,
      updatedAt: campaignCharacterSkillAllocation.updatedAt,
    }).from(campaignCharacterSkillAllocation)
      .innerJoin(skill, eq(skill.id, campaignCharacterSkillAllocation.skillId))
      .where(eq(campaignCharacterSkillAllocation.characterId, characterId))
      .orderBy(asc(campaignCharacterSkillAllocation.id)),
    db.select({
      characterId: campaignCharacterItem.characterId,
      itemId: campaignCharacterItem.itemId,
      canonicalId: item.canonicalId,
      name: item.name,
      catalogScope: item.catalogScope,
      equipmentGroup: item.equipmentGroup,
      recordType: item.recordType,
      category: item.category,
      quantity: campaignCharacterItem.quantity,
      unitCostCredits: campaignCharacterItem.unitCostCredits,
      acquiredAt: campaignCharacterItem.acquiredAt,
    }).from(campaignCharacterItem)
      .innerJoin(item, eq(item.id, campaignCharacterItem.itemId))
      .where(eq(campaignCharacterItem.characterId, characterId))
      .orderBy(asc(item.name)),
    db.select().from(campaignCharacterCurrencyHolding).where(eq(campaignCharacterCurrencyHolding.characterId, characterId)),
    db.select({ system: campaignAllowedSystem.system }).from(campaignAllowedSystem).where(eq(campaignAllowedSystem.campaignId, row.campaignId)).orderBy(asc(campaignAllowedSystem.sortOrder)),
    db.select().from(campaignDerivedCurrency).where(eq(campaignDerivedCurrency.campaignId, row.campaignId)).orderBy(asc(campaignDerivedCurrency.sortOrder)),
    db.select({ id: race.id, name: race.name }).from(campaignAllowedRace).innerJoin(race, eq(race.id, campaignAllowedRace.raceId)).where(eq(campaignAllowedRace.campaignId, row.campaignId)).orderBy(asc(campaignAllowedRace.sortOrder), asc(race.name)),
    db.select().from(skill).orderBy(asc(skill.name), asc(skill.id)),
    db.select({ skillId: skillRelationship.skillId, relatedSkillId: skillRelationship.relatedSkillId, relationshipType: skillRelationship.relationshipType, sortOrder: skillRelationship.sortOrder }).from(skillRelationship).where(eq(skillRelationship.relationshipType, "parent")).orderBy(asc(skillRelationship.skillId), asc(skillRelationship.sortOrder)),
    db.select({ skillId: skillExtension.skillId, extensionType: skillExtension.extensionType, dataJson: skillExtension.dataJson }).from(skillExtension).where(inArray(skillExtension.extensionType, ["spell-import-source", "spell-construction"])),
    db.select({
      id: item.id,
      canonicalId: item.canonicalId,
      name: item.name,
      catalogScope: item.catalogScope,
      equipmentGroup: item.equipmentGroup,
      recordType: item.recordType,
      category: item.category,
      credits: item.credits,
      priceBasis: item.priceBasis,
      description: item.description,
      weight: item.weight,
      weightUnit: item.weightUnit,
      size: item.size,
      durability: item.durability,
      weaponType: weaponProfile.weaponType,
      handedness: weaponProfile.handedness,
      damage: weaponProfile.damage,
      damageType: weaponProfile.damageType,
      rangeText: weaponProfile.rangeText,
      reachText: weaponProfile.reachText,
      weaponRulesText: weaponProfile.rulesText,
      armorType: armorProfile.armorType,
      coverage: armorProfile.coverage,
      baseSoak: armorProfile.baseSoak,
      armorDamageModifiers: armorProfile.damageModifiersSourceText,
      armorRulesText: armorProfile.rulesText,
    }).from(campaignInventoryItem)
      .innerJoin(item, eq(item.id, campaignInventoryItem.itemId))
      .leftJoin(weaponProfile, eq(weaponProfile.itemId, item.id))
      .leftJoin(armorProfile, eq(armorProfile.itemId, item.id))
      .where(eq(campaignInventoryItem.campaignId, row.campaignId))
      .orderBy(asc(campaignInventoryItem.sortOrder), asc(item.name)),
    db.select({
      id: campaignCharacter.id,
      campaignId: campaignCharacter.campaignId,
      playerUserId: campaignCharacter.playerUserId,
      name: campaignCharacter.name,
      campaignName: campaign.name,
      playerUsername: user.username,
      playerName: user.name,
      createdAt: campaignCharacter.createdAt,
      updatedAt: campaignCharacter.updatedAt,
      isNpc: campaignCharacter.isNpc,
      npcKind: campaignCharacter.npcKind,
      attributePoints: campaign.attributePoints,
      skillPoints: campaign.skillPoints,
      maxStartingSkill: campaign.maxStartingSkill,
      pointsToUnlockNextTier: campaign.pointsToUnlockNextTier,
      maxPointsInSkill: campaign.maxPointsInSkill,
      startingCreditAmount: campaign.startingCreditAmount,
      currencySystem: campaign.currencySystem,
      fatePointMethod: campaign.fatePointMethod,
      assignedFatePoints: campaign.assignedFatePoints,
    }).from(campaignCharacter)
      .innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
      .innerJoin(user, eq(user.id, campaignCharacter.playerUserId))
      .where(eq(campaignCharacter.id, characterId))
      .limit(1),
  ]);

  const core = characterRow[0];
  if (!core) throw new Error("Character could not be reloaded.");
  const importMap = new Map<number, { spellLevel: string | null; manaCost: number | null }>();
  const spellDocuments = new Map<number, string>();
  for (const extension of extensionRows) {
    if (extension.extensionType === "spell-import-source") importMap.set(extension.skillId, readSpellImportReference(extension.dataJson));
    if (extension.extensionType === "spell-construction") spellDocuments.set(extension.skillId, extension.dataJson);
  }

  const selectedRace = profileRow.raceId === null ? null : await readRaceAggregate(profileRow.raceId);
  if (profileRow.raceId !== null && !allowedRaceRows.some(({ id }) => id === profileRow.raceId)) {
    throw new Error("The Character references a Race that is not allowed by its Campaign.");
  }

  const aggregate: CharacterAggregate = {
    character: {
      id: core.id,
      campaignId: core.campaignId,
      playerUserId: core.playerUserId,
      name: core.name,
      campaignName: core.campaignName,
      playerUsername: core.playerUsername ?? core.playerName,
      createdAt: core.createdAt.toISOString(),
      updatedAt: core.updatedAt.toISOString(),
      isNpc: core.isNpc,
      npcKind: core.npcKind === "creature" ? "creature" : "race",
    },
    profile: {
      characterId: profileRow.characterId,
      raceId: profileRow.raceId,
      age: profileRow.age,
      sex: profileRow.sex,
      heightFeet: profileRow.heightFeet,
      heightInches: profileRow.heightInches,
      weight: profileRow.weight,
      skinColor: profileRow.skinColor,
      eyeColor: profileRow.eyeColor,
      hairColor: profileRow.hairColor,
      deity: profileRow.deity,
      definingMarks: profileRow.definingMarks,
      personality: profileRow.personality,
      goals: profileRow.goals,
      secrets: profileRow.secrets,
      backstory: profileRow.backstory,
      motivations: profileRow.motivations,
      fame: profileRow.fame,
      experience: profileRow.experience,
      totalExperience: profileRow.totalExperience,
      quintessence: profileRow.quintessence,
      totalQuintessence: profileRow.totalQuintessence,
      fatePoints: profileRow.fatePoints,
      creditsRemaining: profileRow.creditsRemaining,
      creationCompletedAt: profileRow.creationCompletedAt?.toISOString() ?? null,
      createdAt: profileRow.createdAt.toISOString(),
      updatedAt: profileRow.updatedAt.toISOString(),
    },
    attributes: attributeRows.map((attribute) => ({
      characterId: attribute.characterId,
      attributeKey: attribute.attributeKey as CharacterAttributeKey,
      value: attribute.value,
    })),
    skillAllocations: allocationRows.map((allocation) => ({ ...allocation, createdAt: allocation.createdAt.toISOString(), updatedAt: allocation.updatedAt.toISOString() })),
    items: ownedItems.map((entry) => ({ ...entry, acquiredAt: entry.acquiredAt.toISOString() })),
    currencyHoldings,
    campaign: {
      id: core.campaignId,
      name: core.campaignName,
      attributePoints: core.attributePoints,
      skillPoints: core.skillPoints,
      maxStartingSkill: core.maxStartingSkill,
      pointsToUnlockNextTier: core.pointsToUnlockNextTier,
      maxPointsInSkill: core.maxPointsInSkill,
      startingCreditAmount: core.startingCreditAmount,
      currencySystem: core.currencySystem,
      fatePointMethod: core.fatePointMethod,
      assignedFatePoints: core.assignedFatePoints,
      allowedSystems: allowedSystemRows.map(({ system }) => system),
      derivedCurrencies: currencies,
    },
    allowedRaces: allowedRaceRows,
    selectedRace,
    skillCatalog: skillRows.map((skillRow) => ({
      id: skillRow.id,
      name: skillRow.name,
      classification: skillRow.classification,
      tier: skillRow.tier,
      primaryAttribute: skillRow.primaryAttribute,
      secondaryAttribute: skillRow.secondaryAttribute,
      definition: skillRow.definition,
      spellLevel: importMap.get(skillRow.id)?.spellLevel ?? null,
      manaCost: importMap.get(skillRow.id)?.manaCost ?? null,
      spellDocumentJson: spellDocuments.get(skillRow.id) ?? null,
    })),
    skillRelationships: relationshipRows,
    authorizedItems: authorizedRows,
  };

  return aggregate;
}

function normalizeDraft(aggregate: CharacterAggregate, draft: CharacterDraft, godMode: boolean) {
  const heightFeet = optionalWholeNonNegative(draft.profile.heightFeet, "Height feet");
  const heightInches = optionalWholeNonNegative(draft.profile.heightInches, "Height inches");
  if (heightInches !== null && heightInches > 11) throw new Error("Height inches must be between 0 and 11.");
  if (draft.profile.raceId !== null && !aggregate.allowedRaces.some(({ id }) => id === draft.profile.raceId)) {
    throw new Error("Choose a Race allowed by this Campaign.");
  }

  const attributes = CHARACTER_ATTRIBUTE_KEYS.map((attributeKey) => ({
    attributeKey,
    value: nonNegative(draft.attributes[attributeKey], `${attributeKey} Attribute`),
  }));
  const seenItems = new Set<number>();
  const items = draft.items.map((entry) => {
    if (!Number.isInteger(entry.itemId) || entry.itemId <= 0) throw new Error("Character Item must reference a saved Item.");
    if (seenItems.has(entry.itemId)) throw new Error("A master Item can only appear once in Character possessions.");
    seenItems.add(entry.itemId);
    if (!Number.isInteger(entry.quantity) || entry.quantity <= 0) throw new Error("Character Item quantity must be a positive whole number.");
    if (!Number.isFinite(entry.unitCostCredits) || entry.unitCostCredits < 0) throw new Error("Item unit cost must be zero or greater.");
    const authorized = aggregate.authorizedItems.find(({ id }) => id === entry.itemId);
    if (!godMode && (!authorized || authorized.credits === null || Math.abs(authorized.credits - entry.unitCostCredits) > 0.000001)) {
      throw new Error("Starting possessions must be Campaign-authorized and use their canonical price.");
    }
    return entry;
  });

  const currenciesSeen = new Set<number>();
  const currencyHoldings = draft.currencyHoldings.map((holding) => {
    if (!aggregate.campaign.derivedCurrencies.some(({ id }) => id === holding.currencyId)) throw new Error("Currency must belong to this Campaign.");
    if (currenciesSeen.has(holding.currencyId)) throw new Error("A Campaign Currency can only appear once in a purse.");
    currenciesSeen.add(holding.currencyId);
    if (!Number.isInteger(holding.quantity) || holding.quantity < 0) throw new Error("Currency quantity must be a whole number zero or greater.");
    return holding;
  });

  const name = required(draft.name, "Character Name");
  const profile = {
    raceId: draft.profile.raceId,
    age: draft.profile.age === null ? null : Math.trunc(nonNegative(draft.profile.age, "Age")),
    sex: clean(draft.profile.sex),
    heightFeet,
    heightInches,
    weight: draft.profile.weight === null ? null : nonNegative(draft.profile.weight, "Weight"),
    skinColor: clean(draft.profile.skinColor),
    eyeColor: clean(draft.profile.eyeColor),
    hairColor: clean(draft.profile.hairColor),
    deity: clean(draft.profile.deity),
    definingMarks: clean(draft.profile.definingMarks),
    personality: clean(draft.profile.personality),
    goals: clean(draft.profile.goals),
    secrets: clean(draft.profile.secrets),
    backstory: clean(draft.profile.backstory),
    motivations: clean(draft.profile.motivations),
    fame: nonNegative(draft.profile.fame, "Fame"),
    experience: nonNegative(draft.profile.experience, "Experience"),
    totalExperience: nonNegative(draft.profile.totalExperience, "Total Experience"),
    quintessence: nonNegative(draft.profile.quintessence, "Quintessence"),
    totalQuintessence: nonNegative(draft.profile.totalQuintessence, "Total Quintessence"),
    fatePoints: godMode || aggregate.campaign.fatePointMethod === "Rolled"
      ? optionalWholeNonNegative(draft.profile.fatePoints, "Fate Points")
      : aggregate.campaign.assignedFatePoints ?? 0,
    creditsRemaining: nonNegative(draft.profile.creditsRemaining, "Current funds"),
  };

  return { name, profile, attributes, items, currencyHoldings };
}

export async function saveCharacter(
  characterId: number,
  draft: CharacterDraft,
  completeCreation = false,
  godMode = false,
): Promise<CharacterAggregate> {
  await requireCharacterAccess(characterId, godMode);
  const aggregate = await getCharacter(characterId, godMode);
  if (!godMode && aggregate.profile.creationCompletedAt) {
    throw new Error("Character creation is complete and its creation record is permanently locked.");
  }

  const normalized = normalizeDraft(aggregate, draft, godMode);
  const selectedRace = draft.profile.raceId === null ? null : await readRaceAggregate(draft.profile.raceId);
  if (completeCreation && !godMode) {
    const readiness = evaluateCharacterReadiness(draft, aggregate, selectedRace);
    if (!readiness.ready) throw new Error(readiness.issues.join(" "));
  }

  await db.transaction(async (tx) => {
    await tx.update(campaignCharacter).set({ name: normalized.name, updatedAt: new Date() }).where(eq(campaignCharacter.id, characterId));
    await tx.update(campaignCharacterProfile).set({
      ...normalized.profile,
      creditsRemaining: godMode
        ? normalized.profile.creditsRemaining
        : Math.max(0, aggregate.campaign.startingCreditAmount - normalized.items.reduce((sum, entry) => sum + entry.quantity * entry.unitCostCredits, 0)),
      creationCompletedAt: completeCreation ? new Date() : aggregate.profile.creationCompletedAt ? new Date(aggregate.profile.creationCompletedAt) : null,
      updatedAt: new Date(),
    }).where(eq(campaignCharacterProfile.characterId, characterId));

    await tx.delete(campaignCharacterAttribute).where(eq(campaignCharacterAttribute.characterId, characterId));
    await tx.insert(campaignCharacterAttribute).values(normalized.attributes.map((entry) => ({ characterId, ...entry })));

    await tx.delete(campaignCharacterSkillAllocation).where(eq(campaignCharacterSkillAllocation.characterId, characterId));
    const allocationMap = new Map(draft.skillAllocations.map((entry) => [entry.draftId, entry]));
    const savedMap = new Map<number, number>();
    const visiting = new Set<number>();
    async function saveAllocation(draftId: number): Promise<number> {
      const existing = savedMap.get(draftId);
      if (existing) return existing;
      if (visiting.has(draftId)) throw new Error("Skill allocation path contains a cycle.");
      visiting.add(draftId);
      const allocation = allocationMap.get(draftId);
      if (!allocation) throw new Error("Skill allocation path is incomplete.");
      const parentAllocationId = allocation.parentDraftId === null ? null : await saveAllocation(allocation.parentDraftId);
      const [created] = await tx.insert(campaignCharacterSkillAllocation).values({
        characterId,
        skillId: allocation.skillId,
        parentAllocationId,
        points: nonNegative(allocation.points, "Skill points"),
      }).returning({ id: campaignCharacterSkillAllocation.id });
      savedMap.set(draftId, created.id);
      visiting.delete(draftId);
      return created.id;
    }
    for (const allocation of draft.skillAllocations) await saveAllocation(allocation.draftId);

    await tx.delete(campaignCharacterItem).where(eq(campaignCharacterItem.characterId, characterId));
    if (normalized.items.length) await tx.insert(campaignCharacterItem).values(normalized.items.map((entry) => ({ characterId, ...entry })));

    await tx.delete(campaignCharacterCurrencyHolding).where(eq(campaignCharacterCurrencyHolding.characterId, characterId));
    if (normalized.currencyHoldings.length) await tx.insert(campaignCharacterCurrencyHolding).values(normalized.currencyHoldings.map((entry) => ({ characterId, ...entry })));
  });

  revalidatePath("/realms");
  revalidatePath(`/realms/characters/${characterId}`);
  revalidatePath(`/heavens/characters/${characterId}`);
  return getCharacter(characterId, godMode);
}

export async function advanceCharacterSkill(
  characterId: number,
  skillId: number,
  parentAllocationId: number | null,
  pointsToAdd = 1,
): Promise<CharacterAggregate> {
  await requireCharacterAccess(characterId, false);
  const aggregate = await getCharacter(characterId, false);
  if (!aggregate.profile.creationCompletedAt) throw new Error("Character creation must be completed before Experience can be spent.");
  if (!Number.isInteger(pointsToAdd) || pointsToAdd <= 0) throw new Error("Skill advancement points must be a positive whole number.");
  if (aggregate.profile.experience < pointsToAdd) throw new Error("Not enough Experience is available.");

  const target = aggregate.skillCatalog.find(({ id }) => id === skillId);
  if (!target) throw new Error("Skill not found.");
  const racial = getRacialSkillGrant(aggregate.selectedRace, skillId);
  const existing = aggregate.skillAllocations.find((entry) => entry.skillId === skillId && entry.parentAllocationId === parentAllocationId);
  const currentPoints = existing?.points ?? 0;
  if (currentPoints + pointsToAdd > getCreationPurchasedSkillMaximum(target, aggregate.campaign.maxPointsInSkill, aggregate.campaign.maxPointsInSkill, racial.minimum)) {
    throw new Error("This advancement would exceed the maximum points allowed in the Skill.");
  }

  if (parentAllocationId !== null) {
    const parent = aggregate.skillAllocations.find(({ id }) => id === parentAllocationId);
    if (!parent) throw new Error("Parent Skill allocation not found.");
    const relationship = aggregate.skillRelationships.some((edge) => edge.skillId === skillId && edge.relatedSkillId === parent.skillId && edge.relationshipType.toLowerCase() === "parent");
    if (!relationship) throw new Error("That Skill does not descend from the selected parent Skill.");
    const parentMeta = aggregate.skillCatalog.find(({ id }) => id === parent.skillId);
    if (!parentMeta) throw new Error("Parent Skill not found.");
    const threshold = getSkillUnlockThreshold(parentMeta, aggregate.campaign.pointsToUnlockNextTier);
    if (!racial.granted && getEffectiveSkillPoints(parent.points, aggregate.selectedRace, parent.skillId) < threshold) {
      throw new Error(`The parent Skill needs ${threshold} points before this tier unlocks.`);
    }
  } else if (target.tier !== null && target.tier > 1) {
    throw new Error("Higher-tier Skills require a parent allocation.");
  }

  let root = target;
  if (parentAllocationId !== null) {
    let cursor = aggregate.skillAllocations.find(({ id }) => id === parentAllocationId) ?? null;
    while (cursor) {
      root = aggregate.skillCatalog.find(({ id }) => id === cursor!.skillId) ?? root;
      cursor = cursor.parentAllocationId === null ? null : aggregate.skillAllocations.find(({ id }) => id === cursor!.parentAllocationId) ?? null;
    }
  }
  if (!isSkillAllowedByCampaign(target, root, aggregate.campaign.allowedSystems, racial.granted)) {
    throw new Error("That Skill is not allowed by this Campaign.");
  }

  await db.transaction(async (tx) => {
    if (existing) {
      await tx.update(campaignCharacterSkillAllocation).set({ points: currentPoints + pointsToAdd, updatedAt: new Date() }).where(eq(campaignCharacterSkillAllocation.id, existing.id));
    } else {
      await tx.insert(campaignCharacterSkillAllocation).values({ characterId, skillId, parentAllocationId, points: pointsToAdd });
    }
    await tx.update(campaignCharacterProfile).set({ experience: aggregate.profile.experience - pointsToAdd, updatedAt: new Date() }).where(eq(campaignCharacterProfile.characterId, characterId));
  });

  revalidatePath(`/realms/characters/${characterId}/advance`);
  return getCharacter(characterId, false);
}

export async function spendCharacterQuintessence(
  characterId: number,
  purchaseType: CharacterQuintessencePurchaseType,
  quantity: number,
  attributeKey: CharacterAttributeKey | null = null,
): Promise<CharacterAggregate> {
  await requireCharacterAccess(characterId, false);
  const aggregate = await getCharacter(characterId, false);
  if (!aggregate.profile.creationCompletedAt) throw new Error("Character creation must be completed before Quintessence can be spent.");
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Purchase quantity must be a positive whole number.");
  if (purchaseType === "attribute" && (!attributeKey || !CHARACTER_ATTRIBUTE_KEYS.includes(attributeKey))) throw new Error("Attribute advancement requires one core Attribute.");
  const cost = getQuintessenceCost(purchaseType, quantity);
  if (aggregate.profile.quintessence < cost) throw new Error(`This purchase costs ${cost} Quintessence, but only ${aggregate.profile.quintessence} is available.`);

  await db.transaction(async (tx) => {
    if (purchaseType === "attribute") {
      const [current] = await tx.select({ value: campaignCharacterAttribute.value }).from(campaignCharacterAttribute).where(and(eq(campaignCharacterAttribute.characterId, characterId), eq(campaignCharacterAttribute.attributeKey, attributeKey!))).limit(1);
      const cap = getRaceCap(aggregate.selectedRace, attributeKey!);
      const nextValue = (current?.value ?? 0) + quantity;
      if (cap !== null && nextValue > cap) throw new Error(`That Attribute cannot exceed the Race cap of ${cap}.`);
      await tx.update(campaignCharacterAttribute).set({ value: nextValue }).where(and(eq(campaignCharacterAttribute.characterId, characterId), eq(campaignCharacterAttribute.attributeKey, attributeKey!)));
    }
    const profileUpdate: Record<string, number | Date> = { quintessence: aggregate.profile.quintessence - cost, updatedAt: new Date() };
    if (purchaseType === "fatePoints") profileUpdate.fatePoints = (aggregate.profile.fatePoints ?? 0) + quantity;
    if (purchaseType === "experience") {
      const gained = getExperienceFromQuintessence(quantity);
      profileUpdate.experience = aggregate.profile.experience + gained;
      profileUpdate.totalExperience = aggregate.profile.totalExperience + gained;
    }
    await tx.update(campaignCharacterProfile).set(profileUpdate).where(eq(campaignCharacterProfile.characterId, characterId));
  });

  revalidatePath(`/realms/characters/${characterId}/advance`);
  return getCharacter(characterId, false);
}

function getRaceCap(raceAggregate: CharacterRaceAggregate | null, attributeKey: CharacterAttributeKey) {
  const names: Record<CharacterAttributeKey, string> = { STR: "Strength", DEX: "Dexterity", CON: "Constitution", INT: "Intelligence", WIS: "Wisdom", CHR: "Charisma" };
  return raceAggregate?.attributeCaps.find((cap) => cap.attributeKey.toUpperCase() === attributeKey || cap.attributeKey.toLowerCase() === names[attributeKey].toLowerCase())?.maxValue ?? null;
}
