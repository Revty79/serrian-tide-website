import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { userRole } from "@/db/authorization-schema";
import { race } from "@/db/race-schema";
import { creature } from "@/db/creature-schema";
import { skill } from "@/db/skill-schema";
import { derivedAbility } from "@/db/derived-ability-schema";
import { catalogVisibilityActivation } from "@/db/catalog-preferences-schema";
import { ACTIVATED_CATALOGS, CANON_MANIFEST_HASH, canonManifest, type ActivatedCatalog } from "./canon-manifest";
import { setSystemCanonInTransaction } from "./system-canon-service";

const roots = { race, creature, skill, derivedAbility };
type RecordIdentity = { id: number; name: string; sourceSystem: string | null; externalId: string | null; createdByUserId: string | null; isSystemCanon: boolean };
const identityKey = (row: Pick<RecordIdentity, "sourceSystem" | "externalId">) => JSON.stringify([row.sourceSystem, row.externalId]);

export async function classifySystemCanon(options: { apply?: boolean; administratorEmail?: string; expectedDatabase?: string } = {}) {
  return db.transaction(async (tx) => {
    let administratorId: string | undefined;
    if (options.apply) {
      if (!options.administratorEmail?.trim()) throw new Error("Apply requires an explicit Administrator account email.");
      const [administrator] = await tx.select({ id: user.id }).from(user)
        .innerJoin(userRole, and(eq(userRole.userId, user.id), eq(userRole.role, "admin")))
        .where(eq(user.email, options.administratorEmail.trim())).for("share");
      if (!administrator) throw new Error("The identified account must currently have the Administrator role.");
      administratorId = administrator.id;
      // Prevent identity changes/inserts between the plan, promotions, and receipt.
      await tx.execute(sql`lock table races, creatures, skill, derived_ability in share row exclusive mode`);
    } else {
      await tx.execute(sql`set transaction isolation level repeatable read, read only`);
    }
    const target = await tx.execute<{ database: string }>(sql`select current_database() as database`);
    if (options.expectedDatabase && target.rows[0].database !== options.expectedDatabase) throw new Error("Database differs from the reviewed classification target; no changes were applied.");
    const catalogs = {} as Record<ActivatedCatalog, {
      expected: number; wouldPromote: RecordIdentity[]; alreadyCanon: RecordIdentity[];
      missing: { name: string; sourceSystem: string; externalId: string }[];
      duplicates: { name: string; ids: number[] }[];
      ambiguousUntouched: RecordIdentity[]; userAuthoredUntouched: RecordIdentity[];
    }>;
    for (const catalog of ACTIVATED_CATALOGS) {
      const table = roots[catalog];
      const rows = await tx.select({ id: table.id, name: catalog === "creature" ? creature.canonicalName : (table as typeof race).name,
        sourceSystem: table.sourceSystem, externalId: catalog === "creature" ? creature.canonicalId : (table as typeof race).sourceExternalId,
        createdByUserId: table.createdByUserId, isSystemCanon: table.isSystemCanon }).from(table);
      const expected = canonManifest[catalog];
      const expectedKeys = new Set(expected.map(identityKey));
      const matching = expected.map((identity) => ({ identity, rows: rows.filter((row) => identityKey(row) === identityKey(identity)) }));
      const exact = matching.filter((match) => match.rows.length === 1).flatMap((match) => match.rows);
      const untouched = rows.filter((row) => !expectedKeys.has(identityKey(row)));
      catalogs[catalog] = {
        expected: expected.length,
        wouldPromote: exact.filter((row) => !row.isSystemCanon), alreadyCanon: exact.filter((row) => row.isSystemCanon),
        missing: matching.filter((match) => match.rows.length === 0).map((match) => match.identity),
        duplicates: matching.filter((match) => match.rows.length > 1).map((match) => ({ name: match.identity.name, ids: match.rows.map((row) => row.id) })),
        ambiguousUntouched: untouched.filter((row) => !row.createdByUserId || row.sourceSystem),
        userAuthoredUntouched: untouched.filter((row) => row.createdByUserId && !row.sourceSystem),
      };
    }
    const ready = ACTIVATED_CATALOGS.every((key) => !catalogs[key].missing.length && !catalogs[key].duplicates.length);
    if (options.apply) {
      if (!ready) throw new Error("Classification aborted: expected identities are missing or duplicated. Inspect the dry-run plan; no changes were applied.");
      for (const root of ACTIVATED_CATALOGS) {
        for (const row of catalogs[root].wouldPromote) {
          await setSystemCanonInTransaction(tx, administratorId!, { root, id: row.id, isSystemCanon: true });
        }
      }
      await tx.insert(catalogVisibilityActivation).values({ manifestHash: CANON_MANIFEST_HASH }).onConflictDoNothing();
    }
    return { database: target.rows[0].database, mode: options.apply ? "apply" : "plan", manifestHash: CANON_MANIFEST_HASH,
      ready, catalogs, classified: Object.fromEntries(ACTIVATED_CATALOGS.map((key) => [key, options.apply ? catalogs[key].wouldPromote.length : 0])) };
  });
}
