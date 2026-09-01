import "server-only";

import { eq } from "drizzle-orm";

import type { db } from "@/db";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import {
  CREATURE_CR_IMPACTS,
  CREATURE_SIZE_OPTIONS,
  type CreatureCrImpact,
  type CreatureSize,
} from "@/db/creature-schema";
import {
  campaignCharacter,
  campaignCharacterAttribute,
  campaignCharacterProfile,
  campaignCreatureNpcProfile,
} from "@/db/realm-schema";
import type { CreatureAggregate, CreatureDraft } from "@/app/heavens/creatures/actions";
import { CHARACTER_ATTRIBUTE_KEYS } from "@/features/characters/models";

import {
  copyCreatureAbility,
  normalizeCreatureSnapshotAbilities,
} from "./creature-ability";
import { normalizeCreatureHpSnapshot } from "./creature-size-rules";

export type CreatureNpcConstructorTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function nonnegativeSteps(value: number | null | undefined, label: string): number {
  const normalized = value ?? 0;
  if (!Number.isInteger(normalized) || normalized < 0) {
    throw new Error(`${label} must be a whole number zero or greater.`);
  }
  return normalized;
}

export function normalizeCreatureNpcSnapshotCore(
  core: CreatureDraft["core"],
): CreatureDraft["core"] {
  const size = core.size as CreatureSize;
  if (!CREATURE_SIZE_OPTIONS.includes(size)) {
    throw new Error(`Creature Size must be one of: ${CREATURE_SIZE_OPTIONS.join(", ")}.`);
  }
  return {
    ...core,
    size,
    hpMultiplierSteps: nonnegativeSteps(core.hpMultiplierSteps, "HP Multiplier Steps"),
    baseMovementSteps: nonnegativeSteps(core.baseMovementSteps, "Base Movement Steps"),
    baseMagicSteps: nonnegativeSteps(core.baseMagicSteps, "Base Magic Steps"),
  };
}

export function normalizeCreatureNpcSnapshot(
  snapshot: CreatureDraft,
  hpAdjustment: number,
): CreatureDraft {
  const core = normalizeCreatureNpcSnapshotCore(snapshot.core);
  return normalizeCreatureHpSnapshot({
    ...snapshot,
    core,
    hpPools: snapshot.hpPools.map((pool) => ({ ...pool, maximumHp: null })),
  }, hpAdjustment);
}

export function buildCreatureNpcSnapshot(template: CreatureAggregate): CreatureDraft {
  return normalizeCreatureNpcSnapshot({
    id: template.id,
    core: { ...template.core },
    attributes: template.attributes.map((row) => ({ ...row })),
    movement: template.movement.map((row) => ({ ...row })),
    hpPools: template.hpPools.map((row) => ({ ...row })),
    hitLocations: template.hitLocations.map((row) => ({ ...row })),
    attacks: template.attacks.map((row) => ({ ...row })),
    skillLinks: template.skillLinks.map((row) => ({ ...row })),
    abilities: template.abilities.map((row) => ({
      ...copyCreatureAbility(row),
      crImpact: row.crImpact as CreatureCrImpact,
    })),
    defenses: template.defenses.map((row) => ({ ...row })),
    uses: template.uses.map((row) => ({ ...row })),
    derivedCreatures: [],
  }, 0);
}

export function parseCreatureNpcSnapshot(
  value: string,
  label: string,
  hpAdjustment = 0,
): CreatureDraft {
  try {
    const parsed = JSON.parse(value) as CreatureDraft;
    const normalized = normalizeCreatureSnapshotAbilities(parsed);
    return normalizeCreatureNpcSnapshot({
      ...parsed,
      abilities: normalized.abilities.map((ability) => ({
        ...ability,
        crImpact: CREATURE_CR_IMPACTS.includes(ability.crImpact as CreatureCrImpact)
          ? ability.crImpact as CreatureCrImpact
          : "None",
      })),
    }, hpAdjustment);
  } catch (error) {
    throw new Error(`${label} contains invalid Creature data: ${error instanceof Error ? error.message : "Unreadable snapshot."}`);
  }
}

/** Canonical Creature NPC persistence boundary shared by NPC management and Encounter spawning. */
export async function createCreatureNpcInTransaction(
  tx: CreatureNpcConstructorTransaction,
  input: {
    campaignId: number;
    controllerUserId: string;
    creatureId: number;
    name: string;
    snapshot: CreatureDraft;
  },
): Promise<number> {
  const [campaignRow] = await tx.select({
    id: campaign.id,
    startingCredits: campaign.startingCreditAmount,
  }).from(campaign).where(eq(campaign.id, input.campaignId)).limit(1).for("update");
  if (!campaignRow) throw new Error("Campaign not found.");
  const name = input.name.trim();
  if (!name) throw new Error("Creature NPC name is required.");
  const snapshot = normalizeCreatureNpcSnapshot(input.snapshot, 0);
  await tx.insert(campaignPlayer).values({
    campaignId: input.campaignId,
    userId: input.controllerUserId,
    isNpcController: true,
  }).onConflictDoNothing();
  const [created] = await tx.insert(campaignCharacter).values({
    campaignId: input.campaignId,
    playerUserId: input.controllerUserId,
    name,
    isNpc: true,
    npcKind: "creature",
  }).returning({ id: campaignCharacter.id });
  if (!created) throw new Error("Creature NPC Character could not be created.");
  await tx.insert(campaignCharacterProfile).values({
    characterId: created.id,
    creditsRemaining: campaignRow.startingCredits,
  });
  await tx.insert(campaignCharacterAttribute).values(
    CHARACTER_ATTRIBUTE_KEYS.map((attributeKey) => ({
      characterId: created.id,
      attributeKey,
      value: 25,
    })),
  );
  await tx.insert(campaignCreatureNpcProfile).values({
    characterId: created.id,
    creatureId: input.creatureId,
    personality: "",
    instanceNotes: "",
    hpAdjustment: 0,
    baselineSnapshotJson: JSON.stringify(snapshot),
    currentSnapshotJson: JSON.stringify(snapshot),
  });
  return created.id;
}
