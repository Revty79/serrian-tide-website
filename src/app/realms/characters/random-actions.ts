"use server";

import { asc, eq } from "drizzle-orm";

import { getCharacter, saveCharacter } from "@/app/characters/actions";
import { db } from "@/db";
import {
  race,
  raceAttributeCap,
  raceMovementMode,
  raceSkillLink,
} from "@/db/race-schema";
import { skill } from "@/db/skill-schema";
import {
  characterAggregateToDraft,
} from "@/features/characters/character-rules";
import type { CharacterRaceAggregate } from "@/features/characters/models";
import {
  RANDOM_CHARACTER_EQUIPMENT_OPTIONS,
  RANDOM_CHARACTER_FOCUS_OPTIONS,
  RANDOM_CHARACTER_TEMPERAMENT_OPTIONS,
  availableRandomMagicSystems,
  createCompletelyRandomAnswers,
  generateRandomCharacterDraft,
  resolveRandomCharacterRaceId,
  type GuidedRandomCharacterAnswers,
  type RandomCharacterEquipment,
  type RandomCharacterFocus,
  type RandomCharacterMagic,
  type RandomCharacterTemperament,
} from "@/features/characters/random-character";

export type RandomCharacterSaveResult = {
  characterId: number;
  name: string;
  warnings: string[];
};

async function readRaceAggregate(raceId: number): Promise<CharacterRaceAggregate> {
  const [raceRow] = await db
    .select({
      id: race.id,
      name: race.name,
      size: race.size,
      baseMagic: race.baseMagic,
      ageMin: race.ageMin,
      ageMax: race.ageMax,
      ageRangeText: race.ageRangeText,
      physicalDescription: race.physicalDescription,
      racialQuirkName: race.racialQuirkName,
      quirkSuccessEffect: race.quirkSuccessEffect,
      quirkFailureEffect: race.quirkFailureEffect,
    })
    .from(race)
    .where(eq(race.id, raceId))
    .limit(1);
  if (!raceRow) throw new Error("The selected Race is no longer available.");

  const [attributeCaps, movementModes, skillLinks] = await Promise.all([
    db
      .select({
        attributeKey: raceAttributeCap.attributeKey,
        maxValue: raceAttributeCap.maxValue,
      })
      .from(raceAttributeCap)
      .where(eq(raceAttributeCap.raceId, raceId))
      .orderBy(asc(raceAttributeCap.sortOrder), asc(raceAttributeCap.id)),
    db
      .select({
        movementMode: raceMovementMode.movementMode,
        baseValue: raceMovementMode.baseValue,
        notes: raceMovementMode.notes,
      })
      .from(raceMovementMode)
      .where(eq(raceMovementMode.raceId, raceId))
      .orderBy(asc(raceMovementMode.sortOrder), asc(raceMovementMode.id)),
    db
      .select({
        skillId: raceSkillLink.skillId,
        skillName: skill.name,
        skillClassification: skill.classification,
        linkType: raceSkillLink.linkType,
        value: raceSkillLink.value,
      })
      .from(raceSkillLink)
      .innerJoin(skill, eq(skill.id, raceSkillLink.skillId))
      .where(eq(raceSkillLink.raceId, raceId))
      .orderBy(asc(raceSkillLink.sortOrder), asc(raceSkillLink.id)),
  ]);

  return { race: raceRow, attributeCaps, movementModes, skillLinks };
}

function isFocus(value: string): value is RandomCharacterFocus {
  return RANDOM_CHARACTER_FOCUS_OPTIONS.some((option) => option.value === value);
}

function isEquipment(value: string): value is RandomCharacterEquipment {
  return RANDOM_CHARACTER_EQUIPMENT_OPTIONS.some((option) => option.value === value);
}

function isTemperament(value: string): value is RandomCharacterTemperament {
  return RANDOM_CHARACTER_TEMPERAMENT_OPTIONS.some((option) => option.value === value);
}

async function generateAndSave(
  characterId: number,
  answers: GuidedRandomCharacterAnswers | null,
): Promise<RandomCharacterSaveResult> {
  const aggregate = await getCharacter(characterId, false);
  if (aggregate.profile.creationCompletedAt) {
    throw new Error("Random generation is only available before Character creation is completed.");
  }
  if (!aggregate.allowedRaces.length) {
    throw new Error("This Campaign has no allowed Races, so a legal random Character cannot be generated.");
  }

  const requestedAnswers = answers ?? createCompletelyRandomAnswers(aggregate);
  const raceId = resolveRandomCharacterRaceId(
    aggregate.allowedRaces,
    requestedAnswers.raceId,
  );
  if (requestedAnswers.raceId !== null && raceId === null) {
    throw new Error("That Race is not allowed in this Campaign.");
  }
  if (!raceId) throw new Error("This Campaign has no allowed Race available for Character generation.");
  const resolvedAnswers = { ...requestedAnswers, raceId };

  const permittedMagic = new Set<RandomCharacterMagic>([
    "none",
    "surprise",
    ...availableRandomMagicSystems(aggregate.campaign.allowedSystems),
  ]);
  if (!permittedMagic.has(resolvedAnswers.magic)) {
    throw new Error("That magic preference is not available in this Campaign.");
  }

  const raceAggregate = await readRaceAggregate(resolvedAnswers.raceId);
  const baseDraft = characterAggregateToDraft(aggregate);
  const generated = generateRandomCharacterDraft(
    aggregate,
    raceAggregate,
    baseDraft,
    resolvedAnswers,
  );

  const saved = await saveCharacter(characterId, generated.draft, false, false);
  return {
    characterId: saved.character.id,
    name: saved.character.name,
    warnings: generated.warnings,
  };
}

export async function generateCompleteRandomCharacter(
  characterId: number,
): Promise<RandomCharacterSaveResult> {
  return generateAndSave(characterId, null);
}

export async function generateGuidedRandomCharacter(
  characterId: number,
  answers: GuidedRandomCharacterAnswers,
): Promise<RandomCharacterSaveResult> {
  if (!Number.isInteger(characterId) || characterId <= 0) {
    throw new Error("A saved Character is required.");
  }
  if (!isFocus(answers.focus)) throw new Error("Choose a valid Character focus.");
  if (!isEquipment(answers.equipment)) throw new Error("Choose a valid Equipment preference.");
  if (!isTemperament(answers.temperament)) throw new Error("Choose a valid temperament.");
  return generateAndSave(characterId, {
    ...answers,
    name: answers.name.trim(),
  });
}
