"use server";

import {
  and,
  asc,
  count,
  eq,
  ilike,
  inArray,
  or,
  sql,
} from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import {
  skill,
  skillExtension,
  skillRelationship,
} from "@/db/skill-schema";
import { auth } from "@/lib/auth";

export type SkillLibraryFilters = {
  search?: string;
  classification?: string;
  tier?: number;
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

export async function listSkills(
  filters: SkillLibraryFilters = {},
): Promise<SkillLibraryResult> {
  await requireGod();

  const page = Math.max(
    1,
    Math.trunc(filters.page ?? 1),
  );

  const pageSize = Math.min(
    100,
    Math.max(
      1,
      Math.trunc(filters.pageSize ?? 40),
    ),
  );

  const conditions = [];

  const search = filters.search?.trim();

  if (search) {
    conditions.push(
      ilike(skill.name, `%${search}%`),
    );
  }

  if (filters.classification?.trim()) {
    conditions.push(
      eq(
        skill.classification,
        filters.classification.trim(),
      ),
    );
  }

  if (filters.tier !== undefined) {
    conditions.push(
      eq(skill.tier, filters.tier),
    );
  }

  if (filters.primaryAttribute?.trim()) {
    conditions.push(
      eq(
        skill.primaryAttribute,
        filters.primaryAttribute.trim(),
      ),
    );
  }

  if (filters.secondaryAttribute?.trim()) {
    conditions.push(
      eq(
        skill.secondaryAttribute,
        filters.secondaryAttribute.trim(),
      ),
    );
  }

  const where =
    conditions.length > 0
      ? and(...conditions)
      : undefined;

  const [countRow] = await db
    .select({
      value: count(),
    })
    .from(skill)
    .where(where);

  const total = Number(countRow?.value ?? 0);

  const baseRows = await db
    .select({
      id: skill.id,
      name: skill.name,
      classification: skill.classification,
      tier: skill.tier,
      primaryAttribute: skill.primaryAttribute,
      secondaryAttribute:
        skill.secondaryAttribute,
    })
    .from(skill)
    .where(where)
    .orderBy(
      asc(skill.name),
      asc(skill.id),
    )
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
      pageCount: Math.max(
        1,
        Math.ceil(total / pageSize),
      ),
    };
  }

  const relationshipRows = await db
    .select({
      skillId: skillRelationship.skillId,
      relatedSkillId:
        skillRelationship.relatedSkillId,
      relationshipType:
        skillRelationship.relationshipType,
      sortOrder: skillRelationship.sortOrder,
    })
    .from(skillRelationship)
    .where(
      inArray(skillRelationship.skillId, ids),
    )
    .orderBy(
      asc(skillRelationship.sortOrder),
      asc(skillRelationship.id),
    );

  const parentIds = [
    ...new Set(
      relationshipRows
        .filter(
          ({ relationshipType }) =>
            relationshipType.toLowerCase() ===
            "parent",
        )
        .map(
          ({ relatedSkillId }) =>
            relatedSkillId,
        ),
    ),
  ];

  const parentRows =
    parentIds.length > 0
      ? await db
          .select({
            id: skill.id,
            name: skill.name,
          })
          .from(skill)
          .where(inArray(skill.id, parentIds))
      : [];

  const parentNames = new Map(
    parentRows.map((row) => [
      row.id,
      row.name,
    ]),
  );

  const relationshipsBySkill =
    new Map<
      number,
      SkillRelationshipEdge[]
    >();

  for (const relationship of relationshipRows) {
    const current =
      relationshipsBySkill.get(
        relationship.skillId,
      ) ?? [];

    current.push(relationship);

    relationshipsBySkill.set(
      relationship.skillId,
      current,
    );
  }

  const extensionRows = await db
    .select({
      skillId: skillExtension.skillId,
    })
    .from(skillExtension)
    .where(
      and(
        inArray(skillExtension.skillId, ids),
        eq(
          skillExtension.extensionType,
          "spell-construction",
        ),
      ),
    );

  const hasSpellConstruction = new Set(
    extensionRows.map(({ skillId }) => skillId),
  );

  const items: SkillLibraryItem[] =
    baseRows.map((row) => {
      const relationships =
        relationshipsBySkill.get(row.id) ?? [];

      const parents = relationships
        .filter(
          ({ relationshipType }) =>
            relationshipType.toLowerCase() ===
            "parent",
        )
        .map(({ relatedSkillId }) =>
          parentNames.get(relatedSkillId),
        )
        .filter(
          (name): name is string =>
            Boolean(name),
        );

      return {
        ...row,
        relationshipCount:
          relationships.length,
        parentNames: parents,
        hasSpellConstruction:
          hasSpellConstruction.has(row.id),
      };
    });

  return {
    items,
    relationships: relationshipRows,
    total,
    page,
    pageSize,
    pageCount: Math.max(
      1,
      Math.ceil(total / pageSize),
    ),
  };
}

export async function getSkillFilterOptions():
Promise<SkillFilterOptions> {
  await requireGod();

  const [
    classifications,
    tiers,
    primaryAttributes,
    secondaryAttributes,
  ] = await Promise.all([
    db
      .selectDistinct({
        value: skill.classification,
      })
      .from(skill)
      .orderBy(asc(skill.classification)),

    db
      .selectDistinct({
        value: skill.tier,
      })
      .from(skill)
      .where(
        sql`${skill.tier} IS NOT NULL`,
      )
      .orderBy(asc(skill.tier)),

    db
      .selectDistinct({
        value: skill.primaryAttribute,
      })
      .from(skill)
      .where(
        sql`
          ${skill.primaryAttribute}
          IS NOT NULL
        `,
      )
      .orderBy(
        asc(skill.primaryAttribute),
      ),

    db
      .selectDistinct({
        value: skill.secondaryAttribute,
      })
      .from(skill)
      .where(
        sql`
          ${skill.secondaryAttribute}
          IS NOT NULL
        `,
      )
      .orderBy(
        asc(skill.secondaryAttribute),
      ),
  ]);

  return {
    classifications: classifications
      .map(({ value }) => value)
      .filter(Boolean),

    tiers: tiers
      .map(({ value }) => value)
      .filter(
        (value): value is number =>
          value !== null,
      ),

    primaryAttributes: primaryAttributes
      .map(({ value }) => value)
      .filter(
        (value): value is string =>
          Boolean(value),
      ),

    secondaryAttributes:
      secondaryAttributes
        .map(({ value }) => value)
        .filter(
          (value): value is string =>
            Boolean(value),
        ),
  };
}