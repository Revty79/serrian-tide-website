import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { catalogVisibilityScopeActivation } from "@/db/catalog-preferences-schema";
import { CATALOG_KEYS, type CatalogKey } from "./catalog-visibility";

export async function setCatalogActivationForActor(actorId: string, input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("A catalog and activation choice are required.");
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some((key) => !["catalog", "enabled"].includes(key)) || !CATALOG_KEYS.includes(value.catalog as CatalogKey) || typeof value.enabled !== "boolean") throw new Error("Invalid catalog activation change.");
  const catalog = value.catalog as CatalogKey, enabled = value.enabled;
  return db.transaction(async (tx) => {
    const [admin] = await tx.select({ id: userRole.userId }).from(userRole)
      .where(and(eq(userRole.userId, actorId), eq(userRole.role, "admin"))).for("share");
    if (!admin) throw new Error("Administrator access is required to activate or disable catalog filtering.");
    if (enabled) await tx.insert(catalogVisibilityScopeActivation).values({ catalogKey: catalog, activationMethod: "manual", activatedByUserId: actorId })
      .onConflictDoNothing();
    else await tx.delete(catalogVisibilityScopeActivation).where(eq(catalogVisibilityScopeActivation.catalogKey, catalog));
    return { catalog, enabled };
  });
}
