"use server";

import { asc } from "drizzle-orm";
import { db } from "@/db";
import { creature } from "@/db/creature-schema";
import { itemProperty, itemTagCatalog } from "@/db/item-schema";
import { requireGodOrAdminAccessContext } from "@/lib/server-access";

export async function getInteractionRuleCatalog() {
  await requireGodOrAdminAccessContext();
  const [tags, creatures, properties] = await Promise.all([
    db.select({ canonicalId: itemTagCatalog.canonicalId, name: itemTagCatalog.name }).from(itemTagCatalog).orderBy(asc(itemTagCatalog.name)),
    db.select({ canonicalId: creature.canonicalId, name: creature.canonicalName }).from(creature).orderBy(asc(creature.canonicalName)),
    db.selectDistinct({ name: itemProperty.propertyName, value: itemProperty.value }).from(itemProperty).orderBy(asc(itemProperty.propertyName), asc(itemProperty.value)),
  ]);
  return { tags, creatures, properties };
}
