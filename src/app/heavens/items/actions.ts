"use server";

import {
  and,
  asc,
  count,
  eq,
  ilike,
  inArray,
  ne,
  or,
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
  itemProperty,
  itemTagCatalog,
  itemTagLink,
  weaponProfile,
  type EquipmentCatalogGroup,
  type ItemCatalogScope,
} from "@/db/item-schema";
import { requireGod } from "@/lib/server-access";

export type ItemLibraryFilters = {
  catalogScope: ItemCatalogScope;
  search?: string;
  equipmentGroup?: EquipmentCatalogGroup | "";
  recordType?: string;
  category?: string;
  tag?: string;
  page?: number;
  pageSize?: number;
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
  tags: string[];
  hasWeaponProfile: boolean;
  hasArmorProfile: boolean;
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
};

export type RelatedItemCandidate = { id: number; canonicalId: string; name: string; recordType: string };
export type RelatedCreatureCandidate = { canonicalId: string; name: string; family: string; creatureType: string };
export type ItemLineageSummary = { id: number; canonicalId: string; name: string; catalogScope: string };

export type ItemDraft = {
  id?: number;
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
    damageType: string;
    range: string;
    reach: string;
    ammunitionItemId: number | null;
    ammunitionItemName: string | null;
    compatibility: string;
    capacity: string;
    fireModes: string[];
    rateOfFire: string;
    reloadInitiative: string;
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

export type ItemAggregate = ItemDraft & { id: number; createdAt: string; updatedAt: string };

const clean = (value: string | null | undefined) => value?.trim() ?? "";
const optionalText = (value: string | null | undefined) => clean(value) || null;
function required(value: string | null | undefined, label: string) { const result = clean(value); if (!result) throw new Error(`${label} is required.`); return result; }
function nonNegative(value: number | null, label: string) { if (value === null) return null; if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be zero or greater, or left blank.`); return value; }
function positive(value: number | null, label: string) { if (value === null) return null; if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be greater than zero, or left blank.`); return value; }

function normalize(input: ItemDraft) {
  const equipmentGroup = input.core.catalogScope === "equipment" ? input.core.equipmentGroup ?? "general" : null;
  if (input.core.catalogScope === "equipment" && !EQUIPMENT_GROUPS.includes(equipmentGroup as EquipmentCatalogGroup)) {
    throw new Error("Equipment Group must be Weapon, Armor, or General.");
  }
  if ((input.core.weight === null) !== (clean(input.core.weightUnit) === "")) throw new Error("Weight and Weight Unit must be provided together.");

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

  const weapon = input.weaponProfile ? {
    profileRecordType: clean(input.weaponProfile.profileRecordType) || clean(input.core.recordType),
    weaponType: clean(input.weaponProfile.weaponType),
    handedness: clean(input.weaponProfile.handedness),
    damageSource: clean(input.weaponProfile.damageSource),
    damage: clean(input.weaponProfile.damage),
    damageType: clean(input.weaponProfile.damageType),
    range: clean(input.weaponProfile.range),
    reach: clean(input.weaponProfile.reach),
    ammunitionItemId: input.weaponProfile.ammunitionItemId,
    ammunitionItemName: input.weaponProfile.ammunitionItemId ? optionalText(input.weaponProfile.ammunitionItemName) : null,
    compatibility: clean(input.weaponProfile.compatibility),
    capacity: clean(input.weaponProfile.capacity),
    fireModes: [...new Set(input.weaponProfile.fireModes.map(clean).filter(Boolean))],
    rateOfFire: clean(input.weaponProfile.rateOfFire),
    reloadInitiative: clean(input.weaponProfile.reloadInitiative),
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
    core: {
      canonicalId: input.id ? required(input.core.canonicalId, "Item ID") : clean(input.core.canonicalId),
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
  await requireGod();
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(filters.pageSize ?? 40)));
  const conditions: SQL[] = [eq(item.catalogScope, filters.catalogScope)];
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
  }).from(item).where(where).orderBy(asc(item.name), asc(item.id)).limit(pageSize).offset((page - 1) * pageSize);
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
    items: baseRows.map((row) => ({ ...row, tags: tags.get(row.id) ?? [], hasWeaponProfile: hasWeapon.has(row.id), hasArmorProfile: hasArmor.has(row.id) })),
    total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function listItemFacets(catalogScope: ItemCatalogScope): Promise<ItemFacets> {
  await requireGod();
  const [recordTypes, categories, tagRows] = await Promise.all([
    db.selectDistinct({ value: item.recordType }).from(item).where(eq(item.catalogScope, catalogScope)).orderBy(asc(item.recordType)),
    db.selectDistinct({ value: item.category }).from(item).where(eq(item.catalogScope, catalogScope)).orderBy(asc(item.category)),
    db.selectDistinct({ value: itemTagCatalog.name }).from(itemTagCatalog).innerJoin(itemTagLink, eq(itemTagLink.tagId, itemTagCatalog.id)).innerJoin(item, eq(item.id, itemTagLink.itemId)).where(eq(item.catalogScope, catalogScope)).orderBy(asc(itemTagCatalog.name)),
  ]);
  return {
    recordTypes: recordTypes.map(({ value }) => value.trim()).filter(Boolean),
    categories: categories.map(({ value }) => value.trim()).filter(Boolean),
    tags: tagRows.map(({ value }) => value.trim()).filter(Boolean),
  };
}

