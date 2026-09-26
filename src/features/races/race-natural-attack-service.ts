import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import type { db } from "@/db";
import { raceNaturalAttack } from "@/db/race-schema";
import { skill } from "@/db/skill-schema";
import type { RaceAnatomy } from "./race-anatomy";
import { normalizeRaceNaturalAttacks, type RaceNaturalAttack } from "./race-natural-attacks";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function readRaceNaturalAttacksInTransaction(tx: Transaction, raceId: number): Promise<RaceNaturalAttack[]> {
  const rows = await tx.select({ attack: raceNaturalAttack, skillName: skill.name }).from(raceNaturalAttack)
    .leftJoin(skill, eq(skill.id, raceNaturalAttack.skillId)).where(eq(raceNaturalAttack.raceId, raceId))
    .orderBy(asc(raceNaturalAttack.sortOrder), asc(raceNaturalAttack.id));
  return rows.map(({ attack, skillName }) => ({ key: attack.key, attackName: attack.attackName, damage: attack.damage,
    damageType: attack.damageType, notes: attack.notes, authoring: attack.authoring, skillId: attack.skillId,
    skillName: skillName ?? "", basisNotes: attack.basisNotes, anatomy: attack.anatomy, sortOrder: attack.sortOrder }));
}

/** Caller authorizes and locks the Race. Stable keys retain row identity across edits. */
export async function saveRaceNaturalAttacksInTransaction(tx: Transaction, raceId: number, input: readonly RaceNaturalAttack[], anatomy: RaceAnatomy | null) {
  const definitions = normalizeRaceNaturalAttacks(input, anatomy);
  const existing = await tx.select().from(raceNaturalAttack).where(eq(raceNaturalAttack.raceId, raceId));
  const skillIds = [...new Set(definitions.flatMap(row => row.skillId === null ? [] : [row.skillId]))];
  const skills = skillIds.length ? await tx.select({ id: skill.id, archivedAt: skill.archivedAt }).from(skill).where(inArray(skill.id, skillIds)).for("share") : [];
  if (skills.length !== skillIds.length) throw new Error("One or more Natural Attack Skills no longer exist.");
  for (const definition of definitions) {
    if (skills.find(row => row.id === definition.skillId)?.archivedAt
      && !existing.some(row => row.key === definition.key && row.skillId === definition.skillId)) {
      throw new Error("Archived Skills cannot be newly assigned to a Natural Attack. Restore the Skill first.");
    }
  }
  const removed = existing.filter(row => !definitions.some(definition => definition.key === row.key));
  if (removed.length) await tx.delete(raceNaturalAttack).where(inArray(raceNaturalAttack.id, removed.map(row => row.id)));
  for (const definition of definitions) {
    const values = { raceId, key: definition.key, attackName: definition.attackName, damage: definition.damage,
      damageType: definition.damageType, notes: definition.notes, authoring: definition.authoring,
      skillId: definition.skillId, basisNotes: definition.basisNotes, anatomy: definition.anatomy, sortOrder: definition.sortOrder };
    await tx.insert(raceNaturalAttack).values(values).onConflictDoUpdate({ target: [raceNaturalAttack.raceId, raceNaturalAttack.key], set: values });
  }
}
