import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import type { db } from "@/db";
import { creatureForm, creatureFormSkillLink } from "@/db/creature-schema";
import { skill } from "@/db/skill-schema";
import { assertInteractionRuleReferences } from "@/features/interaction-rules/interaction-rule-references";
import { normalizeCreatureForm, type CreatureForm, type SavedCreatureForm } from "./creature-forms";
import type { CreatureDraft } from "./models";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Caller authorizes the exact Creature. No parent/variant chain merging. */
export async function readCreatureFormsInTransaction(tx: Transaction, creatureId: number): Promise<SavedCreatureForm[]> {
  const forms = await tx.select().from(creatureForm).where(eq(creatureForm.creatureId, creatureId)).orderBy(asc(creatureForm.sortOrder), asc(creatureForm.id));
  if (!forms.length) return [];
  const links = await tx.select({ formId: creatureFormSkillLink.formId, skillId: skill.id, skillName: skill.name,
    skillClassification: skill.classification, rank: creatureFormSkillLink.rank, notes: creatureFormSkillLink.notes, sortOrder: creatureFormSkillLink.sortOrder,
  }).from(creatureFormSkillLink).innerJoin(skill, eq(skill.id, creatureFormSkillLink.skillId))
    .where(inArray(creatureFormSkillLink.formId, forms.map(row => row.id))).orderBy(asc(creatureFormSkillLink.sortOrder));
  return forms.map(form => ({ ...form, mechanics: { ...form.mechanics, skills: { ...form.mechanics.skills,
    rows: links.filter(row => row.formId === form.id).map(({ skillId, skillName, skillClassification, rank, notes, sortOrder }) => ({ skillId, skillName, skillClassification, rank, notes, sortOrder })),
  } } }));
}

/** Caller authorizes and locks/updates the Creature root in this transaction. */
export async function saveCreatureFormsInTransaction(tx: Transaction, creatureId: number, input: readonly CreatureForm[] | undefined, definition: CreatureDraft) {
  const existing = await readCreatureFormsInTransaction(tx, creatureId);
  // Legacy clients preserve Forms, but changes to the Normal body still validate retained Forms.
  const forms = (input ?? existing).map((form, index) => normalizeCreatureForm(form, definition, index));
  if (new Set(forms.map(row => row.key)).size !== forms.length) throw new Error("Form keys must be unique within this Creature.");
  const removed = existing.filter(row => !forms.some(form => row.key === form.key));
  if (removed.length) await tx.delete(creatureForm).where(inArray(creatureForm.id, removed.map(row => row.id)));
  for (const form of forms) {
    await assertInteractionRuleReferences(tx, form.mechanics.interactionRules);
    const links = form.mechanics.skills.rows;
    if (links.length) {
      const found = await tx.select({ id: skill.id, archivedAt: skill.archivedAt }).from(skill).where(inArray(skill.id, links.map(row => row.skillId)));
      const oldIds = new Set(existing.find(row => row.key === form.key)?.mechanics.skills.rows.map(row => row.skillId));
      if (found.length !== links.length) throw new Error("One or more Form Skills no longer exist.");
      if (found.some(row => row.archivedAt && !oldIds.has(row.id))) throw new Error("Archived Skills cannot be added to a Creature Form.");
    }
    const values = { ...form, creatureId, mechanics: { ...form.mechanics, skills: { ...form.mechanics.skills, rows: [] } } };
    const [saved] = await tx.insert(creatureForm).values(values).onConflictDoUpdate({ target: [creatureForm.creatureId, creatureForm.key], set: values }).returning({ id: creatureForm.id });
    await tx.delete(creatureFormSkillLink).where(eq(creatureFormSkillLink.formId, saved.id));
    if (links.length) await tx.insert(creatureFormSkillLink).values(links.map(({ skillId, rank, notes, sortOrder }) => ({ formId: saved.id, skillId, rank, notes, sortOrder })));
  }
}

export async function cloneCreatureFormsInTransaction(tx: Transaction, parentCreatureId: number, creatureId: number) {
  const forms = await tx.select().from(creatureForm).where(eq(creatureForm.creatureId, parentCreatureId));
  for (const form of forms) {
    const [saved] = await tx.insert(creatureForm).values({ ...structuredClone(form), id: undefined, creatureId }).returning({ id: creatureForm.id });
    const links = await tx.select().from(creatureFormSkillLink).where(eq(creatureFormSkillLink.formId, form.id));
    if (links.length) await tx.insert(creatureFormSkillLink).values(links.map(row => ({ ...row, id: undefined, formId: saved.id })));
  }
}
