import "server-only";

import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { creature } from "@/db/creature-schema";
import { itemTagCatalog } from "@/db/item-schema";
import type { InteractionRuleProfile } from "./interaction-rules";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Authoring reference integrity only; snapshots remain readable without live catalog lookups. */
export async function assertInteractionRuleReferences(tx: Transaction, profile: InteractionRuleProfile | null | undefined) {
  const conditions = profile?.rules.flatMap((rule) => rule.conditions) ?? [];
  const tags = [...new Set(conditions.flatMap((condition) => condition.kind === "item-tag" ? [condition.tagCanonicalId] : []))];
  const creatures = [...new Set(conditions.flatMap((condition) => condition.kind === "item-property" && condition.relatedCreatureCanonicalId ? [condition.relatedCreatureCanonicalId] : []))];
  if (tags.length) {
    const found = await tx.select({ id: itemTagCatalog.canonicalId }).from(itemTagCatalog).where(inArray(itemTagCatalog.canonicalId, tags));
    if (found.length !== tags.length) throw new Error("An Interaction Rule references an Item Tag that no longer exists. Choose a catalog tag.");
  }
  if (creatures.length) {
    const found = await tx.select({ id: creature.canonicalId }).from(creature).where(inArray(creature.canonicalId, creatures));
    if (found.length !== creatures.length) throw new Error("An Interaction Rule property references a Creature that no longer exists.");
  }
}
