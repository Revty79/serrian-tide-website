import { assertAuthoredCatalogReferences } from "@/features/catalog-visibility/catalog-access";
import "server-only";
import { normalizeAuthoredDamageTypes } from "@/features/damage-types/damage-types";
import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { db } from "@/db";
import { skill, skillExtension, skillRelationship } from "@/db/skill-schema";
import { isSpecialAbilitySkill } from "@/features/characters/character-rules";
import { parseSpecialAbilityMechanics, readSpecialAbilityMechanics } from "@/features/special-abilities/codec";
import { SPECIAL_ABILITY_MECHANICS_EXTENSION, SPECIAL_ABILITY_MECHANICS_VERSION } from "@/features/special-abilities/models";
import { validateMechanicsReferencesInTransaction } from "@/features/special-abilities/reference-service";
import type { SharedLibraryActor } from "@/features/authorization/shared-library-access";
import { parseSpellDocument } from "@/features/spell-construction/spellDocumentCodec";
import { SPELL_SCHEMA_VERSION } from "@/features/spell-construction/models/spell";
import { withCalculationSnapshot } from "@/features/spell-construction/utilities/spellFactory";
import { lockSpellFrameworkSkillReferenceInTransaction } from "./skill-framework-reference-service";
import type { SkillExtensionDraft, SkillExtensionMutation } from "./skill-extension-draft";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type StoredSkillExtension = { extensionType: string; schemaVersion: number; dataJson: string };
const SPELL = "spell-construction";

