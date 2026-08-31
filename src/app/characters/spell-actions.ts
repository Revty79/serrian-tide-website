"use server";

import {
  and,
  asc,
  eq,
  inArray,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { getCharacter } from "./actions";
import { db } from "@/db";
import { campaignCharacterSpellDocument } from "@/db/realm-schema";
import { skill, skillRelationship } from "@/db/skill-schema";
import { SPELL_IDENTITY_BY_TRADITION } from "@/features/spell-construction/data/spellIdentity";
import { parseSpellDocument } from "@/features/spell-construction/spellDocumentCodec";
import type {
  SpellCastingSystem,
  SpellDocument,
  Tradition,
} from "@/features/spell-construction/models/spell";
import {
  cloneContainerWithNewIds,
  cloneModifierWithNewId,
  cloneProgressiveDataWithNewIds,
  withCalculationSnapshot,
} from "@/features/spell-construction/utilities/spellFactory";
import { createStableId } from "@/features/spell-construction/utilities/ids";
import { getCharacterManaProfiles } from "@/features/characters/character-rules";

export type CharacterSavedSpell = {
  id: number;
  characterId: number;
  documentId: string;
  name: string;
  tradition: string;
  document: SpellDocument;
  inSpellbook: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PlayerSpellFrameworkSkill = {
  id: number;
  name: string;
  classification: string;
  tier: number | null;
};

function availableCastingSystems(character: Awaited<ReturnType<typeof getCharacter>>) {
  return new Set<SpellCastingSystem>(
    getCharacterManaProfiles(
      {
        skillAllocations: character.skillAllocations.map((allocation) => ({
          draftId: allocation.id,
          skillId: allocation.skillId,
          parentDraftId: allocation.parentAllocationId,
          points: allocation.points,
        })),
      },
      character.skillCatalog,
      character.selectedRace,
      character.profile.baseMagicSteps,
    ).map(({ system }) => system),
  );
}

function normalizeCastingSystem(
  systems: Set<SpellCastingSystem>,
  document: SpellDocument,
) {
  if (document.tradition === "Psionics") {
    return { ...document, castingSystem: "Psyonics" as const };
  }
  if (document.tradition === "Bardic Resonance") {
    return { ...document, castingSystem: "Bardic Resonance" as const };
  }
  if (document.castingSystem && ["Spellcraft", "Talismanism", "Faith"].includes(document.castingSystem)) {
    return document;
  }
  const compatible = (["Spellcraft", "Talismanism", "Faith"] as SpellCastingSystem[])
    .filter((system) => systems.has(system));
  return compatible.length === 1
    ? { ...document, castingSystem: compatible[0] }
    : document;
}

function requireSpellbookContext(
  systems: Set<SpellCastingSystem>,
  document: SpellDocument,
) {
  const system = document.castingSystem;
  if (!system || !systems.has(system)) {
    throw new Error(
      document.tradition === "Spellcraft/Talismanism/Faith"
        ? "Choose a casting system this Character actually knows before adding the Spell to the Spellbook."
        : "This Character does not have the magic system required for that Spell.",
    );
  }
}

export async function listCharacterSpells(characterId: number): Promise<CharacterSavedSpell[]> {
  await getCharacter(characterId, false);
  const rows = await db
    .select()
    .from(campaignCharacterSpellDocument)
    .where(eq(campaignCharacterSpellDocument.characterId, characterId))
    .orderBy(asc(campaignCharacterSpellDocument.name), asc(campaignCharacterSpellDocument.id));

  return rows.map((row) => ({
    id: row.id,
    characterId: row.characterId,
    documentId: row.documentId,
    name: row.name,
    tradition: row.tradition,
    document: parseSpellDocument(row.documentJson),
    inSpellbook: row.inSpellbook,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function saveCharacterSpell(
  characterId: number,
  source: SpellDocument,
  addToSpellbook = false,
): Promise<CharacterSavedSpell> {
  const character = await getCharacter(characterId, false);
  const systems = availableCastingSystems(character);
  const normalizedSystem = normalizeCastingSystem(systems, parseSpellDocument(source));
  if (addToSpellbook) requireSpellbookContext(systems, normalizedSystem);
  const document = withCalculationSnapshot(normalizedSystem);
  if (!document.id.trim()) throw new Error("Spell document ID is required.");
  const name = document.name.trim() || "Untitled Spell";

  const [existing] = await db
    .select({ id: campaignCharacterSpellDocument.id, inSpellbook: campaignCharacterSpellDocument.inSpellbook })
    .from(campaignCharacterSpellDocument)
    .where(and(
      eq(campaignCharacterSpellDocument.characterId, characterId),
      eq(campaignCharacterSpellDocument.documentId, document.id),
    ))
    .limit(1);

  let savedId: number;
  if (existing) {
    const [saved] = await db
      .update(campaignCharacterSpellDocument)
      .set({
        name,
        tradition: document.tradition,
        documentJson: JSON.stringify(document),
        inSpellbook: addToSpellbook ? true : existing.inSpellbook,
        updatedAt: new Date(),
      })
      .where(eq(campaignCharacterSpellDocument.id, existing.id))
      .returning({ id: campaignCharacterSpellDocument.id });
    savedId = saved.id;
  } else {
    const [saved] = await db
      .insert(campaignCharacterSpellDocument)
      .values({
        characterId,
        documentId: document.id,
        name,
        tradition: document.tradition,
        documentJson: JSON.stringify(document),
        inSpellbook: addToSpellbook,
      })
      .returning({ id: campaignCharacterSpellDocument.id });
    savedId = saved.id;
  }

  revalidatePath(`/realms/characters/${characterId}/spellbook`);
  revalidatePath(`/realms/characters/${characterId}/magic`);
  const saved = (await listCharacterSpells(characterId)).find(({ id }) => id === savedId);
  if (!saved) throw new Error("The saved Spell could not be reloaded.");
  return saved;
}

export async function setCharacterSpellbookStatus(
  characterId: number,
  savedSpellId: number,
  inSpellbook: boolean,
): Promise<CharacterSavedSpell> {
  const character = await getCharacter(characterId, false);
  const [row] = await db
    .select()
    .from(campaignCharacterSpellDocument)
    .where(and(
      eq(campaignCharacterSpellDocument.id, savedSpellId),
      eq(campaignCharacterSpellDocument.characterId, characterId),
    ))
    .limit(1);
  if (!row) throw new Error("Saved Spell not found.");
  const document = parseSpellDocument(row.documentJson);
  if (inSpellbook) requireSpellbookContext(availableCastingSystems(character), normalizeCastingSystem(availableCastingSystems(character), document));

  await db
    .update(campaignCharacterSpellDocument)
    .set({ inSpellbook, updatedAt: new Date() })
    .where(eq(campaignCharacterSpellDocument.id, savedSpellId));
  revalidatePath(`/realms/characters/${characterId}/spellbook`);
  const saved = (await listCharacterSpells(characterId)).find(({ id }) => id === savedSpellId);
  if (!saved) throw new Error("The Spell could not be reloaded.");
  return saved;
}

export async function duplicateCharacterSpell(
  characterId: number,
  savedSpellId: number,
): Promise<CharacterSavedSpell> {
  const spells = await listCharacterSpells(characterId);
  const source = spells.find(({ id }) => id === savedSpellId);
  if (!source) throw new Error("Saved Spell not found.");
  return duplicateCharacterSpellDocument(characterId, source.document);
}

export async function duplicateCharacterSpellDocument(
  characterId: number,
  source: SpellDocument,
): Promise<CharacterSavedSpell> {
  await getCharacter(characterId, false);
  const idMap = new Map<string, string>();
  const now = new Date().toISOString();
  const duplicate: SpellDocument = {
    ...parseSpellDocument(source),
    id: createStableId("spell"),
    name: `${source.name.trim() || "Untitled Spell"} (Copy)`,
    containers: source.containers.map((container) => cloneContainerWithNewIds(container, idMap)),
    modifiers: source.modifiers.map((modifier) => cloneModifierWithNewId(modifier, idMap)),
    progressive: cloneProgressiveDataWithNewIds(source.progressive, idMap),
    calculation: undefined,
    createdAt: now,
    modifiedAt: now,
  };
  return saveCharacterSpell(characterId, duplicate, false);
}

export async function deleteCharacterSpell(characterId: number, savedSpellId: number) {
  await getCharacter(characterId, false);
  await db
    .delete(campaignCharacterSpellDocument)
    .where(and(
      eq(campaignCharacterSpellDocument.id, savedSpellId),
      eq(campaignCharacterSpellDocument.characterId, characterId),
    ));
  revalidatePath(`/realms/characters/${characterId}/spellbook`);
  revalidatePath(`/realms/characters/${characterId}/magic`);
}

export async function listPlayerSpellFrameworkSkills(
  characterId: number,
  tradition: Tradition,
): Promise<PlayerSpellFrameworkSkill[]> {
  await getCharacter(characterId, false);
  const identity = SPELL_IDENTITY_BY_TRADITION[tradition];
  const parentRows = await db
    .select({ id: skill.id })
    .from(skill)
    .where(inArray(skill.name, [...identity.parentSkillNames]));
  const parentIds = parentRows.map(({ id }) => id);
  if (!parentIds.length) return [];

  const childRows = await db
    .select({ childId: skillRelationship.skillId })
    .from(skillRelationship)
    .where(and(
      inArray(skillRelationship.relatedSkillId, parentIds),
      eq(skillRelationship.relationshipType, "parent"),
    ));
  const childIds = [...new Set(childRows.map(({ childId }) => childId))];
  if (!childIds.length) return [];

  return db
    .select({ id: skill.id, name: skill.name, classification: skill.classification, tier: skill.tier })
    .from(skill)
    .where(inArray(skill.id, childIds))
    .orderBy(asc(skill.name), asc(skill.id));
}
