import { z } from "zod";
import type { CharacterDraft } from "./models";
import { CHARACTER_CREATION_TABS } from "./character-creation";

const numeric = z.number().finite(), nullable = numeric.nullable(), id = z.number().int().safe();
/** Recovery validates shape; the existing save boundary still validates mechanics. */
export const creationDraftSchema = z.object({
  name: z.string(), npcRoleLabel: z.string().optional(), expectedCommerceVersion: id.nonnegative().optional(),
  profile: z.object({
    raceId: id.positive().nullable(), age: nullable, sex: z.string(), heightFeet: nullable, heightInches: nullable, weight: nullable,
    skinColor: z.string(), eyeColor: z.string(), hairColor: z.string(), deity: z.string(), definingMarks: z.string(),
    personality: z.string(), goals: z.string(), secrets: z.string(), backstory: z.string(), motivations: z.string(),
    fame: numeric, experience: numeric, totalExperience: numeric, quintessence: numeric, totalQuintessence: numeric,
    hpMultiplierSteps: numeric, baseMovementSteps: numeric, baseMagicSteps: numeric, fatePoints: nullable, creditsRemaining: numeric,
  }).strict(),
  attributes: z.object({ STR: numeric, DEX: numeric, CON: numeric, INT: numeric, WIS: numeric, CHR: numeric }).strict(),
  skillAllocations: z.array(z.object({ draftId: id, skillId: id.positive(), parentDraftId: id.nullable(), points: numeric, specialAbilityGranted: z.boolean().optional() }).strict()),
  items: z.array(z.object({ itemId: id.positive(), quantity: numeric, unitCostCredits: numeric }).strict()),
  itemInstances: z.array(z.object({ draftId: id, instanceId: id.positive().nullable(), itemId: id.positive(), unitCostCredits: numeric }).strict()),
  currencyHoldings: z.array(z.object({ currencyId: id.positive(), quantity: numeric }).strict()),
}).strict().superRefine((draft, context) => {
  const allocations = new Map(draft.skillAllocations.map(row => [row.draftId, row]));
  const invalid = allocations.size !== draft.skillAllocations.length || new Set(draft.itemInstances.map(row => row.draftId)).size !== draft.itemInstances.length;
  if (invalid) context.addIssue({ code: "custom", message: "Duplicate recovered draft identities." });
  for (const row of draft.skillAllocations) {
    const visited = new Set([row.draftId]);
    let parent = row.parentDraftId;
    while (parent !== null) {
      if (visited.has(parent) || !allocations.has(parent)) { context.addIssue({ code: "custom", message: "Invalid recovered skill path." }); break; }
      visited.add(parent); parent = allocations.get(parent)!.parentDraftId;
    }
  }
});

export type CreationAutosaveScope = { viewerId: string; characterId: number; campaignId: number; access: "player" | "manager" | "owner" };
const scopeSchema = z.object({ viewerId: z.string().min(1), characterId: id.positive(), campaignId: id.positive(), access: z.enum(["player", "manager", "owner"]) }).strict();
const packetSchema = z.object({ version: z.literal(1), scope: scopeSchema, base: z.string(), draft: creationDraftSchema,
  tab: z.enum(CHARACTER_CREATION_TABS.map(tab => tab.id)), savedAt: z.string().datetime() }).strict();
export type CreationAutosave = z.infer<typeof packetSchema>;
export type StoredCreationAutosave = { key: string; raw: string; value: CreationAutosave };
export type CreationAutosaveStorage = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;

export function creationAutosavePrefix(scope: CreationAutosaveScope) {
  scopeSchema.parse(scope);
  return `serrian-character-creation:v1:${encodeURIComponent(scope.viewerId)}:${scope.campaignId}:${scope.characterId}:${scope.access}:`;
}
export const creationDraftFingerprint = (draft: CharacterDraft) => JSON.stringify(creationDraftSchema.parse(draft));

function allocationPaths(draft: CharacterDraft) {
  const rows = new Map(draft.skillAllocations.map(row => [row.draftId, row]));
  return new Map(draft.skillAllocations.map(row => {
    const path = [row.skillId];
    let parent = row.parentDraftId;
    while (parent !== null) { const ancestor = rows.get(parent)!; path.unshift(ancestor.skillId); parent = ancestor.parentDraftId; }
    return [row.draftId, path.join("/")];
  }));
}

/** Ignore database-assigned identities when recognizing an already saved request. */
export function creationDraftContent(draft: CharacterDraft) {
  const parsed = creationDraftSchema.parse(draft);
  const paths = allocationPaths(parsed);
  return JSON.stringify({ name: parsed.name, profile: parsed.profile, attributes: parsed.attributes,
    skills: parsed.skillAllocations.map(row => ({ path: paths.get(row.draftId), points: row.points, granted: !!row.specialAbilityGranted })).sort((a, b) => a.path!.localeCompare(b.path!)),
    items: [...parsed.items].sort((a, b) => a.itemId - b.itemId),
    instances: parsed.itemInstances.map(row => ({ itemId: row.itemId, unitCostCredits: row.unitCostCredits })).sort((a, b) => a.itemId - b.itemId || a.unitCostCredits - b.unitCostCredits),
    currency: [...parsed.currencyHoldings].sort((a, b) => a.currencyId - b.currencyId),
  });
}

export function encodeCreationAutosave(scope: CreationAutosaveScope, base: CharacterDraft, draft: CharacterDraft, tab: CreationAutosave["tab"], savedAt = new Date().toISOString()) {
  return JSON.stringify(packetSchema.parse({ version: 1, scope, base: creationDraftFingerprint(base), draft, tab, savedAt }));
}
export function readCreationAutosaves(storage: CreationAutosaveStorage, scope: CreationAutosaveScope) {
  const prefix = creationAutosavePrefix(scope), entries: StoredCreationAutosave[] = [];
  let unreadable = 0;
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const raw = storage.getItem(key);
    try {
      const value = packetSchema.parse(JSON.parse(raw ?? ""));
      if (JSON.stringify(value.scope) !== JSON.stringify(scopeSchema.parse(scope))) throw new Error("Wrong Character recovery scope.");
      entries.push({ key, raw: raw!, value });
    } catch { unreadable++; }
  }
  return { entries: entries.sort((a, b) => b.value.savedAt.localeCompare(a.value.savedAt)), unreadable };
}
/** Never retire a newer write from another mounted editor. */
export function retireCreationAutosave(storage: CreationAutosaveStorage, entry: Pick<StoredCreationAutosave, "key" | "raw">) {
  if (storage.getItem(entry.key) === entry.raw) storage.removeItem(entry.key);
}
