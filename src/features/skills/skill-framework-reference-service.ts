import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { SPELL_IDENTITY_BY_TRADITION } from "@/features/spell-construction/data/spellIdentity";
import type { Tradition } from "@/features/spell-construction/models/spell";

export type SkillFrameworkReferenceTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

type FrameworkSkillRow = {
  id: number;
  archived_at: Date | string | null;
  tier: number | null;
};

type ParentSkillRow = { id: number };

function ineligibleFrameworkMessage(tradition: Tradition): string {
  const identity = SPELL_IDENTITY_BY_TRADITION[tradition];
  return `The selected ${identity.label} is no longer attached to the required Skill tree.`;
}

/**
 * Locks and validates a serialized spell document's semantic Skill reference.
 *
 * The key-share lock permits concurrent reference writers but conflicts with
 * lifecycle's `FOR UPDATE` lock. Whichever side obtains the Skill row first
 * therefore completes its authoritative validation before the other proceeds.
 */
export async function lockSpellFrameworkSkillReferenceInTransaction(
  tx: SkillFrameworkReferenceTransaction,
  frameworkSkillId: number | undefined,
  tradition: Tradition,
): Promise<void> {
  if (frameworkSkillId === undefined) return;

  const identity = SPELL_IDENTITY_BY_TRADITION[tradition];
  if (!Number.isInteger(frameworkSkillId) || frameworkSkillId <= 0) {
    throw new Error(`The selected ${identity.label} Skill is invalid.`);
  }

  const lockedResult = await tx.execute(sql<FrameworkSkillRow>`
    select candidate.id, candidate.archived_at, candidate.tier
    from skill candidate
    where candidate.id = ${frameworkSkillId}
    for key share of candidate
  `);
  const locked = lockedResult.rows[0] as FrameworkSkillRow | undefined;
  if (!locked) {
    throw new Error(`The selected ${identity.label} Skill no longer exists.`);
  }
  if (locked.archived_at !== null) {
    throw new Error(
      `The selected ${identity.label} Skill is archived. Restore it before saving this spell.`,
    );
  }
  if (identity.tier !== undefined && locked.tier !== identity.tier) {
    throw new Error(ineligibleFrameworkMessage(tradition));
  }

  const parentNames = sql.join(
    identity.parentSkillNames.map((name) => sql`${name}`),
    sql`, `,
  );
  const parentResult = await tx.execute(sql<ParentSkillRow>`
    select parent.id
    from skill_relationship relationship
    inner join skill parent on parent.id = relationship.related_skill_id
    where relationship.skill_id = ${frameworkSkillId}
      and relationship.relationship_type = 'parent'
      and parent.archived_at is null
      and parent.name in (${parentNames})
    for key share of relationship, parent
  `);
  if (parentResult.rows.length === 0) {
    throw new Error(ineligibleFrameworkMessage(tradition));
  }
}
