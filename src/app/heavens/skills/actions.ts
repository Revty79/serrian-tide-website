"use server";

import {
  and,
  asc,
  count,
  eq,
  ilike,
  inArray,
  sql,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import {
  skill,
  skillExtension,
  skillRelationship,
} from "@/db/skill-schema";
import { SPELL_IDENTITY_BY_TRADITION } from "@/features/spell-construction/data/spellIdentity";
import { parseSpellDocument } from "@/features/spell-construction/spellDocumentCodec";
import {
  SPELL_SCHEMA_VERSION,
  type Tradition,
} from "@/features/spell-construction/models/spell";
import { withCalculationSnapshot } from "@/features/spell-construction/utilities/spellFactory";
import { auth } from "@/lib/auth";
import {
  SPECIAL_ABILITY_CLASSIFICATION,
  SPELL_CONSTRUCTION_EXTENSION,
} from "./constants";

export type SkillLibraryFilters = {
  search?: string;
  classification?: string;
  tier?: number | null;
  primaryAttribute?: string;
  secondaryAttribute?: string;
  page?: number;
  pageSize?: number;
};

export type SkillLibraryItem = {
  id: number;
  name: string;
  classification: string;
  tier: number | null;
  primaryAttribute: string | null;
  secondaryAttribute: string | null;
  relationshipCount: number;
  parentNames: string[];
  hasSpellConstruction: boolean;
};

export type SkillRelationshipEdge = {
  skillId: number;
  relatedSkillId: number;
  relationshipType: string;
  sortOrder: number;
};

export type SkillLibraryResult = {
  items: SkillLibraryItem[];
  relationships: SkillRelationshipEdge[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type SkillFilterOptions = {
  classifications: string[];
  tiers: number[];
  primaryAttributes: string[];
  secondaryAttributes: string[];
};

export type SkillRelationshipDraft = {
  relatedSkillId: number;
  relatedSkillName?: string;
  relationshipType: string;
  sortOrder: number;
};

export type SkillExtensionDraft = {
  extensionType: string;
  schemaVersion: number;
  data: unknown;
};

export type SkillDraft = {
  id?: number;
  core: {
    name: string;
    classification: string;
    tier: number | null;
    primaryAttribute: string | null;
    secondaryAttribute: string | null;
    definition: string;
    sourceSystem: string | null;
    sourceExternalId: string | null;
  };
  relationships: SkillRelationshipDraft[];
  extensions: SkillExtensionDraft[];
};

export type SkillAggregate = SkillDraft & {
  id: number;
  createdAt: string;
  updatedAt: string;
};

export type SpellFrameworkSkill = {
  id: number;
  name: string;
  classification: string;
  tier: number | null;
};

async function requireGod() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error("You must be signed in.");
  }

  const access = await db
    .select({ role: userRole.role })
    .from(userRole)
    .where(
      and(
        eq(userRole.userId, session.user.id),
        eq(userRole.role, "god"),
      ),
    )
    .limit(1);

  if (access.length === 0) {
    throw new Error("G.O.D. access is required.");
  }

  return session;
}

function optionalText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function normalizeCore(input: SkillDraft["core"]) {
  const name = input.name.trim();
  if (!name) throw new Error("Name is required before saving.");

  const primaryAttribute = optionalText(input.primaryAttribute);
  const secondaryAttribute = optionalText(input.secondaryAttribute);
  const hasAttribute = Boolean(primaryAttribute || secondaryAttribute);

  const classification = hasAttribute
    ? input.classification.trim() || "standard"
    : SPECIAL_ABILITY_CLASSIFICATION;

  const tier = hasAttribute ? input.tier : null;
  if (tier !== null && (!Number.isInteger(tier) || tier < 1)) {
    throw new Error("Tier must be a positive whole number or N/A.");
  }

  return {
    name,
    classification,
    tier,
    primaryAttribute,
    secondaryAttribute,
    definition: input.definition.trim(),
    sourceSystem: optionalText(input.sourceSystem),
    sourceExternalId: optionalText(input.sourceExternalId),
  };
}

function normalizeRelationships(
  skillId: number | undefined,
  relationships: SkillRelationshipDraft[],
) {
  const seen = new Set<string>();

  return relationships.map((relationship, index) => {
    if (!Number.isInteger(relationship.relatedSkillId) || relationship.relatedSkillId < 1) {
      throw new Error("A related Skill is invalid.");
    }
    if (relationship.relatedSkillId === skillId) {
      throw new Error("A Skill cannot relate to itself.");
    }

    const relationshipType = relationship.relationshipType.trim() || "parent";
    const key = `${relationship.relatedSkillId}:${relationshipType.toLowerCase()}`;
    if (seen.has(key)) {
      throw new Error("The same Skill relationship cannot be added twice.");
    }
    seen.add(key);

    return {
      relatedSkillId: relationship.relatedSkillId,
      relatedSkillName: relationship.relatedSkillName,
      relationshipType,
      sortOrder: index,
    };
  });
}

async function wouldCreateCircularPath(
  skillId: number,
  relatedSkillId: number,
  relationshipType: string,
) {
  const rows = await db
    .select({
      skillId: skillRelationship.skillId,
      relatedSkillId: skillRelationship.relatedSkillId,
      relationshipType: skillRelationship.relationshipType,
    })
    .from(skillRelationship);

  const graph = new Map<number, number[]>();
  const targetType = relationshipType.toLowerCase();

  for (const row of rows) {
    if (row.skillId === skillId) continue;
    if (row.relationshipType.toLowerCase() !== targetType) continue;
    const current = graph.get(row.skillId) ?? [];
    current.push(row.relatedSkillId);
    graph.set(row.skillId, current);
  }

  const stack = [relatedSkillId];
  const visited = new Set<number>();

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === skillId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    stack.push(...(graph.get(current) ?? []));
  }

  return false;
}

