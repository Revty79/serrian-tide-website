import "server-only";

import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { userRole } from "@/db/authorization-schema";
import { race, raceAttributeCap, raceMovementMode, raceSkillLink, raceNaturalAttack, raceForm } from "@/db/race-schema";
import { assertCanEditSharedLibraryRoot } from "@/features/authorization/shared-library-access";
import { readRaceNaturalProtectionInTransaction, saveRaceNaturalProtectionInTransaction } from "./race-natural-protection-service";

/** Copy the saved definition once. Parentage is provenance, never runtime inheritance. */
export async function createRaceVariantForActor(parentRaceId: number, variantName: string, actorUserId: string): Promise<number> {
  if (!Number.isSafeInteger(parentRaceId) || parentRaceId <= 0) throw new Error("Save a parent Race before creating a Variant.");
  const name = typeof variantName === "string" ? variantName.trim() : "";
  if (!name) throw new Error("Variant Name is required.");
  return db.transaction(async (tx) => {
    const [account] = await tx.select({ id: user.id }).from(user).where(eq(user.id, actorUserId)).for("share");
    if (!account) throw new Error("You must be signed in.");
    const assignments = await tx.select({ role: userRole.role }).from(userRole).where(eq(userRole.userId, actorUserId));
    // Race saves lock this same root before changing any owned child definitions.
    const [parent] = await tx.select().from(race).where(eq(race.id, parentRaceId)).for("share");
    if (!parent) throw new Error("Parent Race not found. Save a Race before creating a Variant.");
    assertCanEditSharedLibraryRoot({ userId: actorUserId, roles: assignments.map(({ role }) => role) }, parent, "Race");
    if (parent.archivedAt) throw new Error("Restore the parent Race before creating a Variant.");
    const [created] = await tx.insert(race).values({
      ...parent,
      id: undefined,
      name,
      parentRaceId,
      createdByUserId: actorUserId,
      sourceSystem: null,
      sourceExternalId: null,
      createdAt: undefined,
      updatedAt: undefined,
      archivedAt: null,
      archivedByUserId: null,
      archiveReason: "",
    }).returning({ id: race.id });
    const caps = await tx.select().from(raceAttributeCap).where(eq(raceAttributeCap.raceId, parentRaceId)).orderBy(asc(raceAttributeCap.sortOrder), asc(raceAttributeCap.id));
    const movements = await tx.select().from(raceMovementMode).where(eq(raceMovementMode.raceId, parentRaceId)).orderBy(asc(raceMovementMode.sortOrder), asc(raceMovementMode.id));
    const links = await tx.select().from(raceSkillLink).where(eq(raceSkillLink.raceId, parentRaceId)).orderBy(asc(raceSkillLink.sortOrder), asc(raceSkillLink.id));
    if (caps.length) await tx.insert(raceAttributeCap).values(caps.map((row) => ({ ...row, id: undefined, raceId: created.id, createdAt: undefined, updatedAt: undefined })));
    if (movements.length) await tx.insert(raceMovementMode).values(movements.map((row) => ({ ...row, id: undefined, raceId: created.id, createdAt: undefined, updatedAt: undefined })));
    // Existing links are copied exactly, including retained archived Skill references.
    // This does not create or change a Skill or alter normal Race link eligibility.
    if (links.length) await tx.insert(raceSkillLink).values(links.map((row) => ({ ...row, id: undefined, raceId: created.id, createdAt: undefined, updatedAt: undefined })));
    await saveRaceNaturalProtectionInTransaction(tx, created.id, await readRaceNaturalProtectionInTransaction(tx, parentRaceId));
    const attacks = await tx.select().from(raceNaturalAttack).where(eq(raceNaturalAttack.raceId, parentRaceId)).orderBy(asc(raceNaturalAttack.sortOrder), asc(raceNaturalAttack.id));
    // Copy saved definitions exactly, including retained archived Skill references.
    if (attacks.length) await tx.insert(raceNaturalAttack).values(attacks.map(row => ({ ...row, id: undefined, raceId: created.id })));
    const forms = await tx.select().from(raceForm).where(eq(raceForm.raceId, parentRaceId)).orderBy(asc(raceForm.sortOrder), asc(raceForm.id));
    if (forms.length) await tx.insert(raceForm).values(forms.map(row => ({ ...row, id: undefined, raceId: created.id })));
    return created.id;
  });
}
