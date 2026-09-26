import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { db } from "@/db";
import { raceFormMovement, raceFormNaturalAttack, raceFormNaturalProtection, raceFormNaturalProtectionLocation, raceFormSkillLink } from "@/db/race-schema";
import { skill } from "@/db/skill-schema";
import { assertInteractionRuleReferences } from "@/features/interaction-rules/interaction-rule-references";
import { assertRaceSkillsEligible } from "./race-skills";
import { emptyRaceFormMechanics, type RaceFormMechanics, type RaceFormMechanicsProfile } from "./race-form-mechanics";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function readFormMechanicsInTransaction(tx: Transaction, forms: Array<{ id: number; mechanics: RaceFormMechanicsProfile | null }>) {
  const result = new Map<number, RaceFormMechanics>();
  if (!forms.length) return result;
  const ids = forms.map(row => row.id);
  const movements = await tx.select().from(raceFormMovement).where(inArray(raceFormMovement.formId, ids)).orderBy(asc(raceFormMovement.sortOrder), asc(raceFormMovement.id));
  const protections = await tx.select().from(raceFormNaturalProtection).where(inArray(raceFormNaturalProtection.formId, ids)).orderBy(asc(raceFormNaturalProtection.sortOrder), asc(raceFormNaturalProtection.id));
  const locations = protections.length ? await tx.select().from(raceFormNaturalProtectionLocation).where(inArray(raceFormNaturalProtectionLocation.protectionId, protections.map(row => row.id))) : [];
  const attacks = await tx.select({ attack: raceFormNaturalAttack, skillName: skill.name }).from(raceFormNaturalAttack).leftJoin(skill, eq(skill.id, raceFormNaturalAttack.skillId)).where(inArray(raceFormNaturalAttack.formId, ids)).orderBy(asc(raceFormNaturalAttack.sortOrder), asc(raceFormNaturalAttack.id));
  const links = await tx.select({ link: raceFormSkillLink, skillName: skill.name, skillClassification: skill.classification }).from(raceFormSkillLink).innerJoin(skill, eq(skill.id, raceFormSkillLink.skillId)).where(inArray(raceFormSkillLink.formId, ids)).orderBy(asc(raceFormSkillLink.sortOrder), asc(raceFormSkillLink.id));
  for (const form of forms) result.set(form.id, {
    ...emptyRaceFormMechanics(), ...form.mechanics,
    movement: movements.filter(row => row.formId === form.id).map(({ key, movementMode, baseValue, notes, sortOrder }) => ({ key, movementMode, baseValue, notes, sortOrder })),
    protections: protections.filter(row => row.formId === form.id).map(row => ({ key: row.key, name: row.name, naturalSoak: row.naturalSoak, sortOrder: row.sortOrder,
      coverage: row.coverageKind === "all" ? { kind: "all" } : { kind: "locations", locationKeys: locations.filter(location => location.protectionId === row.id).map(row => row.locationKey).sort() } })),
    attacks: attacks.filter(({ attack }) => attack.formId === form.id).map(({ attack: row, skillName }) => ({ key: row.key, attackName: row.attackName, damage: row.damage, damageType: row.damageType, notes: row.notes, authoring: row.authoring, skillId: row.skillId, skillName: skillName ?? "", basisNotes: row.basisNotes, anatomy: row.anatomy, sortOrder: row.sortOrder })),
    skillLinks: links.filter(({ link }) => link.formId === form.id).map(({ link, skillName, skillClassification }) => ({ skillId: link.skillId, linkType: link.linkType, value: link.value, sortOrder: link.sortOrder, skillName, skillClassification })),
  });
  return result;
}

async function removeMissing(tx: Transaction, table: typeof raceFormMovement | typeof raceFormNaturalProtection | typeof raceFormNaturalAttack, formId: number, keys: string[]) {
  const existing = await tx.select({ id: table.id, key: table.key }).from(table).where(eq(table.formId, formId));
  const keep = new Set(keys), removed = existing.filter(row => !keep.has(row.key));
  if (removed.length) await tx.delete(table).where(inArray(table.id, removed.map(row => row.id)));
}

