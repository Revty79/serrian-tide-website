import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { race } from "@/db/race-schema";
import { creature } from "@/db/creature-schema";
import { item } from "@/db/item-schema";
import { skill } from "@/db/skill-schema";
import { derivedAbility } from "@/db/derived-ability-schema";

const canonRoots = { race, creature, item, skill, derivedAbility } as const;
export type SystemCanonRoot = keyof typeof canonRoots;

function parseCanonChange(input: unknown): { root: SystemCanonRoot; id: number; isSystemCanon: boolean } {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("A content root, ID, and canon designation are required.");
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some((key) => !["root", "id", "isSystemCanon"].includes(key))) throw new Error("Unexpected canon designation field.");
  if (typeof value.root !== "string" || !Object.hasOwn(canonRoots, value.root)) throw new Error("Unknown canon content root.");
  if (typeof value.id !== "number" || !Number.isSafeInteger(value.id) || value.id <= 0) throw new Error("A valid content ID is required.");
  if (typeof value.isSystemCanon !== "boolean") throw new Error("Canon designation must be true or false.");
  return { root: value.root as SystemCanonRoot, id: value.id, isSystemCanon: value.isSystemCanon };
}

/** Trusted actor ID comes from the session boundary. Roles are always read from the DB. */
export async function setSystemCanonForActor(actingUserId: string, input: unknown) {
  const change = parseCanonChange(input);
  const table = canonRoots[change.root];
  return db.transaction(async (tx) => {
    // Hold the role row through the mutation so concurrent revocation cannot authorize a stale role.
    const [admin] = await tx.select({ userId: userRole.userId }).from(userRole)
      .where(and(eq(userRole.userId, actingUserId), eq(userRole.role, "admin"))).for("share");
    if (!admin) throw new Error("Administrator access is required to change System Canon.");
    const selection = { id: table.id, isSystemCanon: table.isSystemCanon, canonMarkedByUserId: table.canonMarkedByUserId, canonMarkedAt: table.canonMarkedAt };
    const [record] = await tx.select(selection).from(table).where(eq(table.id, change.id)).for("update");
    if (!record) throw new Error("Content record not found.");
    // A repeated designation is a no-op; preserve the original current marking attribution.
    if (record.isSystemCanon === change.isSystemCanon) return record;
    const now = new Date();
    const [updated] = await tx.update(table).set({
      isSystemCanon: change.isSystemCanon,
      canonMarkedByUserId: change.isSystemCanon ? actingUserId : null,
      canonMarkedAt: change.isSystemCanon ? now : null,
      updatedAt: now,
    }).where(eq(table.id, change.id)).returning(selection);
    return updated;
  });
}
