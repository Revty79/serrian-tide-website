import "server-only";
import { asc, eq, inArray, sql } from "drizzle-orm";
import type { db } from "@/db";
import { skill, skillExtension } from "@/db/skill-schema";
import { derivedAbility } from "@/db/derived-ability-schema";
import { canAccessSharedLibrary, type SharedLibraryActor } from "@/features/authorization/shared-library-access";
import { readSpecialAbilityMechanics } from "./codec";
import { SPECIAL_ABILITY_MECHANICS_EXTENSION, referenceKey, type MechanicsReference, type SpecialAbilityMechanicsDocument } from "./models";
import { collectMechanicsReferences } from "./references";
import type { MechanicsReferenceView } from "./resolution";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Serialize Skill/Derived authoring and lifecycle BEFORE taking root locks.
 * Cross-referencing Skill edits cannot deadlock by locking opposite parents first.
 * All supported writers must use this protocol; raw SQL is outside this contract.
 */
export async function lockMechanicsReferenceGraph(tx: Transaction): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(1937006962, 2)`);
}
async function referenceRows(tx: Transaction, refs: readonly MechanicsReference[], lock: boolean) {
  const skillIds = refs.flatMap(ref => ref.kind === "skill" ? [ref.skillId] : []);
  const derivedIds = refs.flatMap(ref => ref.kind === "derived-ability" ? [ref.derivedAbilityId] : []);
  const result: Array<{ reference: MechanicsReference; name: string; archivedAt: Date | null }> = [];
  if (skillIds.length) {
    const query = tx.select({ id: skill.id, name: skill.name, archivedAt: skill.archivedAt }).from(skill).where(inArray(skill.id, skillIds)).orderBy(asc(skill.id));
    for (const row of lock ? await query.for("share") : await query) result.push({ reference: { kind: "skill", skillId: row.id }, name: row.name, archivedAt: row.archivedAt });
  }
  if (derivedIds.length) {
    const query = tx.select({ id: derivedAbility.id, name: derivedAbility.name, archivedAt: derivedAbility.archivedAt }).from(derivedAbility).where(inArray(derivedAbility.id, derivedIds)).orderBy(asc(derivedAbility.id));
    for (const row of lock ? await query.for("share") : await query) result.push({ reference: { kind: "derived-ability", derivedAbilityId: row.id }, name: row.name, archivedAt: row.archivedAt });
  }
  return new Map(result.map(row => [referenceKey(row.reference), row]));
}
export async function validateMechanicsReferencesInTransaction(tx: Transaction, document: SpecialAbilityMechanicsDocument, previous: SpecialAbilityMechanicsDocument | null, actor: SharedLibraryActor) {
  // Same shared-library read boundary as getSkill / Derived authoring reads.
  // Root editing authorization is enforced separately by saveSkill.
  if (!canAccessSharedLibrary(actor)) throw new Error("G.O.D. or administrator access is required to author references.");
  const refs = collectMechanicsReferences(document);
  const retained = new Set(previous ? collectMechanicsReferences(previous).map(referenceKey) : []);
  const rows = await referenceRows(tx, refs, true);
  for (const ref of refs) {
    const key = referenceKey(ref), row = rows.get(key);
    if (!row) throw new Error(`Mechanics reference ${key} no longer exists.`);
    if (row.archivedAt && !retained.has(key)) throw new Error(`Archived reference ${row.name} cannot be newly assigned to Special Ability Mechanics.`);
  }
}
/** Caller authorizes the catalog/Character context before resolving labels. */
export async function readMechanicsReferenceViews(tx: Transaction, refs: readonly MechanicsReference[]): Promise<MechanicsReferenceView[]> {
  const rows = await referenceRows(tx, refs, false);
  return refs.map(ref => {
    const row = rows.get(referenceKey(ref));
    return { ...ref, name: row?.name ?? null, status: row ? row.archivedAt ? "archived" : "available" : "missing" };
  });
}
/** Unreadable documents conservatively block deletion, but not archive/restore.
 * Exclude a deleting Skill's own document, which cascades with that same owner.
 */
export async function countMechanicsDependencies(tx: Transaction, target: MechanicsReference): Promise<number> {
  const rows = await tx.select({ skillId: skillExtension.skillId, schemaVersion: skillExtension.schemaVersion, dataJson: skillExtension.dataJson })
    .from(skillExtension).where(eq(skillExtension.extensionType, SPECIAL_ABILITY_MECHANICS_EXTENSION));
  let count = 0;
  for (const row of rows) {
    if (target.kind === "skill" && row.skillId === target.skillId) continue;
    const read = readSpecialAbilityMechanics(row);
    if (read.status !== "ready" || collectMechanicsReferences(read.document).some(ref => referenceKey(ref) === referenceKey(target))) count++;
  }
  return count;
}