async function querySpellFrameworkSkills(
  tradition: Tradition,
): Promise<SpellFrameworkSkill[]> {
  const identity = SPELL_IDENTITY_BY_TRADITION[tradition];

  const parentRows = await db
    .select({ id: skill.id })
    .from(skill)
    .where(inArray(skill.name, [...identity.parentSkillNames]));

  const parentIds = parentRows.map(({ id }) => id);
  if (parentIds.length === 0) return [];

  const relationshipRows = await db
    .select({ childId: skillRelationship.skillId })
    .from(skillRelationship)
    .where(
      and(
        inArray(skillRelationship.relatedSkillId, parentIds),
        eq(skillRelationship.relationshipType, "parent"),
      ),
    );

  const childIds = [...new Set(relationshipRows.map(({ childId }) => childId))];
  if (childIds.length === 0) return [];

  const conditions = [inArray(skill.id, childIds)];
  if (identity.tier !== undefined) {
    conditions.push(eq(skill.tier, identity.tier));
  }

  return db
    .select({
      id: skill.id,
      name: skill.name,
      classification: skill.classification,
      tier: skill.tier,
    })
    .from(skill)
    .where(and(...conditions))
    .orderBy(asc(skill.name), asc(skill.id));
}

export async function listSkills(
  filters: SkillLibraryFilters = {},
): Promise<SkillLibraryResult> {
  await requireGod();

  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(filters.pageSize ?? 40)));
  const conditions = [];
  const search = filters.search?.trim();

  if (search) conditions.push(ilike(skill.name, `%${search}%`));
  if (filters.classification?.trim()) {
    conditions.push(eq(skill.classification, filters.classification.trim()));
  }
  if (filters.tier !== undefined && filters.tier !== null) {
    conditions.push(eq(skill.tier, filters.tier));
  }
  if (filters.primaryAttribute?.trim()) {
    conditions.push(eq(skill.primaryAttribute, filters.primaryAttribute.trim()));
  }
  if (filters.secondaryAttribute?.trim()) {
    conditions.push(eq(skill.secondaryAttribute, filters.secondaryAttribute.trim()));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [countRow] = await db.select({ value: count() }).from(skill).where(where);
  const total = Number(countRow?.value ?? 0);

  const baseRows = await db
    .select({
      id: skill.id,
      name: skill.name,
      classification: skill.classification,
      tier: skill.tier,
      primaryAttribute: skill.primaryAttribute,
      secondaryAttribute: skill.secondaryAttribute,
    })
    .from(skill)
    .where(where)
    .orderBy(asc(skill.name), asc(skill.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const ids = baseRows.map(({ id }) => id);
  if (ids.length === 0) {
    return {
      items: [],
      relationships: [],
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  const relationshipRows = await db
    .select({
      skillId: skillRelationship.skillId,
      relatedSkillId: skillRelationship.relatedSkillId,
      relationshipType: skillRelationship.relationshipType,
      sortOrder: skillRelationship.sortOrder,
    })
    .from(skillRelationship)
    .where(inArray(skillRelationship.skillId, ids))
    .orderBy(asc(skillRelationship.sortOrder), asc(skillRelationship.id));

  const parentIds = [
    ...new Set(
      relationshipRows
        .filter(({ relationshipType }) => relationshipType.toLowerCase() === "parent")
        .map(({ relatedSkillId }) => relatedSkillId),
    ),
  ];

  const parentRows = parentIds.length
    ? await db
        .select({ id: skill.id, name: skill.name })
        .from(skill)
        .where(inArray(skill.id, parentIds))
    : [];

  const parentNames = new Map(parentRows.map((row) => [row.id, row.name]));
  const relationshipsBySkill = new Map<number, SkillRelationshipEdge[]>();

  for (const relationship of relationshipRows) {
    const current = relationshipsBySkill.get(relationship.skillId) ?? [];
    current.push(relationship);
    relationshipsBySkill.set(relationship.skillId, current);
  }

  const extensionRows = await db
    .select({ skillId: skillExtension.skillId })
    .from(skillExtension)
    .where(
      and(
        inArray(skillExtension.skillId, ids),
        eq(skillExtension.extensionType, SPELL_CONSTRUCTION_EXTENSION),
      ),
    );

  const hasSpellConstruction = new Set(extensionRows.map(({ skillId }) => skillId));

  return {
    items: baseRows.map((row) => {
      const relationships = relationshipsBySkill.get(row.id) ?? [];
      return {
        ...row,
        relationshipCount: relationships.length,
        parentNames: relationships
          .filter(({ relationshipType }) => relationshipType.toLowerCase() === "parent")
          .map(({ relatedSkillId }) => parentNames.get(relatedSkillId))
          .filter((name): name is string => Boolean(name)),
        hasSpellConstruction: hasSpellConstruction.has(row.id),
      };
    }),
    relationships: relationshipRows,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getSkillFilterOptions(): Promise<SkillFilterOptions> {
  await requireGod();

  const [classifications, tiers, primaryAttributes, secondaryAttributes] = await Promise.all([
    db.selectDistinct({ value: skill.classification }).from(skill).orderBy(asc(skill.classification)),
    db.selectDistinct({ value: skill.tier }).from(skill).where(sql`${skill.tier} IS NOT NULL`).orderBy(asc(skill.tier)),
    db.selectDistinct({ value: skill.primaryAttribute }).from(skill).where(sql`${skill.primaryAttribute} IS NOT NULL`).orderBy(asc(skill.primaryAttribute)),
    db.selectDistinct({ value: skill.secondaryAttribute }).from(skill).where(sql`${skill.secondaryAttribute} IS NOT NULL`).orderBy(asc(skill.secondaryAttribute)),
  ]);

  return {
    classifications: classifications.map(({ value }) => value).filter(Boolean),
    tiers: tiers.map(({ value }) => value).filter((value): value is number => value !== null),
    primaryAttributes: primaryAttributes.map(({ value }) => value).filter((value): value is string => Boolean(value)),
    secondaryAttributes: secondaryAttributes.map(({ value }) => value).filter((value): value is string => Boolean(value)),
  };
}

export async function getSkill(id: number): Promise<SkillAggregate | null> {
  await requireGod();

  const [row] = await db.select().from(skill).where(eq(skill.id, id)).limit(1);
  if (!row) return null;

  const [relationshipRows, extensionRows] = await Promise.all([
    db
      .select({
        relatedSkillId: skillRelationship.relatedSkillId,
        relationshipType: skillRelationship.relationshipType,
        sortOrder: skillRelationship.sortOrder,
      })
      .from(skillRelationship)
      .where(eq(skillRelationship.skillId, id))
      .orderBy(asc(skillRelationship.sortOrder), asc(skillRelationship.id)),
    db
      .select({
        extensionType: skillExtension.extensionType,
        schemaVersion: skillExtension.schemaVersion,
        dataJson: skillExtension.dataJson,
      })
      .from(skillExtension)
      .where(eq(skillExtension.skillId, id))
      .orderBy(asc(skillExtension.extensionType)),
  ]);

  const relatedIds = relationshipRows.map(({ relatedSkillId }) => relatedSkillId);
  const relatedRows = relatedIds.length
    ? await db
        .select({ id: skill.id, name: skill.name })
        .from(skill)
        .where(inArray(skill.id, relatedIds))
    : [];
  const relatedNames = new Map(relatedRows.map((candidate) => [candidate.id, candidate.name]));

  const extensions = extensionRows.map((extension) => {
    let data: unknown;
    try {
      data = extension.extensionType === SPELL_CONSTRUCTION_EXTENSION
        ? parseSpellDocument(extension.dataJson)
        : JSON.parse(extension.dataJson);
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? error.message
          : `The ${extension.extensionType} extension contains unreadable data.`,
      );
    }

    return {
      extensionType: extension.extensionType,
      schemaVersion: extension.schemaVersion,
      data,
    };
  });

  return {
    id: row.id,
    core: {
      name: row.name,
      classification: row.classification,
      tier: row.tier,
      primaryAttribute: row.primaryAttribute,
      secondaryAttribute: row.secondaryAttribute,
      definition: row.definition,
      sourceSystem: row.sourceSystem,
      sourceExternalId: row.sourceExternalId,
    },
    relationships: relationshipRows.map((relationship) => ({
      ...relationship,
      relatedSkillName: relatedNames.get(relationship.relatedSkillId) ?? `Skill ${relationship.relatedSkillId}`,
    })),
    extensions,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listRelationshipCandidates(
  search: string,
  context: {
    tier: number | null;
    primaryAttribute: string | null;
    secondaryAttribute: string | null;
  },
  excludeId?: number,
): Promise<SkillLibraryItem[]> {
  await requireGod();

  const attributes = [context.primaryAttribute, context.secondaryAttribute]
    .map((value) => value?.trim().toUpperCase() ?? "")
    .filter((value, index, all) => value && value !== "N/A" && all.indexOf(value) === index);

  if (context.tier === null || context.tier <= 1 || attributes.length === 0) return [];

  const rows = await db
    .select({
      id: skill.id,
      name: skill.name,
      classification: skill.classification,
      tier: skill.tier,
      primaryAttribute: skill.primaryAttribute,
      secondaryAttribute: skill.secondaryAttribute,
    })
    .from(skill)
    .where(eq(skill.tier, context.tier - 1))
    .orderBy(asc(skill.name), asc(skill.id));

  const needle = search.trim().toLowerCase();

  return rows
    .filter((row) => row.id !== excludeId)
    .filter((row) => !needle || row.name.toLowerCase().includes(needle))
    .filter((row) =>
      [row.primaryAttribute, row.secondaryAttribute]
        .map((value) => value?.trim().toUpperCase() ?? "")
        .some((value) => attributes.includes(value)),
    )
    .slice(0, 30)
    .map((row) => ({
      ...row,
      relationshipCount: 0,
      parentNames: [],
      hasSpellConstruction: false,
    }));
}

export async function listSpellFrameworkSkills(
  tradition: Tradition,
): Promise<SpellFrameworkSkill[]> {
  await requireGod();
  return querySpellFrameworkSkills(tradition);
}

export async function saveSkill(input: SkillDraft): Promise<SkillAggregate> {
  const session = await requireGod();
  const core = normalizeCore(input.core);
  const relationships = normalizeRelationships(input.id, input.relationships);

  if (input.id !== undefined) {
    for (const relationship of relationships) {
      if (
        await wouldCreateCircularPath(
          input.id,
          relationship.relatedSkillId,
          relationship.relationshipType,
        )
      ) {
        throw new Error(
          `Adding ${relationship.relatedSkillName ?? "that relationship"} would create a circular path.`,
        );
      }
    }
  }

  const seenExtensions = new Set<string>();
  const extensions = [] as Array<{
    extensionType: string;
    schemaVersion: number;
    dataJson: string;
  }>;

  for (const extension of input.extensions) {
    const extensionType = extension.extensionType.trim();
    if (!extensionType) throw new Error("Skill extension type is required.");
    if (seenExtensions.has(extensionType)) {
      throw new Error(`Only one ${extensionType} extension may be attached to a Skill.`);
    }
    seenExtensions.add(extensionType);

    if (!Number.isInteger(extension.schemaVersion) || extension.schemaVersion < 1) {
      throw new Error("Skill extension schema version is invalid.");
    }

    if (extensionType === SPELL_CONSTRUCTION_EXTENSION) {
      const document = withCalculationSnapshot({
        ...parseSpellDocument(extension.data),
        name: core.name,
      });

      if (document.frameworkSkillId) {
        const eligible = await querySpellFrameworkSkills(document.tradition);
        if (!eligible.some(({ id }) => id === document.frameworkSkillId)) {
          const identity = SPELL_IDENTITY_BY_TRADITION[document.tradition];
          throw new Error(
            `The selected ${identity.label} is no longer attached to the required Skill tree.`,
          );
        }
      }

      extensions.push({
        extensionType,
        schemaVersion: SPELL_SCHEMA_VERSION,
        dataJson: JSON.stringify(document),
      });
      continue;
    }

    let dataJson: string;
    try {
      dataJson = JSON.stringify(extension.data);
    } catch {
      throw new Error(`The ${extensionType} extension cannot be serialized.`);
    }

    extensions.push({
      extensionType,
      schemaVersion: extension.schemaVersion,
      dataJson,
    });
  }

  const savedId = await db.transaction(async (tx) => {
    let id = input.id;

    if (id === undefined) {
      const [created] = await tx
        .insert(skill)
        .values({
          ...core,
          createdByUserId: session.user.id,
        })
        .returning({ id: skill.id });
      id = created.id;
    } else {
      const updated = await tx
        .update(skill)
        .set({
          ...core,
          updatedAt: new Date(),
        })
        .where(eq(skill.id, id))
        .returning({ id: skill.id });

      if (updated.length === 0) throw new Error("That Skill no longer exists.");
    }

    await tx.delete(skillRelationship).where(eq(skillRelationship.skillId, id));
    await tx.delete(skillExtension).where(eq(skillExtension.skillId, id));

    if (relationships.length > 0) {
      await tx.insert(skillRelationship).values(
        relationships.map((relationship) => ({
          skillId: id!,
          relatedSkillId: relationship.relatedSkillId,
          relationshipType: relationship.relationshipType,
          sortOrder: relationship.sortOrder,
        })),
      );
    }

    if (extensions.length > 0) {
      await tx.insert(skillExtension).values(
        extensions.map((extension) => ({
          skillId: id!,
          extensionType: extension.extensionType,
          schemaVersion: extension.schemaVersion,
          dataJson: extension.dataJson,
        })),
      );
    }

    return id;
  });

  revalidatePath("/heavens/skills");
  const saved = await getSkill(savedId);
  if (!saved) throw new Error("The saved Skill could not be reloaded.");
  return saved;
}

export async function deleteSkill(id: number): Promise<void> {
  await requireGod();
  await db.delete(skill).where(eq(skill.id, id));
  revalidatePath("/heavens/skills");
}
