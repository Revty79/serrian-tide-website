"use server";

import { asc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { creature } from "@/db/creature-schema";
import { item, itemProperty, itemTagCatalog } from "@/db/item-schema";
import { catalogCandidateWhere, itemDiscoveryWhere } from "@/features/catalog-visibility/catalog-query";
import { itemTagDiscoveryWhere } from "@/features/catalog-visibility/item-catalog-service";
import { requireGodOrAdminAccessContext } from "@/lib/server-access";

export async function getInteractionRuleCatalog(retained: { tags: string[]; creatures: string[] } = { tags: [], creatures: [] }) {
  const { session } = await requireGodOrAdminAccessContext();
  const tagWhere = await itemTagDiscoveryWhere(session.user.id);
  const creatureWhere = await catalogCandidateWhere("creature", creature, session.user.id, [], isNull(creature.archivedAt));
  const [tags, creatures, properties] = await Promise.all([
    db.select({ canonicalId: itemTagCatalog.canonicalId, name: itemTagCatalog.name }).from(itemTagCatalog).where(tagWhere ? or(tagWhere, retained.tags.length ? inArray(itemTagCatalog.canonicalId, retained.tags) : undefined) : undefined).orderBy(asc(itemTagCatalog.name)),
    db.select({ canonicalId: creature.canonicalId, name: creature.canonicalName }).from(creature).where(or(creatureWhere, retained.creatures.length ? inArray(creature.canonicalId, retained.creatures) : undefined)).orderBy(asc(creature.canonicalName)),
    db.selectDistinct({ name: itemProperty.propertyName, value: itemProperty.value }).from(itemProperty).innerJoin(item, eq(item.id, itemProperty.itemId)).where(await itemDiscoveryWhere(session.user.id, isNull(item.archivedAt))).orderBy(asc(itemProperty.propertyName), asc(itemProperty.value)),
  ]);
  return { tags, creatures, properties };
}