export async function listItemAuthoringReferences(): Promise<ItemAuthoringReferences> {
  await requireGod();
  const [tags, locations] = await Promise.all([
    db.select({ name: itemTagCatalog.name, tagGroup: itemTagCatalog.tagGroup, description: itemTagCatalog.description }).from(itemTagCatalog).orderBy(asc(itemTagCatalog.tagGroup), asc(itemTagCatalog.name)),
    db.select({ key: armorLocationReference.locationCode, label: armorLocationReference.locationName }).from(armorLocationReference).orderBy(asc(armorLocationReference.sortOrder)),
  ]);
  return { tags, armorBodyLocations: locations };
}

export async function getItem(id: number): Promise<ItemAggregate | null> {
  await requireGod();
  const [row] = await db.select().from(item).where(eq(item.id, id)).limit(1);
  if (!row) return null;
  let parentItemName: string | null = null;
  if (row.parentItemId) {
    const [parent] = await db.select({ name: item.name }).from(item).where(eq(item.id, row.parentItemId)).limit(1);
    parentItemName = parent?.name ?? null;
  }
  const [properties, weaponRows, armorRows, modifiers, locations, tags, variants] = await Promise.all([
    db.select().from(itemProperty).where(eq(itemProperty.itemId, id)).orderBy(asc(itemProperty.sortOrder), asc(itemProperty.id)),
    db.select().from(weaponProfile).where(eq(weaponProfile.itemId, id)).limit(1),
    db.select().from(armorProfile).where(eq(armorProfile.itemId, id)).limit(1),
    db.select().from(itemArmorDamageModifier).where(eq(itemArmorDamageModifier.itemId, id)).orderBy(asc(itemArmorDamageModifier.sortOrder), asc(itemArmorDamageModifier.id)),
    db.select({ key: armorLocation.locationCode }).from(armorLocation).where(eq(armorLocation.itemId, id)).orderBy(asc(armorLocation.sortOrder)),
    db.select({ name: itemTagCatalog.name }).from(itemTagLink).innerJoin(itemTagCatalog, eq(itemTagCatalog.id, itemTagLink.tagId)).where(eq(itemTagLink.itemId, id)).orderBy(asc(itemTagCatalog.name)),
    db.select({ id: item.id, canonicalId: item.canonicalId, name: item.name, catalogScope: item.catalogScope }).from(item).where(eq(item.parentItemId, id)).orderBy(asc(item.name), asc(item.id)),
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
  if (weapon?.ammunitionItemId) {
    const [ammo] = await db.select({ name: item.name }).from(item).where(eq(item.id, weapon.ammunitionItemId)).limit(1);
    ammunitionItemName = ammo?.name ?? null;
  }
  return {
    id: row.id,
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
      damageSource: weapon.damageSource, damage: weapon.damage, damageType: weapon.damageType, range: weapon.rangeText,
      reach: weapon.reachText, ammunitionItemId: weapon.ammunitionItemId, ammunitionItemName,
      compatibility: weapon.compatibility, capacity: weapon.capacity,
      fireModes: (() => { try { const parsed = JSON.parse(weapon.fireModes); return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []; } catch { return []; } })(),
      rateOfFire: weapon.rateOfFire, reloadInitiative: weapon.reloadInitiative, rulesText: weapon.rulesText,
    } : null,
    armorProfile: armor ? {
      armorType: armor.armorType, coverage: armor.coverage, baseSoak: armor.baseSoak,
      damageModifiersSourceText: armor.damageModifiersSourceText,
      damageModifiers: modifiers.map(({ modifierText, damageType, modifier, notes, sortOrder }) => ({ modifierText, damageType, modifier, notes, sortOrder })),
      coveredBodyLocationKeys: locations.map(({ key }) => key), rulesText: armor.rulesText,
    } : null,
    tags: tags.map(({ name }) => name),
    variants,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function findRelatedItems(search: string, excludeItemId?: number): Promise<RelatedItemCandidate[]> {
  await requireGod();
  const conditions: SQL[] = [];
  if (excludeItemId) conditions.push(ne(item.id, excludeItemId));
  const needle = clean(search);
  if (needle) conditions.push(or(ilike(item.name, `%${needle}%`), ilike(item.canonicalId, `%${needle}%`))!);
  return db.select({ id: item.id, canonicalId: item.canonicalId, name: item.name, recordType: item.recordType }).from(item).where(conditions.length ? and(...conditions) : undefined).orderBy(asc(item.name), asc(item.id)).limit(20);
}

export async function findRelatedCreatures(search: string): Promise<RelatedCreatureCandidate[]> {
  await requireGod();
  const needle = clean(search);
  return db.select({ canonicalId: creature.canonicalId, name: creature.canonicalName, family: creature.family, creatureType: creature.creatureType }).from(creature).where(needle ? or(ilike(creature.canonicalName, `%${needle}%`), ilike(creature.canonicalId, `%${needle}%`)) : undefined).orderBy(asc(creature.canonicalName), asc(creature.id)).limit(20);
}

export async function saveItem(input: ItemDraft): Promise<ItemAggregate> {
  const session = await requireGod();
  const normalized = normalize(input);
  const savedId = await db.transaction(async (tx) => {
    let id = input.id;
    if (id === undefined) {
      const temporaryId = `ITEM-TEMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const [created] = await tx.insert(item).values({ ...normalized.core, canonicalId: temporaryId, createdByUserId: session.user.id }).returning({ id: item.id });
      id = created.id;
      const canonicalId = `ITEM-${String(id).padStart(4, "0")}`;
      await tx.update(item).set({ canonicalId }).where(eq(item.id, id));
    } else {
      const updated = await tx.update(item).set({ ...normalized.core, updatedAt: new Date() }).where(eq(item.id, id)).returning({ id: item.id });
      if (!updated.length) throw new Error("That Item no longer exists.");
    }

    await tx.delete(itemTagLink).where(eq(itemTagLink.itemId, id));
    await tx.delete(itemArmorDamageModifier).where(eq(itemArmorDamageModifier.itemId, id));
    await tx.delete(armorLocation).where(eq(armorLocation.itemId, id));
    await tx.delete(itemProperty).where(eq(itemProperty.itemId, id));
    await tx.delete(weaponProfile).where(eq(weaponProfile.itemId, id));
    await tx.delete(armorProfile).where(eq(armorProfile.itemId, id));

    if (normalized.properties.length) {
      await tx.insert(itemProperty).values(normalized.properties.map(({ relationKind: _relationKind, relatedItemName: _relatedItemName, relatedCreatureName: _relatedCreatureName, ...property }) => ({ itemId: id!, ...property })));
    }
    if (normalized.weapon) {
      await tx.insert(weaponProfile).values({
        itemId: id!, profileRecordType: normalized.weapon.profileRecordType, weaponType: normalized.weapon.weaponType,
        handedness: normalized.weapon.handedness, damageSource: normalized.weapon.damageSource, damage: normalized.weapon.damage,
        damageType: normalized.weapon.damageType, rangeText: normalized.weapon.range, reachText: normalized.weapon.reach,
        ammunitionItemId: normalized.weapon.ammunitionItemId, compatibility: normalized.weapon.compatibility,
        capacity: normalized.weapon.capacity, fireModes: JSON.stringify(normalized.weapon.fireModes), rateOfFire: normalized.weapon.rateOfFire,
        reloadInitiative: normalized.weapon.reloadInitiative, rulesText: normalized.weapon.rulesText,
      });
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

export async function createItemVariant(parentItemId: number, variantName: string): Promise<ItemAggregate> {
  await requireGod();
  const parent = await getItem(parentItemId);
  if (!parent) throw new Error("Parent Item not found.");
  const name = required(variantName, "Variant Name");
  const clone: ItemDraft = {
    ...parent,
    id: undefined,
    core: { ...parent.core, canonicalId: "", name, parentItemId, parentItemName: parent.core.name, sourceSystem: null, sourceExternalId: null },
    properties: parent.properties.map((row) => ({ ...row })),
    weaponProfile: parent.weaponProfile ? { ...parent.weaponProfile, fireModes: [...parent.weaponProfile.fireModes] } : null,
    armorProfile: parent.armorProfile ? { ...parent.armorProfile, damageModifiers: parent.armorProfile.damageModifiers.map((row) => ({ ...row })), coveredBodyLocationKeys: [...parent.armorProfile.coveredBodyLocationKeys] } : null,
    tags: [...parent.tags],
    variants: [],
  };
  return saveItem(clone);
}

export async function deleteItem(id: number) {
  await requireGod();
  const [children, ammoRefs, propertyRefs] = await Promise.all([
    db.select({ value: count() }).from(item).where(eq(item.parentItemId, id)),
    db.select({ value: count() }).from(weaponProfile).where(eq(weaponProfile.ammunitionItemId, id)),
    db.select({ value: count() }).from(itemProperty).where(eq(itemProperty.relatedItemId, id)),
  ]);
  if (Number(children[0]?.value ?? 0)) throw new Error("This Item cannot be deleted while Variants still link to it.");
  if (Number(ammoRefs[0]?.value ?? 0)) throw new Error("This Item cannot be deleted while Weapon Profiles use it as ammunition.");
  if (Number(propertyRefs[0]?.value ?? 0)) throw new Error("This Item cannot be deleted while other Item Properties reference it.");
  await db.delete(item).where(eq(item.id, id));
  revalidatePath("/heavens/equipment");
  revalidatePath("/heavens/inventory");
}
