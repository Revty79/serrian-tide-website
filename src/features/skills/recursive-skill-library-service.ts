import "server-only";

import { asc, count, inArray } from "drizzle-orm";

import { db } from "@/db";
import { creatureSkillLink } from "@/db/creature-schema";
import { derivedAbilityRequirement } from "@/db/derived-ability-schema";
import { weaponSkillPathMapping } from "@/db/item-schema";
import { raceSkillLink } from "@/db/race-schema";
import { campaignCharacterSkillAllocation } from "@/db/realm-schema";
import { skill, skillRelationship } from "@/db/skill-schema";
import {
  campaignSessionCalledCheckBatch,
  defenseSkillPathMapping,
} from "@/db/tabletop-operations-schema";

import {
  buildRecursiveSkillLibrary,
  type RecursiveSkillLibrary,
} from "./recursive-skill-library";

export type SkillConsumerImpact = Readonly<{
  characterAllocations: number;
  raceReferences: number;
  weaponGovernanceEndpoints: number;
  defenseGovernanceEndpoints: number;
  calledCheckReferences: number;
  derivedAbilityRequirements: number;
  creatureReferences: number;
  total: number;
}>;

export async function loadRecursiveSkillLibrary(): Promise<RecursiveSkillLibrary> {
  const skillRows = await db
    .select({
      id: skill.id,
      name: skill.name,
      classification: skill.classification,
      tier: skill.tier,
      primaryAttribute: skill.primaryAttribute,
      secondaryAttribute: skill.secondaryAttribute,
      definition: skill.definition,
      sourceSystem: skill.sourceSystem,
      sourceExternalId: skill.sourceExternalId,
    })
    .from(skill)
    .orderBy(asc(skill.name), asc(skill.id));

  const relationshipRows = await db
    .select({
      id: skillRelationship.id,
      skillId: skillRelationship.skillId,
      relatedSkillId: skillRelationship.relatedSkillId,
      relationshipType: skillRelationship.relationshipType,
      sortOrder: skillRelationship.sortOrder,
    })
    .from(skillRelationship)
    .orderBy(
      asc(skillRelationship.skillId),
      asc(skillRelationship.sortOrder),
      asc(skillRelationship.id),
    );

  return buildRecursiveSkillLibrary(skillRows, relationshipRows);
}

export async function loadSkillConsumerImpact(
  skillIds: readonly number[],
): Promise<SkillConsumerImpact> {
  const ids = [...new Set(skillIds)];
  if (ids.length === 0) {
    return {
      characterAllocations: 0,
      raceReferences: 0,
      weaponGovernanceEndpoints: 0,
      defenseGovernanceEndpoints: 0,
      calledCheckReferences: 0,
      derivedAbilityRequirements: 0,
      creatureReferences: 0,
      total: 0,
    };
  }

  const [characterRows] = await db
    .select({ value: count() })
    .from(campaignCharacterSkillAllocation)
    .where(inArray(campaignCharacterSkillAllocation.skillId, ids));
  const [raceRows] = await db
    .select({ value: count() })
    .from(raceSkillLink)
    .where(inArray(raceSkillLink.skillId, ids));
  const [weaponRows] = await db
    .select({ value: count() })
    .from(weaponSkillPathMapping)
    .where(inArray(weaponSkillPathMapping.endpointSkillId, ids));
  const [defenseRows] = await db
    .select({ value: count() })
    .from(defenseSkillPathMapping)
    .where(inArray(defenseSkillPathMapping.endpointSkillId, ids));
  const [calledCheckRows] = await db
    .select({ value: count() })
    .from(campaignSessionCalledCheckBatch)
    .where(inArray(campaignSessionCalledCheckBatch.endpointSkillId, ids));
  const [derivedAbilityRows] = await db
    .select({ value: count() })
    .from(derivedAbilityRequirement)
    .where(inArray(derivedAbilityRequirement.skillId, ids));
  const [creatureRows] = await db
    .select({ value: count() })
    .from(creatureSkillLink)
    .where(inArray(creatureSkillLink.skillId, ids));

  const impact = {
    characterAllocations: Number(characterRows?.value ?? 0),
    raceReferences: Number(raceRows?.value ?? 0),
    weaponGovernanceEndpoints: Number(weaponRows?.value ?? 0),
    defenseGovernanceEndpoints: Number(defenseRows?.value ?? 0),
    calledCheckReferences: Number(calledCheckRows?.value ?? 0),
    derivedAbilityRequirements: Number(derivedAbilityRows?.value ?? 0),
    creatureReferences: Number(creatureRows?.value ?? 0),
  };

  return {
    ...impact,
    total: Object.values(impact).reduce((sum, value) => sum + value, 0),
  };
}