/** Mechanics have already been normalized against the saved Race; caller holds its root lock. */
export async function saveFormMechanicsInTransaction(tx: Transaction, formId: number, mechanics: RaceFormMechanics) {
  await assertInteractionRuleReferences(tx, mechanics.interactionRules);
  const existingAttacks = await tx.select().from(raceFormNaturalAttack).where(eq(raceFormNaturalAttack.formId, formId));
  const existingLinks = await tx.select().from(raceFormSkillLink).where(eq(raceFormSkillLink.formId, formId));
  const skillIds = [...new Set([...mechanics.attacks.flatMap(row => row.skillId === null ? [] : [row.skillId]), ...mechanics.skillLinks.map(row => row.skillId)])];
  const skills = skillIds.length ? await tx.select().from(skill).where(inArray(skill.id, skillIds)).for("share") : [];
  if (skills.length !== skillIds.length) throw new Error("One or more Form Skills no longer exist.");
  for (const attack of mechanics.attacks) {
    if (skills.find(row => row.id === attack.skillId)?.archivedAt && !existingAttacks.some(row => row.key === attack.key && row.skillId === attack.skillId)) throw new Error("Archived Skills cannot be newly assigned to a Form Natural Attack.");
  }
  for (const link of mechanics.skillLinks) {
    const candidate = skills.find(row => row.id === link.skillId)!;
    assertRaceSkillsEligible([candidate]);
    if (link.linkType === "Granted" && candidate.classification.trim().toLowerCase() !== "special ability") throw new Error("Granted Form Skills must be Special Abilities.");
    if (candidate.archivedAt && !existingLinks.some(row => row.skillId === link.skillId && row.linkType === link.linkType)) throw new Error("Archived Skills cannot be newly assigned to a Form.");
  }
  await removeMissing(tx, raceFormMovement, formId, mechanics.movement.map(row => row.key));
  for (const movement of mechanics.movement) {
    const values = { ...movement, formId };
    await tx.insert(raceFormMovement).values(values).onConflictDoUpdate({ target: [raceFormMovement.formId, raceFormMovement.key], set: values });
  }
  await removeMissing(tx, raceFormNaturalProtection, formId, mechanics.protections.map(row => row.key));
  for (const protection of mechanics.protections) {
    const values = { formId, key: protection.key, name: protection.name, naturalSoak: protection.naturalSoak, coverageKind: protection.coverage.kind, sortOrder: protection.sortOrder };
    const [saved] = await tx.insert(raceFormNaturalProtection).values(values).onConflictDoUpdate({ target: [raceFormNaturalProtection.formId, raceFormNaturalProtection.key], set: values }).returning({ id: raceFormNaturalProtection.id });
    const keys = protection.coverage.kind === "locations" ? protection.coverage.locationKeys : [];
    const old = await tx.select().from(raceFormNaturalProtectionLocation).where(eq(raceFormNaturalProtectionLocation.protectionId, saved.id));
    const removed = old.filter(row => !keys.includes(row.locationKey));
    if (removed.length) await tx.delete(raceFormNaturalProtectionLocation).where(and(eq(raceFormNaturalProtectionLocation.protectionId, saved.id), inArray(raceFormNaturalProtectionLocation.locationKey, removed.map(row => row.locationKey))));
    if (keys.length) await tx.insert(raceFormNaturalProtectionLocation).values(keys.map(locationKey => ({ protectionId: saved.id, locationKey }))).onConflictDoNothing();
  }
  await removeMissing(tx, raceFormNaturalAttack, formId, mechanics.attacks.map(row => row.key));
  for (const attack of mechanics.attacks) {
    const values = { formId, key: attack.key, attackName: attack.attackName, damage: attack.damage, damageType: attack.damageType, notes: attack.notes, authoring: attack.authoring, skillId: attack.skillId, basisNotes: attack.basisNotes, anatomy: attack.anatomy, sortOrder: attack.sortOrder };
    await tx.insert(raceFormNaturalAttack).values(values).onConflictDoUpdate({ target: [raceFormNaturalAttack.formId, raceFormNaturalAttack.key], set: values });
  }
  const removedLinks = existingLinks.filter(row => !mechanics.skillLinks.some(link => link.skillId === row.skillId && link.linkType === row.linkType));
  if (removedLinks.length) await tx.delete(raceFormSkillLink).where(inArray(raceFormSkillLink.id, removedLinks.map(row => row.id)));
  for (const link of mechanics.skillLinks) {
    const values = { formId, skillId: link.skillId, linkType: link.linkType, value: link.value, sortOrder: link.sortOrder };
    await tx.insert(raceFormSkillLink).values(values).onConflictDoUpdate({ target: [raceFormSkillLink.formId, raceFormSkillLink.skillId, raceFormSkillLink.linkType], set: values });
  }
}

/** Copy persisted children exactly, retaining archived references but assigning fresh row IDs. */
export async function cloneFormMechanicsInTransaction(tx: Transaction, sourceId: number, formId: number) {
  const movements = await tx.select().from(raceFormMovement).where(eq(raceFormMovement.formId, sourceId));
  if (movements.length) await tx.insert(raceFormMovement).values(movements.map(row => ({ ...row, id: undefined, formId })));
  const attacks = await tx.select().from(raceFormNaturalAttack).where(eq(raceFormNaturalAttack.formId, sourceId));
  if (attacks.length) await tx.insert(raceFormNaturalAttack).values(attacks.map(row => ({ ...row, id: undefined, formId })));
  const links = await tx.select().from(raceFormSkillLink).where(eq(raceFormSkillLink.formId, sourceId));
  if (links.length) await tx.insert(raceFormSkillLink).values(links.map(row => ({ ...row, id: undefined, formId })));
  const protections = await tx.select().from(raceFormNaturalProtection).where(eq(raceFormNaturalProtection.formId, sourceId));
  for (const protection of protections) {
    const [saved] = await tx.insert(raceFormNaturalProtection).values({ ...protection, id: undefined, formId }).returning({ id: raceFormNaturalProtection.id });
    const locations = await tx.select().from(raceFormNaturalProtectionLocation).where(eq(raceFormNaturalProtectionLocation.protectionId, protection.id));
    if (locations.length) await tx.insert(raceFormNaturalProtectionLocation).values(locations.map(row => ({ ...row, protectionId: saved.id })));
  }
}
