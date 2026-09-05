"use server";

import {
  and,
  asc,
  count,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { creature } from "@/db/creature-schema";
import {
  armorLocation,
  armorLocationReference,
  armorProfile,
  EQUIPMENT_GROUPS,
  item,
  itemArmorDamageModifier,
  itemEffect,
  itemPassiveEffect,
  itemProperty,
  itemRuntimeProfile,
  itemTagCatalog,
  itemTagLink,
  weaponFiringMode,
  weaponProfile,
  weaponSkillPathMapping,
  type EquipmentCatalogGroup,
  type ItemCatalogScope,
} from "@/db/item-schema";
import { skill, skillRelationship } from "@/db/skill-schema";
import { campaignCharacterItemInstance } from "@/db/realm-schema";
import {
  copyPassiveItemEffects,
  validatePassiveItemEffect,
  type ItemPassiveEffectDefinition,
} from "@/features/items/equipment-state";
import {
  copyItemRuntimeDefinition,
  decodeItemEffects,
  DEFAULT_ITEM_RUNTIME_PROFILE,
  encodeItemEffects,
  validateItemRuntimeDefinition,
  validateItemRuntimeProfile,
  type ItemRuntimeProfile,
  type ItemUseMode,
} from "@/features/items/item-runtime";
import {
  copyFirearmFiringModes,
  normalizeFirearmFiringModes,
  normalizeFiringModeName,
  resolveFirearmFiringMode,
  type FirearmFiringModeDraft,
  type ResolvedFirearmFiringMode,
} from "@/features/items/firearm-timing";
import {
  validateCanonicalSkillPath,
  type CanonicalSkillPathValidation,
} from "@/features/items/weapon-skill-governance";
import {
  readWeaponSkillGovernance,
  saveWeaponSkillGovernance as saveWeaponSkillGovernanceService,
  type WeaponSkillGovernanceReadModel,
  type WeaponSkillPathMappingDraft,
} from "@/features/items/weapon-skill-governance-service";
import {
  decodeMechanicalEffect,
  encodeMechanicalEffect,
  type MechanicalEffect,
} from "@/features/mechanical-effects";
import { assertCanEditSharedLibraryRoot } from "@/features/authorization/shared-library-access";
import { requireGodOrAdminAccessContext } from "@/lib/server-access";

export type ItemLibraryFilters = {
  catalogScope: ItemCatalogScope;
  search?: string;
  equipmentGroup?: EquipmentCatalogGroup | "";
  recordType?: string;
  category?: string;
  tag?: string;
  page?: number;
  pageSize?: number;
  archived?: boolean;
};

export type ItemSummary = {
  id: number;
  canonicalId: string;
  name: string;
  catalogScope: string;
  equipmentGroup: string | null;
  recordType: string;
  family: string;
  category: string;
  isMagical: boolean;
  useMode: ItemUseMode;
  tags: string[];
  hasWeaponProfile: boolean;
  hasArmorProfile: boolean;
  archivedAt: string | null;
};

export type ItemLibraryResult = {
  items: ItemSummary[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type ItemFacets = {
  recordTypes: string[];
  categories: string[];
  tags: string[];
};

export type ItemAuthoringReferences = {
  tags: Array<{ name: string; tagGroup: string; description: string }>;
  armorBodyLocations: Array<{ key: string; label: string }>;
  skills: Array<{
    id: number;
    name: string;
    classification: string;
    tier: number | null;
    primaryAttribute: string | null;
    secondaryAttribute: string | null;
    canonicalPath: CanonicalSkillPathValidation;
  }>;
};

export type RelatedItemCandidate = {
  id: number;
  canonicalId: string;
  name: string;
  recordType: string;
  ammunitionCyclingInitiativeModifier: number;
  ammunitionRecoilResetInitiativeModifier: number;
};
export type RelatedCreatureCandidate = { canonicalId: string; name: string; family: string; creatureType: string };
export type ItemLineageSummary = {
  id: number;
  canonicalId: string;
  name: string;
  catalogScope: string;
  archivedAt: string | null;
};

export type ItemDraft = {
  id?: number;
  isMagical: boolean;
  runtimeProfile: ItemRuntimeProfile;
  effects: MechanicalEffect[];
  passiveEffects: ItemPassiveEffectDefinition[];
  core: {
    canonicalId: string;
    name: string;
    catalogScope: ItemCatalogScope;
    equipmentGroup: EquipmentCatalogGroup | null;
    recordType: string;
    family: string;
    category: string;
    subtype: string;
    description: string;
    weight: number | null;
    weightUnit: string;
    size: string;
    durability: number | null;
    credits: number | null;
    priceBasis: string;
    parentItemId: number | null;
    parentItemName: string | null;
    sourceSystem: string | null;
    sourceExternalId: string | null;
  };
  properties: Array<{
    propertyName: string;
    value: string;
    unit: string;
    quantity: number | null;
    relationKind: "none" | "item" | "creature";
    relatedItemId: number | null;
    relatedItemName: string | null;
    relatedCreatureCanonicalId: string | null;
    relatedCreatureName: string | null;
    notes: string;
    sortOrder: number;
  }>;
  weaponProfile: null | {
    profileRecordType: string;
    weaponType: string;
    handedness: string;
    damageSource: string;
    damage: string;
    initiativeCost: number | null;
    damageType: string;
    range: string;
    reach: string;
    ammunitionItemId: number | null;
    ammunitionItemName: string | null;
    compatibility: string;
    capacity: string;
    capacityRounds: number | null;
    readinessMode: "draw-is-ready" | "separate-ready-action" | null;
    drawInitiativeCost: number | null;
    readyInitiativeCost: number | null;
    reloadInitiativeCost: number | null;
    unloadInitiativeCost: number | null;
    firingModeChangeInitiativeCost: number | null;
    firingModes: FirearmFiringModeDraft[];
    resolvedFiringModes: ResolvedFirearmFiringMode[];
    rateOfFire: string;
    reloadInitiative: string;
    ammunitionCyclingInitiativeModifier: number;
    ammunitionRecoilResetInitiativeModifier: number;
    referencedAmmunition: null | {
      itemId: number;
      name: string;
      cyclingInitiativeModifier: number;
      recoilResetInitiativeModifier: number;
    };
    rulesText: string;
  };
  armorProfile: null | {
    armorType: string;
    coverage: string;
    baseSoak: number | null;
    damageModifiersSourceText: string;
    damageModifiers: Array<{ modifierText: string; damageType: string; modifier: string; notes: string; sortOrder: number }>;
    coveredBodyLocationKeys: string[];
    rulesText: string;
  };
  tags: string[];
  variants: ItemLineageSummary[];
};

export type ItemAggregate = ItemDraft & {
  id: number;
  createdByUserId: string | null;
  archivedAt: string | null;
  archiveReason: string;
  createdAt: string;
  updatedAt: string;
};

const clean = (value: string | null | undefined) => value?.trim() ?? "";
const optionalText = (value: string | null | undefined) => clean(value) || null;
function required(value: string | null | undefined, label: string) { const result = clean(value); if (!result) throw new Error(`${label} is required.`); return result; }
function nonNegative(value: number | null, label: string) { if (value === null) return null; if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be zero or greater, or left blank.`); return value; }
function positive(value: number | null, label: string) { if (value === null) return null; if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be greater than zero, or left blank.`); return value; }
function positiveInteger(value: number | null, label: string) { if (value === null) return null; if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a whole number greater than zero, or left blank.`); return value; }
function nonNegativeInteger(value: number | null, label: string) { if (value === null) return null; if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a whole number zero or greater, or left blank.`); return value; }
function wholeInteger(value: number, label: string) { if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a whole number.`); return value; }

function normalize(input: ItemDraft, allowUnreviewedNewModes = false) {
  const equipmentGroup = input.core.catalogScope === "equipment" ? input.core.equipmentGroup ?? "general" : null;
  if (input.core.catalogScope === "equipment" && !EQUIPMENT_GROUPS.includes(equipmentGroup as EquipmentCatalogGroup)) {
    throw new Error("Equipment Group must be Weapon, Armor, or General.");
  }
  if ((input.core.weight === null) !== (clean(input.core.weightUnit) === "")) throw new Error("Weight and Weight Unit must be provided together.");

  const runtimeValidation = validateItemRuntimeDefinition({
    isMagical: input.isMagical,
    runtimeProfile: input.runtimeProfile,
    effects: input.effects,
  });
  if (!runtimeValidation.valid) {
    throw new Error(runtimeValidation.issues.map(({ message }) => message).join(" "));
  }
  if (!Array.isArray(input.passiveEffects)) throw new Error("Item Passive Effects must be an ordered list.");
  if (input.core.catalogScope !== "equipment" && input.passiveEffects.length) {
    throw new Error("Only Equipment Items may define Passive Effects.");
  }
  const passiveEffects = input.passiveEffects.map((entry) => validatePassiveItemEffect(entry));
  const passiveIds = passiveEffects.flatMap(({ id }) => id === null ? [] : [id]);
  if (new Set(passiveIds).size !== passiveIds.length) throw new Error("Passive Effect identities cannot be duplicated.");

  const properties = input.properties.map((row, sortOrder) => {
    const relatedItemId = row.relationKind === "item" ? row.relatedItemId : null;
    const relatedCreatureCanonicalId = row.relationKind === "creature" ? optionalText(row.relatedCreatureCanonicalId) : null;
    if (relatedItemId && relatedCreatureCanonicalId) throw new Error(`Property ${sortOrder + 1} cannot link both an Item and a Creature.`);
    return {
      propertyName: required(row.propertyName, `Property ${sortOrder + 1} Name`),
      value: clean(row.value),
      unit: clean(row.unit),
      quantity: positive(row.quantity, `Property ${sortOrder + 1} Quantity`),
      relationKind: row.relationKind,
      relatedItemId,
      relatedItemName: relatedItemId ? optionalText(row.relatedItemName) : null,
      relatedCreatureCanonicalId,
      relatedCreatureName: relatedCreatureCanonicalId ? optionalText(row.relatedCreatureName) : null,
      notes: clean(row.notes),
      sortOrder,
    };
  });

  const weaponIsAmmunition = input.weaponProfile
    ? [input.weaponProfile.profileRecordType, input.core.recordType].some((value) => clean(value).toLocaleLowerCase("en-US") === "ammunition")
    : false;
  const weapon = input.weaponProfile ? {
    profileRecordType: clean(input.weaponProfile.profileRecordType) || clean(input.core.recordType),
    weaponType: clean(input.weaponProfile.weaponType),
    handedness: clean(input.weaponProfile.handedness),
    damageSource: clean(input.weaponProfile.damageSource),
    damage: clean(input.weaponProfile.damage),
    initiativeCost: positiveInteger(input.weaponProfile.initiativeCost, "Initiative Cost"),
    damageType: clean(input.weaponProfile.damageType),
    range: clean(input.weaponProfile.range),
    reach: clean(input.weaponProfile.reach),
    ammunitionItemId: input.weaponProfile.ammunitionItemId,
    ammunitionItemName: input.weaponProfile.ammunitionItemId ? optionalText(input.weaponProfile.ammunitionItemName) : null,
    compatibility: clean(input.weaponProfile.compatibility),
    capacity: clean(input.weaponProfile.capacity),
    capacityRounds: positiveInteger(input.weaponProfile.capacityRounds, "Structured firearm capacity"),
    readinessMode: input.weaponProfile.readinessMode === "draw-is-ready" || input.weaponProfile.readinessMode === "separate-ready-action"
      ? input.weaponProfile.readinessMode
      : null,
    drawInitiativeCost: nonNegativeInteger(input.weaponProfile.drawInitiativeCost, "Draw Initiative Cost"),
    readyInitiativeCost: nonNegativeInteger(input.weaponProfile.readyInitiativeCost, "Ready Initiative Cost"),
    reloadInitiativeCost: nonNegativeInteger(input.weaponProfile.reloadInitiativeCost, "Reload Initiative Cost"),
    unloadInitiativeCost: nonNegativeInteger(input.weaponProfile.unloadInitiativeCost, "Unload Initiative Cost"),
    firingModeChangeInitiativeCost: nonNegativeInteger(input.weaponProfile.firingModeChangeInitiativeCost, "Firing Mode Change Initiative Cost"),
    firingModes: normalizeFirearmFiringModes(input.weaponProfile.firingModes, { allowUnreviewedNewModes }),
    rateOfFire: clean(input.weaponProfile.rateOfFire),
    reloadInitiative: clean(input.weaponProfile.reloadInitiative),
    ammunitionCyclingInitiativeModifier: weaponIsAmmunition ? wholeInteger(input.weaponProfile.ammunitionCyclingInitiativeModifier, "Ammunition Cycling Initiative modifier") : 0,
    ammunitionRecoilResetInitiativeModifier: weaponIsAmmunition ? wholeInteger(input.weaponProfile.ammunitionRecoilResetInitiativeModifier, "Ammunition Recoil Reset Initiative modifier") : 0,
    rulesText: clean(input.weaponProfile.rulesText),
  } : null;

  const armor = input.armorProfile ? {
    armorType: clean(input.armorProfile.armorType),
    coverage: clean(input.armorProfile.coverage),
    baseSoak: nonNegative(input.armorProfile.baseSoak, "Base Soak"),
    damageModifiersSourceText: clean(input.armorProfile.damageModifiersSourceText),
    damageModifiers: input.armorProfile.damageModifiers.map((row, sortOrder) => ({
      modifierText: clean(row.modifierText),
      damageType: required(row.damageType, `Damage Modifier ${sortOrder + 1} Type`),
      modifier: required(row.modifier, `Damage Modifier ${sortOrder + 1} Value`),
      notes: clean(row.notes),
      sortOrder,
    })),
    coveredBodyLocationKeys: [...new Set(input.armorProfile.coveredBodyLocationKeys.map(clean).filter(Boolean))],
    rulesText: clean(input.armorProfile.rulesText),
  } : null;

  return {
    ...runtimeValidation.definition,
    passiveEffects,
    core: {
      canonicalId: input.id
        ? required(input.core.canonicalId, "Item ID").toLocaleUpperCase("en-US")
        : clean(input.core.canonicalId).toLocaleUpperCase("en-US"),
      name: required(input.core.name, "Item Name"),
      catalogScope: input.core.catalogScope,
      equipmentGroup,
      recordType: required(input.core.recordType, "Record Type"),
      family: required(input.core.family, "Family"),
      category: required(input.core.category, "Category"),
      subtype: clean(input.core.subtype),
      description: clean(input.core.description),
      weight: nonNegative(input.core.weight, "Weight"),
      weightUnit: clean(input.core.weightUnit),
      size: clean(input.core.size),
      durability: nonNegative(input.core.durability, "Durability"),
      credits: nonNegative(input.core.credits, "Credits"),
      priceBasis: required(input.core.priceBasis, "Price Basis"),
      parentItemId: input.core.parentItemId,
      sourceSystem: optionalText(input.core.sourceSystem),
      sourceExternalId: optionalText(input.core.sourceExternalId),
    },
    properties,
    weapon,
    armor,
    tags: [...new Set(input.tags.map(clean).filter(Boolean))],
  };
}

export async function listItems(filters: ItemLibraryFilters): Promise<ItemLibraryResult> {
  await requireGodOrAdminAccessContext();
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(filters.pageSize ?? 40)));
  const conditions: SQL[] = [
    eq(item.catalogScope, filters.catalogScope),
    filters.archived ? isNotNull(item.archivedAt) : isNull(item.archivedAt),
  ];
  const search = clean(filters.search);
  if (search) conditions.push(or(ilike(item.name, `%${search}%`), ilike(item.canonicalId, `%${search}%`))!);
  if (clean(filters.equipmentGroup)) conditions.push(eq(item.equipmentGroup, clean(filters.equipmentGroup)));
  if (clean(filters.recordType)) conditions.push(eq(item.recordType, clean(filters.recordType)));
  if (clean(filters.category)) conditions.push(eq(item.category, clean(filters.category)));
  if (clean(filters.tag)) {
    const matchingTags = await db.select({ itemId: itemTagLink.itemId }).from(itemTagLink).innerJoin(itemTagCatalog, eq(itemTagCatalog.id, itemTagLink.tagId)).where(eq(itemTagCatalog.name, clean(filters.tag)));
    const ids = matchingTags.map(({ itemId }) => itemId);
    if (!ids.length) return { items: [], total: 0, page, pageSize, pageCount: 1 };
    conditions.push(inArray(item.id, ids));
  }
  const where = and(...conditions);
  const [countRow] = await db.select({ value: count() }).from(item).where(where);
  const total = Number(countRow?.value ?? 0);
  const baseRows = await db.select({
    id: item.id, canonicalId: item.canonicalId, name: item.name, catalogScope: item.catalogScope,
    equipmentGroup: item.equipmentGroup, recordType: item.recordType, family: item.family, category: item.category,
    isMagical: item.isMagical, useMode: itemRuntimeProfile.useMode, archivedAt: item.archivedAt,
  }).from(item).leftJoin(itemRuntimeProfile, eq(itemRuntimeProfile.itemId, item.id)).where(where).orderBy(asc(item.name), asc(item.id)).limit(pageSize).offset((page - 1) * pageSize);
  const ids = baseRows.map(({ id }) => id);
  if (!ids.length) return { items: [], total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
  const [tagRows, weaponRows, armorRows] = await Promise.all([
    db.select({ itemId: itemTagLink.itemId, name: itemTagCatalog.name }).from(itemTagLink).innerJoin(itemTagCatalog, eq(itemTagCatalog.id, itemTagLink.tagId)).where(inArray(itemTagLink.itemId, ids)).orderBy(asc(itemTagCatalog.name)),
    db.select({ itemId: weaponProfile.itemId }).from(weaponProfile).where(inArray(weaponProfile.itemId, ids)),
    db.select({ itemId: armorProfile.itemId }).from(armorProfile).where(inArray(armorProfile.itemId, ids)),
  ]);
  const tags = new Map<number, string[]>();
  for (const row of tagRows) tags.set(row.itemId, [...(tags.get(row.itemId) ?? []), row.name]);
  const hasWeapon = new Set(weaponRows.map(({ itemId }) => itemId));
  const hasArmor = new Set(armorRows.map(({ itemId }) => itemId));
  return {
    items: baseRows.map((row) => ({
      ...row,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      useMode: (row.useMode ?? "none") as ItemUseMode,
      tags: tags.get(row.id) ?? [],
      hasWeaponProfile: hasWeapon.has(row.id),
      hasArmorProfile: hasArmor.has(row.id),
    })),
    total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function listItemFacets(
  catalogScope: ItemCatalogScope,
  archived = false,
): Promise<ItemFacets> {
  await requireGodOrAdminAccessContext();
  const where = and(
    eq(item.catalogScope, catalogScope),
    archived ? isNotNull(item.archivedAt) : isNull(item.archivedAt),
  );
  const [recordTypes, categories, tagRows] = await Promise.all([
    db.selectDistinct({ value: item.recordType }).from(item).where(where).orderBy(asc(item.recordType)),
    db.selectDistinct({ value: item.category }).from(item).where(where).orderBy(asc(item.category)),
    db.selectDistinct({ value: itemTagCatalog.name }).from(itemTagCatalog).innerJoin(itemTagLink, eq(itemTagLink.tagId, itemTagCatalog.id)).innerJoin(item, eq(item.id, itemTagLink.itemId)).where(where).orderBy(asc(itemTagCatalog.name)),
  ]);
  return {
    recordTypes: recordTypes.map(({ value }) => value.trim()).filter(Boolean),
    categories: categories.map(({ value }) => value.trim()).filter(Boolean),
    tags: tagRows.map(({ value }) => value.trim()).filter(Boolean),
  };
}

export async function listItemAuthoringReferences(
  forItemId?: number,
): Promise<ItemAuthoringReferences> {
  await requireGodOrAdminAccessContext();
  const preservedSkillRows = forItemId
    ? await db
        .select({ id: weaponSkillPathMapping.endpointSkillId })
        .from(weaponSkillPathMapping)
        .innerJoin(weaponProfile, eq(weaponProfile.id, weaponSkillPathMapping.weaponProfileId))
        .where(eq(weaponProfile.itemId, forItemId))
    : [];
  const preservedSkillIds = new Set(preservedSkillRows.map(({ id }) => id));
  const [tags, locations, allSkills, relationships] = await Promise.all([
    db.select({ name: itemTagCatalog.name, tagGroup: itemTagCatalog.tagGroup, description: itemTagCatalog.description }).from(itemTagCatalog).orderBy(asc(itemTagCatalog.tagGroup), asc(itemTagCatalog.name)),
    db.select({ key: armorLocationReference.locationCode, label: armorLocationReference.locationName }).from(armorLocationReference).orderBy(asc(armorLocationReference.sortOrder)),
    db.select({
      id: skill.id,
      name: skill.name,
      classification: skill.classification,
      tier: skill.tier,
      primaryAttribute: skill.primaryAttribute,
      secondaryAttribute: skill.secondaryAttribute,
      archivedAt: skill.archivedAt,
    }).from(skill).orderBy(asc(skill.name), asc(skill.id)),
    db.select({
      id: skillRelationship.id,
      skillId: skillRelationship.skillId,
      relatedSkillId: skillRelationship.relatedSkillId,
      relationshipType: skillRelationship.relationshipType,
      sortOrder: skillRelationship.sortOrder,
    }).from(skillRelationship).orderBy(asc(skillRelationship.id)),
  ]);
  return {
    tags,
    armorBodyLocations: locations,
    skills: allSkills
      .filter((candidate) => candidate.archivedAt === null || preservedSkillIds.has(candidate.id))
      .map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        classification: candidate.classification,
        tier: candidate.tier,
        primaryAttribute: candidate.primaryAttribute,
        secondaryAttribute: candidate.secondaryAttribute,
        canonicalPath: validateCanonicalSkillPath(candidate.id, allSkills, relationships),
      })),
  };
}

export async function getWeaponSkillGovernance(itemId: number): Promise<WeaponSkillGovernanceReadModel | null> {
  await requireGodOrAdminAccessContext();
  return readWeaponSkillGovernance(itemId);
}

export async function saveCanonicalWeaponSkillGovernance(
  itemId: number,
  mappings: readonly WeaponSkillPathMappingDraft[],
): Promise<WeaponSkillGovernanceReadModel> {
  const { session, roles } = await requireGodOrAdminAccessContext();
  const [stored] = await db
    .select({
      createdByUserId: item.createdByUserId,
      sourceSystem: item.sourceSystem,
      archivedAt: item.archivedAt,
    })
    .from(item)
    .where(eq(item.id, itemId))
    .limit(1);
  if (!stored) throw new Error("That Item no longer exists.");
  assertCanEditSharedLibraryRoot(
    { userId: session.user.id, roles },
    stored,
    "Item",
  );
  if (stored.archivedAt) throw new Error("Restore this Item before editing its Governing Skill Paths.");
  const storedMappings = await db
    .select({ endpointSkillId: weaponSkillPathMapping.endpointSkillId })
    .from(weaponSkillPathMapping)
    .innerJoin(weaponProfile, eq(weaponProfile.id, weaponSkillPathMapping.weaponProfileId))
    .where(eq(weaponProfile.itemId, itemId));
  const storedSkillIds = new Set(storedMappings.map(({ endpointSkillId }) => endpointSkillId));
  const submittedSkillIds = [...new Set(mappings.map(({ endpointSkillId }) => endpointSkillId))];
  if (submittedSkillIds.length) {
    const referencedSkills = await db
      .select({ id: skill.id, archivedAt: skill.archivedAt })
      .from(skill)
      .where(inArray(skill.id, submittedSkillIds));
    if (referencedSkills.length !== submittedSkillIds.length) {
      throw new Error("One or more Governing Skill endpoints no longer exist.");
    }
    if (referencedSkills.some((entry) => entry.archivedAt && !storedSkillIds.has(entry.id))) {
      throw new Error("Archived Skills cannot be added as Governing Skill endpoints. Restore the Skill first.");
    }
  }
  const saved = await saveWeaponSkillGovernanceService({
    userId: session.user.id,
    canAuthorMasterContent: true,
  }, itemId, mappings);
  revalidatePath("/heavens/equipment");
  revalidatePath("/heavens/inventory");
  return saved;
}

export async function getItem(id: number): Promise<ItemAggregate | null> {
  await requireGodOrAdminAccessContext();
  const [row] = await db.select().from(item).where(eq(item.id, id)).limit(1);
  if (!row) return null;
  let parentItemName: string | null = null;
  if (row.parentItemId) {
    const [parent] = await db.select({ name: item.name }).from(item).where(eq(item.id, row.parentItemId)).limit(1);
    parentItemName = parent?.name ?? null;
  }
  const [properties, weaponRows, firingModeRows, armorRows, modifiers, locations, tags, variants, runtimeRows, effectRows, passiveEffectRows] = await Promise.all([
    db.select().from(itemProperty).where(eq(itemProperty.itemId, id)).orderBy(asc(itemProperty.sortOrder), asc(itemProperty.id)),
    db.select().from(weaponProfile).where(eq(weaponProfile.itemId, id)).limit(1),
    db.select({
      id: weaponFiringMode.id,
      name: weaponFiringMode.name,
      sortOrder: weaponFiringMode.sortOrder,
      baseCyclingInitiativeCost: weaponFiringMode.baseCyclingInitiativeCost,
      baseRecoilResetInitiativeCost: weaponFiringMode.baseRecoilResetInitiativeCost,
      deliveryCadence: weaponFiringMode.deliveryCadence,
      roundsPerCadence: weaponFiringMode.roundsPerCadence,
      mechanicsReviewRequired: weaponFiringMode.mechanicsReviewRequired,
    }).from(weaponFiringMode)
      .innerJoin(weaponProfile, eq(weaponProfile.id, weaponFiringMode.weaponProfileId))
      .where(eq(weaponProfile.itemId, id))
      .orderBy(asc(weaponFiringMode.sortOrder), asc(weaponFiringMode.id)),
    db.select().from(armorProfile).where(eq(armorProfile.itemId, id)).limit(1),
    db.select().from(itemArmorDamageModifier).where(eq(itemArmorDamageModifier.itemId, id)).orderBy(asc(itemArmorDamageModifier.sortOrder), asc(itemArmorDamageModifier.id)),
    db.select({ key: armorLocation.locationCode }).from(armorLocation).where(eq(armorLocation.itemId, id)).orderBy(asc(armorLocation.sortOrder)),
    db.select({ name: itemTagCatalog.name }).from(itemTagLink).innerJoin(itemTagCatalog, eq(itemTagCatalog.id, itemTagLink.tagId)).where(eq(itemTagLink.itemId, id)).orderBy(asc(itemTagCatalog.name)),
    db.select({ id: item.id, canonicalId: item.canonicalId, name: item.name, catalogScope: item.catalogScope, archivedAt: item.archivedAt }).from(item).where(eq(item.parentItemId, id)).orderBy(asc(item.name), asc(item.id)),
    db.select().from(itemRuntimeProfile).where(eq(itemRuntimeProfile.itemId, id)).limit(1),
    db.select({
      schemaVersion: itemEffect.schemaVersion,
      effectJson: itemEffect.effectJson,
      sortOrder: itemEffect.sortOrder,
    }).from(itemEffect).where(eq(itemEffect.itemId, id)).orderBy(asc(itemEffect.sortOrder), asc(itemEffect.id)),
    db.select({
      id: itemPassiveEffect.id,
      requiredEquipmentState: itemPassiveEffect.requiredEquipmentState,
      schemaVersion: itemPassiveEffect.schemaVersion,
      effectJson: itemPassiveEffect.effectJson,
      sortOrder: itemPassiveEffect.sortOrder,
    }).from(itemPassiveEffect).where(eq(itemPassiveEffect.itemId, id)).orderBy(asc(itemPassiveEffect.sortOrder), asc(itemPassiveEffect.id)),
  ]);
  const relatedItemIds = properties.map(({ relatedItemId }) => relatedItemId).filter((value): value is number => value !== null);
  const relatedCreatureIds = properties.map(({ relatedCreatureCanonicalId }) => relatedCreatureCanonicalId).filter((value): value is string => value !== null);
  const [relatedItems, relatedCreatures] = await Promise.all([
    relatedItemIds.length ? db.select({ id: item.id, name: item.name }).from(item).where(inArray(item.id, relatedItemIds)) : [],
    relatedCreatureIds.length ? db.select({ canonicalId: creature.canonicalId, name: creature.canonicalName }).from(creature).where(inArray(creature.canonicalId, relatedCreatureIds)) : [],
  ]);
  const itemNames = new Map(relatedItems.map((candidate) => [candidate.id, candidate.name]));
  const creatureNames = new Map(relatedCreatures.map((candidate) => [candidate.canonicalId, candidate.name]));
  const weapon = weaponRows[0];
  const armor = armorRows[0];
  let ammunitionItemName: string | null = null;
  let referencedAmmunition: NonNullable<ItemDraft["weaponProfile"]>["referencedAmmunition"] = null;
  if (weapon?.ammunitionItemId) {
    const [ammo] = await db.select({
      name: item.name,
      cyclingInitiativeModifier: weaponProfile.ammunitionCyclingInitiativeModifier,
      recoilResetInitiativeModifier: weaponProfile.ammunitionRecoilResetInitiativeModifier,
    }).from(item)
      .leftJoin(weaponProfile, eq(weaponProfile.itemId, item.id))
      .where(eq(item.id, weapon.ammunitionItemId))
      .limit(1);
    ammunitionItemName = ammo?.name ?? null;
    referencedAmmunition = ammo ? {
      itemId: weapon.ammunitionItemId,
      name: ammo.name,
      cyclingInitiativeModifier: ammo.cyclingInitiativeModifier ?? 0,
      recoilResetInitiativeModifier: ammo.recoilResetInitiativeModifier ?? 0,
    } : null;
  }
  const runtimeValidation = validateItemRuntimeProfile(
    runtimeRows[0] ?? DEFAULT_ITEM_RUNTIME_PROFILE,
  );
  if (!runtimeValidation.valid) {
    throw new Error(`Item ${row.canonicalId} has an invalid runtime profile: ${runtimeValidation.issues.map(({ message }) => message).join(" ")}`);
  }
  const effects = decodeItemEffects(effectRows);
  const passiveEffects = passiveEffectRows.map((entry) => validatePassiveItemEffect({
    id: entry.id,
    requiredEquipmentState: entry.requiredEquipmentState as ItemPassiveEffectDefinition["requiredEquipmentState"],
    effect: decodeMechanicalEffect({ schemaVersion: entry.schemaVersion, effectJson: entry.effectJson }),
  }));
  return {
    id: row.id,
    createdByUserId: row.createdByUserId,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    archiveReason: row.archiveReason,
    isMagical: row.isMagical,
    runtimeProfile: runtimeValidation.profile,
    effects,
    passiveEffects,
    core: {
      canonicalId: row.canonicalId, name: row.name, catalogScope: row.catalogScope as ItemCatalogScope,
      equipmentGroup: row.equipmentGroup as EquipmentCatalogGroup | null, recordType: row.recordType, family: row.family,
      category: row.category, subtype: row.subtype, description: row.description, weight: row.weight, weightUnit: row.weightUnit,
      size: row.size, durability: row.durability, credits: row.credits, priceBasis: row.priceBasis,
      parentItemId: row.parentItemId, parentItemName, sourceSystem: row.sourceSystem, sourceExternalId: row.sourceExternalId,
    },
    properties: properties.map((property) => ({
      propertyName: property.propertyName, value: property.value, unit: property.unit, quantity: property.quantity,
      relationKind: property.relatedItemId ? "item" : property.relatedCreatureCanonicalId ? "creature" : "none",
      relatedItemId: property.relatedItemId, relatedItemName: property.relatedItemId ? itemNames.get(property.relatedItemId) ?? null : null,
      relatedCreatureCanonicalId: property.relatedCreatureCanonicalId,
      relatedCreatureName: property.relatedCreatureCanonicalId ? creatureNames.get(property.relatedCreatureCanonicalId) ?? null : null,
      notes: property.notes, sortOrder: property.sortOrder,
    })),
    weaponProfile: weapon ? {
      profileRecordType: weapon.profileRecordType, weaponType: weapon.weaponType, handedness: weapon.handedness,
      damageSource: weapon.damageSource, damage: weapon.damage, initiativeCost: weapon.initiativeCost,
      damageType: weapon.damageType, range: weapon.rangeText,
      reach: weapon.reachText, ammunitionItemId: weapon.ammunitionItemId, ammunitionItemName,
      compatibility: weapon.compatibility, capacity: weapon.capacity,
      capacityRounds: weapon.capacityRounds,
      readinessMode: weapon.readinessMode as NonNullable<ItemDraft["weaponProfile"]>["readinessMode"],
      drawInitiativeCost: weapon.drawInitiativeCost,
      readyInitiativeCost: weapon.readyInitiativeCost,
      reloadInitiativeCost: weapon.reloadInitiativeCost,
      unloadInitiativeCost: weapon.unloadInitiativeCost,
      firingModeChangeInitiativeCost: weapon.firingModeChangeInitiativeCost,
      firingModes: firingModeRows.map((mode) => ({
        ...mode,
        deliveryCadence: mode.deliveryCadence as FirearmFiringModeDraft["deliveryCadence"],
      })),
      resolvedFiringModes: firingModeRows.map((mode) => resolveFirearmFiringMode(
        { ...mode, deliveryCadence: mode.deliveryCadence as FirearmFiringModeDraft["deliveryCadence"] },
        referencedAmmunition?.cyclingInitiativeModifier ?? 0,
        referencedAmmunition?.recoilResetInitiativeModifier ?? 0,
      )),
      rateOfFire: weapon.rateOfFire, reloadInitiative: weapon.reloadInitiative,
      ammunitionCyclingInitiativeModifier: weapon.ammunitionCyclingInitiativeModifier,
      ammunitionRecoilResetInitiativeModifier: weapon.ammunitionRecoilResetInitiativeModifier,
      referencedAmmunition,
      rulesText: weapon.rulesText,
    } : null,
    armorProfile: armor ? {
      armorType: armor.armorType, coverage: armor.coverage, baseSoak: armor.baseSoak,
      damageModifiersSourceText: armor.damageModifiersSourceText,
      damageModifiers: modifiers.map(({ modifierText, damageType, modifier, notes, sortOrder }) => ({ modifierText, damageType, modifier, notes, sortOrder })),
      coveredBodyLocationKeys: locations.map(({ key }) => key), rulesText: armor.rulesText,
    } : null,
    tags: tags.map(({ name }) => name),
    variants: variants.map((entry) => ({
      ...entry,
      archivedAt: entry.archivedAt?.toISOString() ?? null,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function findRelatedItems(search: string, excludeItemId?: number): Promise<RelatedItemCandidate[]> {
  await requireGodOrAdminAccessContext();
  const conditions: SQL[] = [isNull(item.archivedAt)];
  if (excludeItemId) conditions.push(ne(item.id, excludeItemId));
  const needle = clean(search);
  if (needle) conditions.push(or(ilike(item.name, `%${needle}%`), ilike(item.canonicalId, `%${needle}%`))!);
  const rows = await db.select({
    id: item.id,
    canonicalId: item.canonicalId,
    name: item.name,
    recordType: item.recordType,
    ammunitionCyclingInitiativeModifier: weaponProfile.ammunitionCyclingInitiativeModifier,
    ammunitionRecoilResetInitiativeModifier: weaponProfile.ammunitionRecoilResetInitiativeModifier,
  }).from(item)
    .leftJoin(weaponProfile, eq(weaponProfile.itemId, item.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(item.name), asc(item.id))
    .limit(20);
  return rows.map((candidate) => ({
    ...candidate,
    ammunitionCyclingInitiativeModifier: candidate.ammunitionCyclingInitiativeModifier ?? 0,
    ammunitionRecoilResetInitiativeModifier: candidate.ammunitionRecoilResetInitiativeModifier ?? 0,
  }));
}

export async function findRelatedCreatures(search: string): Promise<RelatedCreatureCandidate[]> {
  await requireGodOrAdminAccessContext();
  const needle = clean(search);
  const conditions: SQL[] = [isNull(creature.archivedAt)];
  if (needle) {
    conditions.push(or(
      ilike(creature.canonicalName, `%${needle}%`),
      ilike(creature.canonicalId, `%${needle}%`),
    )!);
  }
  return db.select({ canonicalId: creature.canonicalId, name: creature.canonicalName, family: creature.family, creatureType: creature.creatureType }).from(creature).where(and(...conditions)).orderBy(asc(creature.canonicalName), asc(creature.id)).limit(20);
}

async function saveItemDefinition(input: ItemDraft, allowUnreviewedNewModes: boolean): Promise<ItemAggregate> {
  const { session, roles } = await requireGodOrAdminAccessContext();
  const normalized = normalize(input, allowUnreviewedNewModes);
  const savedId = await db.transaction(async (tx) => {
    let id = input.id;
    if (id === undefined) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('serrian-tide:item-canonical-id'))`);
      const canonicalRows = await tx
        .select({ canonicalId: item.canonicalId })
        .from(item)
        .where(sql`${item.canonicalId} ~ '^ITEM-[0-9]+$'`);
      let largestSequence = 0;
      for (const row of canonicalRows) {
        const sequence = Number(row.canonicalId.slice(5));
        if (Number.isSafeInteger(sequence)) largestSequence = Math.max(largestSequence, sequence);
      }
      if (largestSequence >= Number.MAX_SAFE_INTEGER) {
        throw new Error("No available canonical Item ID remains.");
      }
      const canonicalId = `ITEM-${String(largestSequence + 1).padStart(4, "0")}`;
      const [created] = await tx.insert(item).values({
        ...normalized.core,
        isMagical: normalized.isMagical,
        canonicalId,
        createdByUserId: session.user.id,
        sourceSystem: null,
        sourceExternalId: null,
      }).returning({ id: item.id });
      id = created.id;
    } else {
      const [stored] = await tx
        .select({
          canonicalId: item.canonicalId,
          parentItemId: item.parentItemId,
          createdByUserId: item.createdByUserId,
          sourceSystem: item.sourceSystem,
          sourceExternalId: item.sourceExternalId,
          archivedAt: item.archivedAt,
        })
        .from(item)
        .where(eq(item.id, id))
        .limit(1);
      if (!stored) throw new Error("That Item no longer exists.");
      assertCanEditSharedLibraryRoot(
        { userId: session.user.id, roles },
        stored,
        "Item",
      );
      if (stored.archivedAt) throw new Error("Restore this Item before editing it.");
      if (stored.canonicalId !== normalized.core.canonicalId) {
        throw new Error("Canonical Item IDs are generated by the system and cannot be changed.");
      }
      if (stored.parentItemId !== normalized.core.parentItemId) {
        throw new Error("Item lineage cannot be changed after creation.");
      }
      if (
        stored.sourceSystem !== normalized.core.sourceSystem ||
        stored.sourceExternalId !== normalized.core.sourceExternalId
      ) {
        throw new Error("Canonical Item source identity cannot be changed.");
      }
      if (normalized.runtimeProfile.useMode !== "charges") {
        const [storedRuntime, ownedInstances] = await Promise.all([
          tx.select({ useMode: itemRuntimeProfile.useMode }).from(itemRuntimeProfile).where(eq(itemRuntimeProfile.itemId, id)).limit(1),
          tx.select({ value: count() }).from(campaignCharacterItemInstance).where(eq(campaignCharacterItemInstance.itemId, id)),
        ]);
        if (storedRuntime[0]?.useMode === "charges" && Number(ownedInstances[0]?.value ?? 0) > 0) {
          throw new Error("This charged Item has owned instances. Resolve those stable copies before changing its runtime mode; no automatic stack conversion or data deletion is allowed.");
        }
      }
      const updated = await tx.update(item).set({
        ...normalized.core,
        isMagical: normalized.isMagical,
        updatedAt: new Date(),
      }).where(eq(item.id, id)).returning({ id: item.id });
      if (!updated.length) throw new Error("That Item no longer exists.");
    }

    const [storedPropertyReferences, storedWeaponReferences] = input.id === undefined
      ? [[], []]
      : await Promise.all([
          tx
            .select({
              relatedItemId: itemProperty.relatedItemId,
              relatedCreatureCanonicalId: itemProperty.relatedCreatureCanonicalId,
            })
            .from(itemProperty)
            .where(eq(itemProperty.itemId, id!)),
          tx
            .select({ ammunitionItemId: weaponProfile.ammunitionItemId })
            .from(weaponProfile)
            .where(eq(weaponProfile.itemId, id!)),
        ]);
    const storedRelatedItemIds = new Set([
      ...storedPropertyReferences.flatMap(({ relatedItemId }) => relatedItemId === null ? [] : [relatedItemId]),
      ...storedWeaponReferences.flatMap(({ ammunitionItemId }) => ammunitionItemId === null ? [] : [ammunitionItemId]),
    ]);
    const submittedRelatedItemIds = [...new Set([
      ...normalized.properties.flatMap(({ relatedItemId }) => relatedItemId === null ? [] : [relatedItemId]),
      ...(normalized.weapon?.ammunitionItemId === null || normalized.weapon?.ammunitionItemId === undefined
        ? []
        : [normalized.weapon.ammunitionItemId]),
    ])];
    if (submittedRelatedItemIds.length) {
      const referencedItems = await tx
        .select({ id: item.id, archivedAt: item.archivedAt })
        .from(item)
        .where(inArray(item.id, submittedRelatedItemIds));
      if (referencedItems.length !== submittedRelatedItemIds.length) {
        throw new Error("One or more related Items no longer exist.");
      }
      if (referencedItems.some((entry) => entry.archivedAt && !storedRelatedItemIds.has(entry.id))) {
        throw new Error("Archived Items cannot be added as Item or ammunition references. Restore the Item first.");
      }
    }
    const storedRelatedCreatureIds = new Set(storedPropertyReferences.flatMap(
      ({ relatedCreatureCanonicalId }) => relatedCreatureCanonicalId === null ? [] : [relatedCreatureCanonicalId],
    ));
    const submittedRelatedCreatureIds = [...new Set(normalized.properties.flatMap(
      ({ relatedCreatureCanonicalId }) => relatedCreatureCanonicalId === null ? [] : [relatedCreatureCanonicalId],
    ))];
    if (submittedRelatedCreatureIds.length) {
      const referencedCreatures = await tx
        .select({ canonicalId: creature.canonicalId, archivedAt: creature.archivedAt })
        .from(creature)
        .where(inArray(creature.canonicalId, submittedRelatedCreatureIds));
      if (referencedCreatures.length !== submittedRelatedCreatureIds.length) {
        throw new Error("One or more related Creatures no longer exist.");
      }
      if (referencedCreatures.some(
        (entry) => entry.archivedAt && !storedRelatedCreatureIds.has(entry.canonicalId),
      )) {
        throw new Error("Archived Creatures cannot be added as Item references. Restore the Creature first.");
      }
    }

    await tx.delete(itemTagLink).where(eq(itemTagLink.itemId, id));
    await tx.delete(itemArmorDamageModifier).where(eq(itemArmorDamageModifier.itemId, id));
    await tx.delete(armorLocation).where(eq(armorLocation.itemId, id));
    await tx.delete(itemProperty).where(eq(itemProperty.itemId, id));
    if (!normalized.weapon) {
      const governedPaths = await tx.select({ id: weaponSkillPathMapping.id })
        .from(weaponSkillPathMapping)
        .innerJoin(weaponProfile, eq(weaponProfile.id, weaponSkillPathMapping.weaponProfileId))
        .where(eq(weaponProfile.itemId, id!))
        .limit(1);
      if (governedPaths.length) {
        throw new Error("Remove this Weapon Profile's Governing Skill Paths before removing the profile.");
      }
      await tx.delete(weaponProfile).where(eq(weaponProfile.itemId, id));
    }
    await tx.delete(armorProfile).where(eq(armorProfile.itemId, id));
    await tx.delete(itemEffect).where(eq(itemEffect.itemId, id));
    await tx.delete(itemRuntimeProfile).where(eq(itemRuntimeProfile.itemId, id));

    await tx.insert(itemRuntimeProfile).values({
      itemId: id!,
      ...normalized.runtimeProfile,
    });
    const encodedEffects = encodeItemEffects(normalized.effects);
    if (encodedEffects.length) {
      await tx.insert(itemEffect).values(encodedEffects.map((effect) => ({
        itemId: id!,
        ...effect,
      })));
    }
    const storedPassiveRows = await tx.select({ id: itemPassiveEffect.id }).from(itemPassiveEffect).where(eq(itemPassiveEffect.itemId, id!));
    const storedPassiveIds = new Set(storedPassiveRows.map(({ id: passiveId }) => passiveId));
    const submittedPassiveIds = new Set(normalized.passiveEffects.flatMap(({ id: passiveId }) => passiveId === null ? [] : [passiveId]));
    if ([...submittedPassiveIds].some((passiveId) => !storedPassiveIds.has(passiveId))) {
      throw new Error("One or more Passive Effect identities do not belong to this Item.");
    }
    const removedPassiveIds = [...storedPassiveIds].filter((passiveId) => !submittedPassiveIds.has(passiveId));
    if (removedPassiveIds.length) {
      await tx.delete(itemPassiveEffect).where(and(eq(itemPassiveEffect.itemId, id!), inArray(itemPassiveEffect.id, removedPassiveIds)));
    }
    for (const [sortOrder, passive] of normalized.passiveEffects.entries()) {
      const encoded = encodeMechanicalEffect(passive.effect);
      if (passive.id === null) {
        await tx.insert(itemPassiveEffect).values({
          itemId: id!,
          requiredEquipmentState: passive.requiredEquipmentState,
          ...encoded,
          sortOrder,
        });
      } else {
        const updated = await tx.update(itemPassiveEffect).set({
          requiredEquipmentState: passive.requiredEquipmentState,
          ...encoded,
          sortOrder,
          updatedAt: new Date(),
        }).where(and(eq(itemPassiveEffect.id, passive.id), eq(itemPassiveEffect.itemId, id!))).returning({ id: itemPassiveEffect.id });
        if (!updated.length) throw new Error("Passive Effect changed before the Item could be saved.");
      }
    }

    if (normalized.properties.length) {
      await tx.insert(itemProperty).values(normalized.properties.map((property) => ({
        itemId: id!,
        propertyName: property.propertyName,
        value: property.value,
        unit: property.unit,
        quantity: property.quantity,
        relatedItemId: property.relatedItemId,
        relatedCreatureCanonicalId: property.relatedCreatureCanonicalId,
        notes: property.notes,
        sortOrder: property.sortOrder,
      })));
    }
    if (normalized.weapon) {
      const [storedWeapon] = await tx.select({ id: weaponProfile.id }).from(weaponProfile).where(eq(weaponProfile.itemId, id!)).limit(1);
      const weaponValues = {
        profileRecordType: normalized.weapon.profileRecordType,
        weaponType: normalized.weapon.weaponType,
        handedness: normalized.weapon.handedness,
        damageSource: normalized.weapon.damageSource,
        damage: normalized.weapon.damage,
        initiativeCost: normalized.weapon.initiativeCost,
        damageType: normalized.weapon.damageType,
        rangeText: normalized.weapon.range,
        reachText: normalized.weapon.reach,
        ammunitionItemId: normalized.weapon.ammunitionItemId,
        compatibility: normalized.weapon.compatibility,
        capacity: normalized.weapon.capacity,
        capacityRounds: normalized.weapon.capacityRounds,
        readinessMode: normalized.weapon.readinessMode,
        drawInitiativeCost: normalized.weapon.drawInitiativeCost,
        readyInitiativeCost: normalized.weapon.readyInitiativeCost,
        reloadInitiativeCost: normalized.weapon.reloadInitiativeCost,
        unloadInitiativeCost: normalized.weapon.unloadInitiativeCost,
        firingModeChangeInitiativeCost: normalized.weapon.firingModeChangeInitiativeCost,
        fireModes: JSON.stringify(normalized.weapon.firingModes.map(({ name }) => name)),
        rateOfFire: normalized.weapon.rateOfFire,
        reloadInitiative: normalized.weapon.reloadInitiative,
        ammunitionCyclingInitiativeModifier: normalized.weapon.ammunitionCyclingInitiativeModifier,
        ammunitionRecoilResetInitiativeModifier: normalized.weapon.ammunitionRecoilResetInitiativeModifier,
        rulesText: normalized.weapon.rulesText,
      };
      const weaponProfileId = storedWeapon
        ? (await tx.update(weaponProfile).set({ ...weaponValues, updatedAt: new Date() }).where(eq(weaponProfile.id, storedWeapon.id)).returning({ id: weaponProfile.id }))[0]!.id
        : (await tx.insert(weaponProfile).values({ itemId: id!, ...weaponValues }).returning({ id: weaponProfile.id }))[0]!.id;
      const storedModes = storedWeapon
        ? await tx.select().from(weaponFiringMode).where(eq(weaponFiringMode.weaponProfileId, weaponProfileId))
        : [];
      const storedModesById = new Map(storedModes.map((mode) => [mode.id, mode]));
      const submittedModeIds = new Set(normalized.weapon.firingModes.flatMap(({ id: modeId }) => modeId === null ? [] : [modeId]));
      if ([...submittedModeIds].some((modeId) => !storedModesById.has(modeId))) {
        throw new Error("One or more Firing Mode identities do not belong to this Weapon Profile.");
      }
      for (const mode of normalized.weapon.firingModes) {
        if (!mode.mechanicsReviewRequired) continue;
        if (mode.id === null && allowUnreviewedNewModes) continue;
        const storedMode = mode.id === null ? null : storedModesById.get(mode.id);
        if (
          !storedMode
          || !storedMode.mechanicsReviewRequired
          || storedMode.name !== mode.name
          || storedMode.sortOrder !== mode.sortOrder
          || storedMode.baseCyclingInitiativeCost !== null
          || storedMode.baseRecoilResetInitiativeCost !== null
          || storedMode.deliveryCadence !== null
          || storedMode.roundsPerCadence !== null
        ) {
          throw new Error(`Firing Mode ${mode.name} was changed and now requires valid nonnegative cycling and recoil-reset costs.`);
        }
      }
      const removedModeIds = storedModes.map(({ id: modeId }) => modeId).filter((modeId) => !submittedModeIds.has(modeId));
      if (removedModeIds.length) {
        const governedModes = await tx.select({ id: weaponSkillPathMapping.id })
          .from(weaponSkillPathMapping)
          .where(inArray(weaponSkillPathMapping.firingModeId, removedModeIds))
          .limit(1);
        if (governedModes.length) {
          throw new Error("Remove a Firing Mode's Governing Skill Paths before removing that mode.");
        }
        await tx.delete(weaponFiringMode).where(inArray(weaponFiringMode.id, removedModeIds));
      }
      for (const mode of normalized.weapon.firingModes) {
        const values = {
          weaponProfileId,
          name: mode.name,
          normalizedName: normalizeFiringModeName(mode.name),
          sortOrder: mode.sortOrder,
          baseCyclingInitiativeCost: mode.baseCyclingInitiativeCost,
          baseRecoilResetInitiativeCost: mode.baseRecoilResetInitiativeCost,
          deliveryCadence: mode.deliveryCadence,
          roundsPerCadence: mode.roundsPerCadence,
          mechanicsReviewRequired: mode.mechanicsReviewRequired,
        };
        if (mode.id === null) {
          await tx.insert(weaponFiringMode).values(values);
        } else {
          const updated = await tx.update(weaponFiringMode).set({ ...values, updatedAt: new Date() })
            .where(and(eq(weaponFiringMode.id, mode.id), eq(weaponFiringMode.weaponProfileId, weaponProfileId)))
            .returning({ id: weaponFiringMode.id });
          if (!updated.length) throw new Error("A Firing Mode changed before the Item could be saved.");
        }
      }
    }
    if (normalized.armor) {
      await tx.insert(armorProfile).values({ itemId: id!, armorType: normalized.armor.armorType, coverage: normalized.armor.coverage, baseSoak: normalized.armor.baseSoak, damageModifiersSourceText: normalized.armor.damageModifiersSourceText, rulesText: normalized.armor.rulesText });
      if (normalized.armor.damageModifiers.length) await tx.insert(itemArmorDamageModifier).values(normalized.armor.damageModifiers.map((modifier) => ({ itemId: id!, ...modifier })));
      if (normalized.armor.coveredBodyLocationKeys.length) await tx.insert(armorLocation).values(normalized.armor.coveredBodyLocationKeys.map((locationCode, sortOrder) => ({ itemId: id!, locationCode, sortOrder })));
    }
    if (normalized.tags.length) {
      const tagRows = await tx.select({ id: itemTagCatalog.id, name: itemTagCatalog.name }).from(itemTagCatalog).where(inArray(itemTagCatalog.name, normalized.tags));
      if (tagRows.length !== normalized.tags.length) throw new Error("One or more selected Item tags no longer exist.");
      await tx.insert(itemTagLink).values(tagRows.map(({ id: tagId }) => ({ itemId: id!, tagId })));
    }
    return id;
  });

  revalidatePath("/heavens/equipment");
  revalidatePath("/heavens/inventory");
  const saved = await getItem(savedId);
  if (!saved) throw new Error("The saved Item could not be reloaded.");
  return saved;
}

