import "server-only";
import { and, eq, inArray, isNull, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { db } from "@/db";
import { race } from "@/db/race-schema";
import { creature } from "@/db/creature-schema";
import { skill } from "@/db/skill-schema";
import { derivedAbility } from "@/db/derived-ability-schema";
import { item } from "@/db/item-schema";
import type { SharedLibraryActor } from "@/features/authorization/shared-library-access";
import { catalogVisibilityPredicate } from "./catalog-query";
import { authoredCreatureCanonicalIds, authoredReferenceIds, storedSkillReferenceIds } from "./catalog-reference-ids";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const roots = { race, creature, skill, derivedAbility, item };
export type CatalogRootKind = keyof typeof roots;

/** Master access is independent of display preferences and rollout activation. */
export function catalogReadWhere(table: { isSystemCanon: AnyPgColumn; createdByUserId: AnyPgColumn }, actor: SharedLibraryActor): SQL | undefined {
  return actor.roles.includes("admin") ? undefined : catalogVisibilityPredicate(table, actor.userId, "canon-and-mine");
}

export async function assertCatalogRootReadable(tx: Tx, actor: SharedLibraryActor, kind: CatalogRootKind, id: number) {
  const table = roots[kind];
  const [row] = await tx.select({ id: table.id }).from(table).where(and(eq(table.id, id), catalogReadWhere(table, actor))).for("share");
  if (!row) throw new Error("This record is not available in your catalog.");
}

/** Only server-read existing references may be retained after canon/ownership changes. */
export async function assertNewCatalogReferences(tx: Tx, actor: SharedLibraryActor, kind: CatalogRootKind, ids: readonly number[], retainedIds: readonly number[] = []) {
  const retained = new Set(retainedIds), added = [...new Set(ids)].filter(id => !retained.has(id));
  if (!added.length) return;
  const table = roots[kind];
  const rows = await tx.select({ id: table.id }).from(table).where(and(inArray(table.id, added), isNull(table.archivedAt), catalogReadWhere(table, actor))).for("share");
  if (rows.length !== added.length) throw new Error("New catalog selections must be System Canon or content you created. Existing Campaign access does not grant master-catalog access.");
}

export async function assertAuthoredCatalogReferences(tx: Tx, actor: SharedLibraryActor, next: unknown, previous: unknown) {
  await assertNewCatalogReferences(tx, actor, "skill", storedSkillReferenceIds(next), storedSkillReferenceIds(previous));
  const abilityFields = ["requiredDerivedAbilityId", "derivedAbilityId"];
  await assertNewCatalogReferences(tx, actor, "derivedAbility", authoredReferenceIds(next, abilityFields), authoredReferenceIds(previous, abilityFields));
  const retained = new Set(authoredCreatureCanonicalIds(previous));
  const added = authoredCreatureCanonicalIds(next).filter(id => !retained.has(id));
  if (added.length) {
    const rows = await tx.select({ id: creature.id }).from(creature).where(and(inArray(creature.canonicalId, added), isNull(creature.archivedAt), catalogReadWhere(creature, actor))).for("share");
    if (rows.length !== added.length) throw new Error("New Creature references must be System Canon or content you created.");
  }
}
