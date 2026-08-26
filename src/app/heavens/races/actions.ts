"use server";

import {
  and,
  asc,
  count,
  eq,
  ilike,
  inArray,
  type SQL,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  RACE_SIZE_OPTIONS,
  race,
  raceAttributeCap,
  raceMovementMode,
  raceSkillLink,
  type RaceSize,
} from "@/db/race-schema";
import { skill } from "@/db/skill-schema";
import { requireGod } from "@/lib/server-access";

export type RaceLibraryFilters = {
  search?: string;
  size?: RaceSize | "";
  page?: number;
  pageSize?: number;
};

export type RaceSummary = {
  id: number;
  name: string;
  size: string;
  ageRangeText: string;
  baseMagic: number | null;
  attributeCapCount: number;
  movementModeCount: number;
  skillLinkCount: number;
};

export type RaceLibraryResult = {
  items: RaceSummary[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type RaceSkillCandidate = {
  id: number;
  name: string;
  classification: string;
  tier: number | null;
};

export type RaceDraft = {
  id?: number;
  core: {
    name: string;
    legacyDescription: string;
    physicalCharacteristics: string;
    physicalDescription: string;
    ageRangeText: string;
    ageMin: number | null;
    ageMax: number | null;
    size: string;
    baseMagic: number | null;
    racialQuirkName: string;
    quirkSuccessEffect: string;
    quirkFailureEffect: string;
    commonLanguagesKnown: string;
    commonArchetypes: string;
    genreExamples: string;
    culturalMindset: string;
    outlookOnMagic: string;
    sourceSystem: string | null;
    sourceExternalId: string | null;
  };
  attributeCaps: Array<{
    attributeKey: string;
    maxValue: number;
    sortOrder: number;
  }>;
  movementModes: Array<{
    movementMode: string;
    baseValue: number;
    notes: string;
    sortOrder: number;
  }>;
  skillLinks: Array<{
    skillId: number;
    skillName: string;
    skillClassification: string;
    linkType: string;
    value: number | null;
    sortOrder: number;
  }>;
};

export type RaceAggregate = RaceDraft & {
  id: number;
  createdAt: string;
  updatedAt: string;
};

function cleanText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function cleanOptional(value: string | null | undefined) {
  const cleaned = cleanText(value);
  return cleaned || null;
}

function finiteOrNull(value: number | null, label: string) {
  if (value === null) return null;
  if (!Number.isFinite(value)) throw new Error(`${label} must be a number.`);
  return value;
}

function normalizeRace(input: RaceDraft) {
  const name = cleanText(input.core.name);
  if (!name) throw new Error("Race name is required.");

  const ageMin = input.core.ageMin;
  const ageMax = input.core.ageMax;
  if (ageMin !== null && (!Number.isInteger(ageMin) || ageMin < 0)) {
    throw new Error("Minimum Age must be a non-negative whole number.");
  }
  if (ageMax !== null && (!Number.isInteger(ageMax) || ageMax < 0)) {
    throw new Error("Maximum Age must be a non-negative whole number.");
  }
  if (ageMin !== null && ageMax !== null && ageMin > ageMax) {
    throw new Error("Minimum Age cannot exceed Maximum Age.");
  }

  const size = cleanText(input.core.size);
  if (size && !RACE_SIZE_OPTIONS.includes(size as RaceSize)) {
    throw new Error(`Size must be one of: ${RACE_SIZE_OPTIONS.join(", ")}.`);
  }

  const capKeys = new Set<string>();
  const attributeCaps = input.attributeCaps.map((cap, index) => {
    const attributeKey = cleanText(cap.attributeKey);
    if (!attributeKey) throw new Error("Every attribute cap needs an Attribute name.");
    const identity = attributeKey.toLowerCase();
    if (capKeys.has(identity)) throw new Error(`${attributeKey} cannot be added twice.`);
    capKeys.add(identity);
    if (!Number.isFinite(cap.maxValue)) throw new Error(`${attributeKey} Maximum must be a number.`);
    return { attributeKey, maxValue: cap.maxValue, sortOrder: index };
  });

  const movementModes = input.movementModes.map((movement, index) => {
    const movementMode = cleanText(movement.movementMode);
    if (!movementMode) throw new Error("Every movement row needs a Movement Mode.");
    if (!Number.isFinite(movement.baseValue)) throw new Error(`${movementMode} Base Value must be a number.`);
    return {
      movementMode,
      baseValue: movement.baseValue,
      notes: cleanText(movement.notes),
      sortOrder: index,
    };
  });

  const linkKeys = new Set<string>();
  const skillLinks = input.skillLinks.map((link, index) => {
    if (!Number.isInteger(link.skillId) || link.skillId <= 0) {
      throw new Error("Every Race Skill link must reference a saved Skill.");
    }
    const linkType = cleanText(link.linkType);
    if (!linkType) throw new Error("Every Race Skill link needs a type.");
    if (
      linkType.toLowerCase() === "granted" &&
      cleanText(link.skillClassification).toLowerCase() !== "special ability"
    ) {
      throw new Error("Granted Skills / Racial Abilities must be classified as Special Ability.");
    }
    const key = `${link.skillId}:${linkType.toLowerCase()}`;
    if (linkKeys.has(key)) throw new Error(`${link.skillName || "That Skill"} cannot be added twice as ${linkType}.`);
    linkKeys.add(key);
    return {
      skillId: link.skillId,
      skillName: cleanText(link.skillName),
      skillClassification: cleanText(link.skillClassification),
      linkType,
      value: finiteOrNull(link.value, `${link.skillName || "Skill"} value`),
      sortOrder: input.skillLinks
        .slice(0, index)
        .filter((candidate) => cleanText(candidate.linkType).toLowerCase() === linkType.toLowerCase())
        .length,
    };
  });

  return {
    core: {
      name,
      legacyDescription: cleanText(input.core.legacyDescription),
      physicalCharacteristics: cleanText(input.core.physicalCharacteristics),
      physicalDescription: cleanText(input.core.physicalDescription),
      ageRangeText: cleanText(input.core.ageRangeText),
      ageMin,
      ageMax,
      size,
      baseMagic: finiteOrNull(input.core.baseMagic, "Base Magic"),
      racialQuirkName: cleanText(input.core.racialQuirkName),
      quirkSuccessEffect: cleanText(input.core.quirkSuccessEffect),
      quirkFailureEffect: cleanText(input.core.quirkFailureEffect),
      commonLanguagesKnown: cleanText(input.core.commonLanguagesKnown),
      commonArchetypes: cleanText(input.core.commonArchetypes),
      genreExamples: cleanText(input.core.genreExamples),
      culturalMindset: cleanText(input.core.culturalMindset),
      outlookOnMagic: cleanText(input.core.outlookOnMagic),
      sourceSystem: cleanOptional(input.core.sourceSystem),
      sourceExternalId: cleanOptional(input.core.sourceExternalId),
    },
    attributeCaps,
    movementModes,
    skillLinks,
  };
}

export async function listRaces(
  filters: RaceLibraryFilters = {},
): Promise<RaceLibraryResult> {
  await requireGod();

  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(filters.pageSize ?? 40)));
  const conditions: SQL[] = [];
  const search = cleanText(filters.search);
  const size = cleanText(filters.size);
  if (search) conditions.push(ilike(race.name, `%${search}%`));
  if (size) conditions.push(eq(race.size, size));
  const where = conditions.length ? and(...conditions) : undefined;

  const [countRow] = await db.select({ value: count() }).from(race).where(where);
  const total = Number(countRow?.value ?? 0);
  const baseRows = await db
    .select({
      id: race.id,
      name: race.name,
      size: race.size,
      ageRangeText: race.ageRangeText,
      baseMagic: race.baseMagic,
    })
    .from(race)
    .where(where)
    .orderBy(asc(race.name), asc(race.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const ids = baseRows.map(({ id }) => id);
  if (!ids.length) {
    return { items: [], total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
  }

  const [caps, movements, links] = await Promise.all([
    db.select({ raceId: raceAttributeCap.raceId }).from(raceAttributeCap).where(inArray(raceAttributeCap.raceId, ids)),
    db.select({ raceId: raceMovementMode.raceId }).from(raceMovementMode).where(inArray(raceMovementMode.raceId, ids)),
    db.select({ raceId: raceSkillLink.raceId }).from(raceSkillLink).where(inArray(raceSkillLink.raceId, ids)),
  ]);

  const countBy = (rows: Array<{ raceId: number }>) => {
    const result = new Map<number, number>();
    for (const row of rows) result.set(row.raceId, (result.get(row.raceId) ?? 0) + 1);
    return result;
  };
  const capCounts = countBy(caps);
  const movementCounts = countBy(movements);
  const linkCounts = countBy(links);

  return {
    items: baseRows.map((row) => ({
      ...row,
      attributeCapCount: capCounts.get(row.id) ?? 0,
      movementModeCount: movementCounts.get(row.id) ?? 0,
      skillLinkCount: linkCounts.get(row.id) ?? 0,
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getRace(id: number): Promise<RaceAggregate | null> {
  await requireGod();
  const [row] = await db.select().from(race).where(eq(race.id, id)).limit(1);
  if (!row) return null;

  const [caps, movements, links] = await Promise.all([
    db.select().from(raceAttributeCap).where(eq(raceAttributeCap.raceId, id)).orderBy(asc(raceAttributeCap.sortOrder), asc(raceAttributeCap.id)),
    db.select().from(raceMovementMode).where(eq(raceMovementMode.raceId, id)).orderBy(asc(raceMovementMode.sortOrder), asc(raceMovementMode.id)),
    db
      .select({
        skillId: raceSkillLink.skillId,
        skillName: skill.name,
        skillClassification: skill.classification,
        linkType: raceSkillLink.linkType,
        value: raceSkillLink.value,
        sortOrder: raceSkillLink.sortOrder,
      })
      .from(raceSkillLink)
      .innerJoin(skill, eq(skill.id, raceSkillLink.skillId))
      .where(eq(raceSkillLink.raceId, id))
      .orderBy(asc(raceSkillLink.linkType), asc(raceSkillLink.sortOrder), asc(skill.name)),
  ]);

  return {
    id: row.id,
    core: {
      name: row.name,
      legacyDescription: row.legacyDescription,
      physicalCharacteristics: row.physicalCharacteristics,
      physicalDescription: row.physicalDescription,
      ageRangeText: row.ageRangeText,
      ageMin: row.ageMin,
      ageMax: row.ageMax,
      size: row.size,
      baseMagic: row.baseMagic,
      racialQuirkName: row.racialQuirkName,
      quirkSuccessEffect: row.quirkSuccessEffect,
      quirkFailureEffect: row.quirkFailureEffect,
      commonLanguagesKnown: row.commonLanguagesKnown,
      commonArchetypes: row.commonArchetypes,
      genreExamples: row.genreExamples,
      culturalMindset: row.culturalMindset,
      outlookOnMagic: row.outlookOnMagic,
      sourceSystem: row.sourceSystem,
      sourceExternalId: row.sourceExternalId,
    },
    attributeCaps: caps.map(({ attributeKey, maxValue, sortOrder }) => ({ attributeKey, maxValue, sortOrder })),
    movementModes: movements.map(({ movementMode, baseValue, notes, sortOrder }) => ({ movementMode, baseValue, notes, sortOrder })),
    skillLinks: links,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listRaceSkillCandidates(
  search = "",
  classification?: string,
): Promise<RaceSkillCandidate[]> {
  await requireGod();
  const conditions: SQL[] = [];
  const needle = cleanText(search);
  if (needle) conditions.push(ilike(skill.name, `%${needle}%`));
  if (cleanText(classification)) conditions.push(eq(skill.classification, cleanText(classification)));
  return db
    .select({ id: skill.id, name: skill.name, classification: skill.classification, tier: skill.tier })
    .from(skill)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(skill.name), asc(skill.id))
    .limit(30);
}

export async function saveRace(input: RaceDraft): Promise<RaceAggregate> {
  const session = await requireGod();
  const normalized = normalizeRace(input);

  const savedId = await db.transaction(async (tx) => {
    let id = input.id;
    if (id === undefined) {
      const [created] = await tx
        .insert(race)
        .values({ ...normalized.core, createdByUserId: session.user.id })
        .returning({ id: race.id });
      id = created.id;
    } else {
      const updated = await tx
        .update(race)
        .set({ ...normalized.core, updatedAt: new Date() })
        .where(eq(race.id, id))
        .returning({ id: race.id });
      if (!updated.length) throw new Error("That Race no longer exists.");
    }

    await tx.delete(raceAttributeCap).where(eq(raceAttributeCap.raceId, id));
    await tx.delete(raceMovementMode).where(eq(raceMovementMode.raceId, id));
    await tx.delete(raceSkillLink).where(eq(raceSkillLink.raceId, id));

    if (normalized.attributeCaps.length) {
      await tx.insert(raceAttributeCap).values(normalized.attributeCaps.map((cap) => ({ raceId: id!, ...cap })));
    }
    if (normalized.movementModes.length) {
      await tx.insert(raceMovementMode).values(normalized.movementModes.map((movement) => ({ raceId: id!, ...movement })));
    }
    if (normalized.skillLinks.length) {
      const skillIds = [...new Set(normalized.skillLinks.map((link) => link.skillId))];
      const existingSkills = await tx.select({ id: skill.id, classification: skill.classification }).from(skill).where(inArray(skill.id, skillIds));
      if (existingSkills.length !== skillIds.length) throw new Error("One or more linked Skills no longer exist.");
      const classifications = new Map(existingSkills.map((candidate) => [candidate.id, candidate.classification.toLowerCase()]));
      for (const link of normalized.skillLinks) {
        if (link.linkType.toLowerCase() === "granted" && classifications.get(link.skillId) !== "special ability") {
          throw new Error("Granted Skills / Racial Abilities must be classified as Special Ability.");
        }
      }
      await tx.insert(raceSkillLink).values(normalized.skillLinks.map((link) => ({
        raceId: id!,
        skillId: link.skillId,
        linkType: link.linkType,
        value: link.value,
        sortOrder: link.sortOrder,
      })));
    }

    return id;
  });

  revalidatePath("/heavens/races");
  const saved = await getRace(savedId);
  if (!saved) throw new Error("The saved Race could not be reloaded.");
  return saved;
}

export async function deleteRace(id: number) {
  await requireGod();
  await db.delete(race).where(eq(race.id, id));
  revalidatePath("/heavens/races");
}
