import "server-only";
import { asc, eq } from "drizzle-orm";
import type { db } from "@/db";
import { item, itemProperty, itemTagCatalog, itemTagLink } from "@/db/item-schema";
import type { FrozenActionSourceSnapshot } from "@/features/tabletop-operations/action-effect-bridge";
import { incomingFactsFromFrozenSource, type FrozenIncomingSourceFacts } from "./source-facts";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function readItemIncomingFactsInTransaction(tx: Transaction, itemId: number, sourceKind: "weapon" | "item", damageType: string | null): Promise<FrozenIncomingSourceFacts> {
  const [identity] = await tx.select({ magical: item.isMagical }).from(item).where(eq(item.id, itemId)).limit(1);
  if (!identity) throw new Error("The exact incoming source Item no longer exists.");
  const properties = await tx.select({ name: itemProperty.propertyName, value: itemProperty.value, relatedCreatureCanonicalId: itemProperty.relatedCreatureCanonicalId }).from(itemProperty).where(eq(itemProperty.itemId, itemId)).orderBy(asc(itemProperty.sortOrder), asc(itemProperty.id));
  const tags = await tx.select({ id: itemTagCatalog.canonicalId }).from(itemTagLink).innerJoin(itemTagCatalog, eq(itemTagCatalog.id, itemTagLink.tagId)).where(eq(itemTagLink.itemId, itemId)).orderBy(asc(itemTagCatalog.canonicalId));
  return { sourceKind, weaponFamily: "none", damageType, magical: identity.magical, itemProperties: properties.map((property) => ({ ...property, value: property.value || null })), itemTags: tags.map(({ id }) => id) };
}

/** Called while locking the source, never while applying a retained plan. */
export async function freezeIncomingSourceFactsInTransaction(tx: Transaction, source: FrozenActionSourceSnapshot): Promise<FrozenActionSourceSnapshot> {
  let incomingSourceFacts = incomingFactsFromFrozenSource(source);
  if (source.kind === "weapon" || source.kind === "item") {
    const itemId = source.kind === "weapon" ? source.authoredData.itemId : source.sourceId;
    if (typeof itemId === "number") incomingSourceFacts = await readItemIncomingFactsInTransaction(tx, itemId, source.kind, incomingSourceFacts.damageType);
  }
  return { ...source, incomingSourceFacts };
}