export async function saveItem(input: ItemDraft): Promise<ItemAggregate> {
  return saveItemDefinition(input, false);
}

export async function createItemVariant(parentItemId: number, variantName: string): Promise<ItemAggregate> {
  const { session, roles } = await requireGodOrAdminAccessContext();
  const parent = await getItem(parentItemId);
  if (!parent) throw new Error("Parent Item not found.");
  assertCanEditSharedLibraryRoot(
    { userId: session.user.id, roles },
    {
      createdByUserId: parent.createdByUserId,
      sourceSystem: parent.core.sourceSystem,
    },
    "Item",
  );
  if (parent.archivedAt) throw new Error("Restore the parent Item before creating a Variant.");
  const name = required(variantName, "Variant Name");
  const runtimeDefinition = copyItemRuntimeDefinition(parent);
  const clone: ItemDraft = {
    ...parent,
    id: undefined,
    ...runtimeDefinition,
    passiveEffects: copyPassiveItemEffects(parent.passiveEffects),
    core: { ...parent.core, canonicalId: "", name, parentItemId, parentItemName: parent.core.name, sourceSystem: null, sourceExternalId: null },
    properties: parent.properties.map((row) => ({ ...row })),
    weaponProfile: parent.weaponProfile ? {
      ...parent.weaponProfile,
      firingModes: copyFirearmFiringModes(parent.weaponProfile.firingModes),
      resolvedFiringModes: [],
      referencedAmmunition: parent.weaponProfile.referencedAmmunition ? { ...parent.weaponProfile.referencedAmmunition } : null,
    } : null,
    armorProfile: parent.armorProfile ? { ...parent.armorProfile, damageModifiers: parent.armorProfile.damageModifiers.map((row) => ({ ...row })), coveredBodyLocationKeys: [...parent.armorProfile.coveredBodyLocationKeys] } : null,
    tags: [...parent.tags],
    variants: [],
  };
  return saveItemDefinition(clone, true);
}