export function readSkillExtension(row: StoredSkillExtension): SkillExtensionDraft {
  if (row.extensionType === SPECIAL_ABILITY_MECHANICS_EXTENSION) {
    const read = readSpecialAbilityMechanics(row);
    return { extensionType: row.extensionType, schemaVersion: row.schemaVersion, data: read.document,
      readStatus: read.status === "absent" ? "invalid" : read.status, diagnostics: read.diagnostics.map(d => d.message) };
  }
  try {
    if (row.extensionType === SPELL && row.schemaVersion > SPELL_SCHEMA_VERSION) return { extensionType: row.extensionType, schemaVersion: row.schemaVersion, data: null,
      readStatus: "unsupported", diagnostics: ["This Spell Construction version is newer than this editor supports. The saved document is preserved."] };
    return { extensionType: row.extensionType, schemaVersion: row.schemaVersion,
      data: row.extensionType === SPELL ? parseSpellDocument(row.dataJson) : JSON.parse(row.dataJson), readStatus: "ready", diagnostics: [] };
  } catch (error) {
    return { extensionType: row.extensionType, schemaVersion: row.schemaVersion, data: null, readStatus: "invalid",
      diagnostics: [error instanceof Error ? error.message : "This extension could not be decoded. The saved bytes are preserved."] };
  }
}
export async function readSkillWriteState(tx: Transaction, id: number, lock = false) {
  const query = tx.select().from(skill).where(eq(skill.id, id));
  const [root] = lock ? await query.for("update") : await query;
  if (!root) throw new Error("That Skill no longer exists.");
  const relationships = await tx.select().from(skillRelationship).where(eq(skillRelationship.skillId, id)).orderBy(asc(skillRelationship.id));
  const extensions = await tx.select().from(skillExtension).where(eq(skillExtension.skillId, id)).orderBy(asc(skillExtension.extensionType));
  // All saved fields, relationship identities, raw extension bytes and timestamps
  // participate. A core edit cannot accidentally accept an extension-only change.
  const revision = createHash("sha256").update(JSON.stringify({ root, relationships, extensions })).digest("hex");
  return { root, relationships, extensions, revision };
}
export function assertSkillRevision(expected: unknown, actual: string) {
  if (typeof expected !== "string" || expected !== actual) throw new Error("This Skill changed after it was opened, or its revision is missing. Reload it before saving; your draft has not been written.");
}
function validateMutations(input: unknown): SkillExtensionMutation[] {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 50) throw new Error("Extension changes must be a bounded list.");
  const seen = new Set<string>();
  for (const row of input) {
    if (!row || typeof row !== "object" || !["upsert", "remove"].includes(row.operation)) throw new Error("Choose an explicit extension upsert or remove operation.");
    const fields = row.operation === "upsert" ? ["operation", "extensionType", "schemaVersion", "data"] : ["operation", "extensionType"];
    if (Object.keys(row).some(key => !fields.includes(key)) || fields.some(key => !Object.hasOwn(row, key))) throw new Error("Invalid extension mutation shape.");
    if (typeof row.extensionType !== "string" || !row.extensionType.trim() || row.extensionType !== row.extensionType.trim() || row.extensionType.length > 128 || seen.has(row.extensionType)) throw new Error("Extension changes need unique, nonblank family identities.");
    seen.add(row.extensionType);
    if (row.operation === "upsert" && (!Number.isSafeInteger(row.schemaVersion) || row.schemaVersion < 1 || row.schemaVersion > 2147483647)) throw new Error("Extension schema version must be a positive integer.");
  }
  return input;
}
function serialize(value: unknown): string {
  let json: string | undefined;
  try { json = JSON.stringify(value, (_key, value) => {
    if (typeof value === "number" && !Number.isFinite(value) || typeof value === "undefined" || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") throw new Error("Unsupported JSON value.");
    return value;
  }); } catch { throw new Error("The extension must contain finite, serializable JSON data."); }
  if (!json || Buffer.byteLength(json) > 1048576) throw new Error("The extension is empty or too large.");
  return json;
}
/** Caller holds the shared reference lock and the fresh parent write lock.
 * Only explicit intents touch rows; unrelated bytes/IDs/timestamps stay intact.
 */
export async function saveSkillExtensionMutations(tx: Transaction, input: {
  skillId: number; name: string; classification: string; actor: SharedLibraryActor;
  previous: readonly StoredSkillExtension[]; mutations: unknown;
}) {
  const mutations = validateMutations(input.mutations);
  const existing = new Map(input.previous.map(row => [row.extensionType, row]));
  const mechanicsMutation = mutations.find(row => row.extensionType === SPECIAL_ABILITY_MECHANICS_EXTENSION);
  const willHaveMechanics = mechanicsMutation ? mechanicsMutation.operation === "upsert" : existing.has(SPECIAL_ABILITY_MECHANICS_EXTENSION);
  if (willHaveMechanics && !isSpecialAbilitySkill(input)) throw new Error("Special Ability Mechanics can only be attached to a Special Ability. Explicitly detach mechanics before changing classification.");
  for (const mutation of [...mutations].sort((a, b) => a.extensionType.localeCompare(b.extensionType))) {
    const previous = existing.get(mutation.extensionType);
    if (mutation.operation === "remove") {
      await tx.delete(skillExtension).where(and(eq(skillExtension.skillId, input.skillId), eq(skillExtension.extensionType, mutation.extensionType)));
      continue;
    }
    let retainedReferences: unknown;
    try { retainedReferences = previous ? JSON.parse(previous.dataJson) : null; } catch { retainedReferences = null; }
    await assertAuthoredCatalogReferences(tx, input.actor, mutation.data, retainedReferences);
    let schemaVersion = mutation.schemaVersion, dataJson: string;
    if (mutation.extensionType === SPECIAL_ABILITY_MECHANICS_EXTENSION) {
      // A newer row remains protected even if its JSON is malformed or exceeds
      // this editor's limits; a read diagnostic is never downgrade permission.
      if (previous && previous.schemaVersion > SPECIAL_ABILITY_MECHANICS_VERSION) throw new Error("A newer mechanics document cannot be replaced by this editor. Use a compatible editor.");
      if (previous && mutation.schemaVersion < previous.schemaVersion) throw new Error("Mechanics cannot be downgraded. Keep the saved version or explicitly detach the document.");
      const old = previous ? readSpecialAbilityMechanics(previous) : null;
      const document = normalizeAuthoredDamageTypes(parseSpecialAbilityMechanics(mutation.data, mutation.schemaVersion), old?.status === "ready" ? old.document : undefined, "Special Ability");
      await validateMechanicsReferencesInTransaction(tx, document, old?.status === "ready" ? old.document : null, input.actor);
      dataJson = JSON.stringify(document);
    } else if (mutation.extensionType === SPELL) {
      if (previous && previous.schemaVersion > SPELL_SCHEMA_VERSION || mutation.schemaVersion > SPELL_SCHEMA_VERSION) throw new Error("A newer Spell Construction document cannot be replaced by this editor.");
      const document = withCalculationSnapshot({ ...parseSpellDocument(mutation.data), name: input.name });
      await lockSpellFrameworkSkillReferenceInTransaction(tx, document.frameworkSkillId, document.tradition);
      schemaVersion = SPELL_SCHEMA_VERSION;
      dataJson = JSON.stringify(document);
    } else dataJson = serialize(mutation.data);
    await tx.insert(skillExtension).values({ skillId: input.skillId, extensionType: mutation.extensionType, schemaVersion, dataJson })
      .onConflictDoUpdate({ target: [skillExtension.skillId, skillExtension.extensionType], set: { schemaVersion, dataJson, updatedAt: new Date() } });
  }
}
