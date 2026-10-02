import "server-only";
import { sql } from "drizzle-orm";
import type { db } from "@/db";
import { armorLocationReference } from "@/db/item-schema";
import { armorLocationDefinition, normalizeArmorCoverageKeys } from "./armor-coverage";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Called within the authorized Item save, so adding coverage is part of that same transaction. */
export async function saveArmorCoverageReferences(tx: Transaction, keys: readonly string[]): Promise<string[]> {
  const normalized = normalizeArmorCoverageKeys(keys);
  if (!normalized.length) return [];
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('serrian-tide:armor-location-reference'))`);
  const references = await tx.select().from(armorLocationReference);
  let order = Math.max(-1, ...references.map((row) => row.sortOrder)) + 1;
  const result: string[] = [];
  for (const key of normalized) {
    const definition = armorLocationDefinition(key);
    const storedKey = definition?.key ?? key;
    if (!references.some((row) => row.locationCode === storedKey)) {
      if (!definition) throw new Error("A selected body location no longer exists. Remove it and select a body location again.");
      if (references.some((row) => row.locationName.trim().toLocaleLowerCase("en-US") === definition.label.toLocaleLowerCase("en-US"))) {
        throw new Error(`The body location “${definition.label}” already has a different saved reference. Its catalog mapping needs review.`);
      }
      const value = { locationCode: storedKey, locationName: definition.label, sortOrder: order++, notes: "" };
      await tx.insert(armorLocationReference).values(value);
      references.push(value);
    }
    result.push(storedKey);
  }
  return result;
}
