import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userCatalogPreferences } from "@/db/catalog-preferences-schema";
import { defaultCatalogPreferences, parseCatalogPreferenceChange, type CatalogKey, type CatalogPreferences } from "./catalog-visibility";

const preferenceColumns = {
  race: "raceVisibility", creature: "creatureVisibility", skill: "skillVisibility",
  derivedAbility: "derivedAbilityVisibility", equipment: "equipmentVisibility", inventory: "inventoryVisibility",
} as const satisfies Record<CatalogKey, keyof typeof userCatalogPreferences.$inferSelect>;

function effectivePreferences(row?: typeof userCatalogPreferences.$inferSelect): CatalogPreferences {
  if (!row) return defaultCatalogPreferences();
  return {
    race: row.raceVisibility, creature: row.creatureVisibility, skill: row.skillVisibility,
    derivedAbility: row.derivedAbilityVisibility, equipment: row.equipmentVisibility, inventory: row.inventoryVisibility,
  };
}

/** Bind only to trusted server authentication, never to caller-provided identity. */
export function bindCatalogPreferenceOperations(getAuthenticatedUserId: () => Promise<string>) {
  async function currentUserId() {
    const id = await getAuthenticatedUserId();
    if (!id) throw new Error("You must be signed in.");
    return id;
  }
  return {
    async read(): Promise<CatalogPreferences> {
      const userId = await currentUserId();
      const [row] = await db.select().from(userCatalogPreferences).where(eq(userCatalogPreferences.userId, userId));
      return effectivePreferences(row);
    },
    async update(input: unknown): Promise<CatalogPreferences> {
      const userId = await currentUserId();
      const { catalog, mode } = parseCatalogPreferenceChange(input);
      const change = { [preferenceColumns[catalog]]: mode };
      // Update only the chosen column, including concurrent first writes to different catalogs.
      const [row] = await db.insert(userCatalogPreferences).values({ userId, ...change })
        .onConflictDoUpdate({ target: userCatalogPreferences.userId, set: { ...change, updatedAt: new Date() } })
        .returning();
      return effectivePreferences(row);
    },
  };
}
