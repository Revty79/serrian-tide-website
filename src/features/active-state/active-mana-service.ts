import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import { race, raceSkillLink } from "@/db/race-schema";
import {
  campaignCharacter,
  campaignCharacterActiveMana,
  campaignCharacterProfile,
  campaignCharacterSkillAllocation,
} from "@/db/realm-schema";
import { skill } from "@/db/skill-schema";
import {
  getCharacterManaProfiles,
  type CharacterMagicSystem,
  type CharacterManaProfile,
} from "@/features/characters/character-rules";
import type {
  CharacterRaceAggregate,
  CharacterSkillReference,
} from "@/features/characters/models";
import { requireSession } from "@/lib/server-access";

import {
  isCharacterMagicSystem,
  requireActiveManaPool,
  resolveActiveManaView,
  restoreActiveManaPool,
  restoreActiveManaPoolFull,
  spendActiveManaPool,
  type ActiveManaPool,
  type ActiveManaView,
  type PersistedActiveManaState,
} from "./active-mana";
import { canMutateActiveHealth } from "./authorization";
import type { ActiveHealthTransaction } from "./active-health-service";

export type ActiveManaTransaction = ActiveHealthTransaction;

export type ActiveManaMutationCommand = {
  characterId: number;
  system: CharacterMagicSystem;
  amount: number;
};

export type ActiveManaPoolCommand = {
  characterId: number;
  system: CharacterMagicSystem;
};

type LockedManaPool = {
  pool: ActiveManaPool;
};

function assertCharacterId(characterId: number): void {
  if (!Number.isInteger(characterId) || characterId <= 0) {
    throw new Error("Active Mana requires a saved Character.");
  }
}

function requireMagicSystem(system: CharacterMagicSystem): CharacterMagicSystem {
  if (!isCharacterMagicSystem(system)) throw new Error("Active Mana system is invalid.");
  return system;
}

async function loadDerivedManaProfiles(
  tx: ActiveManaTransaction,
  characterId: number,
): Promise<CharacterManaProfile[]> {
  const [profile] = await tx
    .select({
      raceId: campaignCharacterProfile.raceId,
      baseMagicSteps: campaignCharacterProfile.baseMagicSteps,
    })
    .from(campaignCharacterProfile)
    .where(eq(campaignCharacterProfile.characterId, characterId))
    .limit(1);
  if (!profile) throw new Error("The Character Mana profile source is missing.");

  const allocationRows = await tx
      .select({
        draftId: campaignCharacterSkillAllocation.id,
        skillId: campaignCharacterSkillAllocation.skillId,
        parentDraftId: campaignCharacterSkillAllocation.parentAllocationId,
        points: campaignCharacterSkillAllocation.points,
      })
      .from(campaignCharacterSkillAllocation)
      .where(eq(campaignCharacterSkillAllocation.characterId, characterId))
      .orderBy(asc(campaignCharacterSkillAllocation.id));
  const skillRows = await tx
      .select({
        id: skill.id,
        name: skill.name,
        classification: skill.classification,
        tier: skill.tier,
        primaryAttribute: skill.primaryAttribute,
        secondaryAttribute: skill.secondaryAttribute,
        definition: skill.definition,
      })
      .from(skill)
      .orderBy(asc(skill.name), asc(skill.id));
  const skillCatalog: CharacterSkillReference[] = skillRows.map((row) => ({
    ...row,
    spellLevel: null,
    manaCost: null,
    spellDocumentJson: null,
  }));

  let selectedRace: CharacterRaceAggregate | null = null;
  if (profile.raceId !== null) {
    const raceRows = await tx
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
        .where(eq(race.id, profile.raceId))
        .limit(1);
    const links = await tx
        .select({
          skillId: raceSkillLink.skillId,
          skillName: skill.name,
          skillClassification: skill.classification,
          linkType: raceSkillLink.linkType,
          value: raceSkillLink.value,
        })
        .from(raceSkillLink)
        .innerJoin(skill, eq(skill.id, raceSkillLink.skillId))
        .where(eq(raceSkillLink.raceId, profile.raceId))
        .orderBy(asc(raceSkillLink.sortOrder), asc(raceSkillLink.id));
    const raceRow = raceRows[0];
    if (!raceRow) throw new Error("The Character's selected Race is missing.");
    selectedRace = {
      race: raceRow,
      attributeCaps: [],
      movementModes: [],
      skillLinks: links,
    };
  }

  return getCharacterManaProfiles(
    { skillAllocations: allocationRows },
    skillCatalog,
    selectedRace,
    profile.baseMagicSteps,
  );
}

async function readPersistedMana(
  tx: ActiveManaTransaction,
  characterId: number,
): Promise<PersistedActiveManaState[]> {
  const rows = await tx
    .select({
      system: campaignCharacterActiveMana.system,
      manaSpent: campaignCharacterActiveMana.manaSpent,
    })
    .from(campaignCharacterActiveMana)
    .where(eq(campaignCharacterActiveMana.characterId, characterId));
  return rows.map((row) => {
    if (!isCharacterMagicSystem(row.system)) {
      throw new Error(`Persisted Active Mana system ${JSON.stringify(row.system)} is invalid.`);
    }
    return { system: row.system, manaSpent: row.manaSpent };
  });
}

export async function readActiveManaInTransaction(
  tx: ActiveManaTransaction,
  characterId: number,
): Promise<ActiveManaView> {
  assertCharacterId(characterId);
  const profiles = await loadDerivedManaProfiles(tx, characterId);
  const persisted = await readPersistedMana(tx, characterId);
  return resolveActiveManaView(characterId, profiles, persisted);
}

async function lockActiveManaPoolInTransaction(
  tx: ActiveManaTransaction,
  characterId: number,
  systemInput: CharacterMagicSystem,
): Promise<LockedManaPool> {
  assertCharacterId(characterId);
  const system = requireMagicSystem(systemInput);
  const profiles = await loadDerivedManaProfiles(tx, characterId);
  if (!profiles.some((profile) => profile.system === system)) {
    throw new Error(`${system} does not currently resolve to a valid Mana pool for this Character.`);
  }
  await tx
    .insert(campaignCharacterActiveMana)
    .values({ characterId, system, manaSpent: 0 })
    .onConflictDoNothing({
      target: [campaignCharacterActiveMana.characterId, campaignCharacterActiveMana.system],
    });
  const [stored] = await tx
    .select({
      system: campaignCharacterActiveMana.system,
      manaSpent: campaignCharacterActiveMana.manaSpent,
    })
    .from(campaignCharacterActiveMana)
    .where(and(
      eq(campaignCharacterActiveMana.characterId, characterId),
      eq(campaignCharacterActiveMana.system, system),
    ))
    .limit(1)
    .for("update");
  if (!stored || !isCharacterMagicSystem(stored.system)) {
    throw new Error(`${system} Active Mana state could not be initialized.`);
  }
  const view = resolveActiveManaView(characterId, profiles, [{
    system: stored.system,
    manaSpent: stored.manaSpent,
  }]);
  return { pool: requireActiveManaPool(view, system) };
}

async function persistManaSpent(
  tx: ActiveManaTransaction,
  characterId: number,
  pool: ActiveManaPool,
): Promise<ActiveManaPool> {
  const updated = await tx
    .update(campaignCharacterActiveMana)
    .set({ manaSpent: pool.manaSpent, updatedAt: new Date() })
    .where(and(
      eq(campaignCharacterActiveMana.characterId, characterId),
      eq(campaignCharacterActiveMana.system, pool.system),
    ))
    .returning({ system: campaignCharacterActiveMana.system });
  if (!updated.length) throw new Error(`${pool.system} Active Mana state changed before it could be saved.`);
  return pool;
}

export async function spendActiveManaInTransaction(
  tx: ActiveManaTransaction,
  command: ActiveManaMutationCommand,
): Promise<ActiveManaPool> {
  const locked = await lockActiveManaPoolInTransaction(
    tx,
    command.characterId,
    command.system,
  );
  return persistManaSpent(
    tx,
    command.characterId,
    spendActiveManaPool(locked.pool, command.amount),
  );
}

export async function restoreActiveManaInTransaction(
  tx: ActiveManaTransaction,
  command: ActiveManaMutationCommand,
): Promise<ActiveManaPool> {
  const locked = await lockActiveManaPoolInTransaction(
    tx,
    command.characterId,
    command.system,
  );
  return persistManaSpent(
    tx,
    command.characterId,
    restoreActiveManaPool(locked.pool, command.amount),
  );
}

export async function restoreActiveManaPoolInTransaction(
  tx: ActiveManaTransaction,
  command: ActiveManaPoolCommand,
): Promise<ActiveManaPool> {
  const locked = await lockActiveManaPoolInTransaction(
    tx,
    command.characterId,
    command.system,
  );
  return persistManaSpent(
    tx,
    command.characterId,
    restoreActiveManaPoolFull(locked.pool),
  );
}

export async function restoreAllActiveManaInTransaction(
  tx: ActiveManaTransaction,
  characterId: number,
): Promise<ActiveManaView> {
  assertCharacterId(characterId);
  const profiles = await loadDerivedManaProfiles(tx, characterId);
  const systems = profiles.map(({ system }) => system).sort();
  for (const system of systems) {
    await tx
      .insert(campaignCharacterActiveMana)
      .values({ characterId, system, manaSpent: 0 })
      .onConflictDoNothing({
        target: [campaignCharacterActiveMana.characterId, campaignCharacterActiveMana.system],
      });
    await tx
      .select({ system: campaignCharacterActiveMana.system })
      .from(campaignCharacterActiveMana)
      .where(and(
        eq(campaignCharacterActiveMana.characterId, characterId),
        eq(campaignCharacterActiveMana.system, system),
      ))
      .limit(1)
      .for("update");
  }
  if (systems.length) {
    await tx
      .update(campaignCharacterActiveMana)
      .set({ manaSpent: 0, updatedAt: new Date() })
      .where(and(
        eq(campaignCharacterActiveMana.characterId, characterId),
        inArray(campaignCharacterActiveMana.system, systems),
      ));
  }
  return resolveActiveManaView(characterId, profiles, []);
}

async function withAuthorizedManaTransaction<T>(
  characterId: number,
  operation: (tx: ActiveManaTransaction) => Promise<T>,
): Promise<T> {
  assertCharacterId(characterId);
  const session = await requireSession();
  return db.transaction(async (tx) => {
    const roles = await tx
      .select({ role: userRole.role })
      .from(userRole)
      .where(eq(userRole.userId, session.user.id));
    const [entity] = await tx
      .select({
        playerUserId: campaignCharacter.playerUserId,
        campaignOwnerUserId: campaign.createdByUserId,
        isNpc: campaignCharacter.isNpc,
        membershipUserId: campaignPlayer.userId,
      })
      .from(campaignCharacter)
      .innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
      .leftJoin(
        campaignPlayer,
        and(
          eq(campaignPlayer.campaignId, campaignCharacter.campaignId),
          eq(campaignPlayer.userId, session.user.id),
        ),
      )
      .where(eq(campaignCharacter.id, characterId))
      .limit(1)
      .for("update", { of: campaignCharacter });
    if (!entity) throw new Error("Character not found.");
    if (!canMutateActiveHealth(
      { userId: session.user.id, roles: roles.map(({ role }) => role) },
      {
        playerUserId: entity.playerUserId,
        campaignOwnerUserId: entity.campaignOwnerUserId,
        isNpc: entity.isNpc,
        isCampaignMember: entity.membershipUserId === session.user.id,
      },
    )) {
      throw new Error("You do not have permission to manage this Character's Active Mana.");
    }
    return operation(tx);
  });
}

export async function getActiveMana(characterId: number): Promise<ActiveManaView> {
  return withAuthorizedManaTransaction(characterId, (tx) => (
    readActiveManaInTransaction(tx, characterId)
  ));
}

export async function spendCharacterMana(
  command: ActiveManaMutationCommand,
): Promise<ActiveManaView> {
  return withAuthorizedManaTransaction(command.characterId, async (tx) => {
    await spendActiveManaInTransaction(tx, command);
    return readActiveManaInTransaction(tx, command.characterId);
  });
}

export async function restoreCharacterMana(
  command: ActiveManaMutationCommand,
): Promise<ActiveManaView> {
  return withAuthorizedManaTransaction(command.characterId, async (tx) => {
    await restoreActiveManaInTransaction(tx, command);
    return readActiveManaInTransaction(tx, command.characterId);
  });
}

export async function restoreCharacterManaPool(
  command: ActiveManaPoolCommand,
): Promise<ActiveManaView> {
  return withAuthorizedManaTransaction(command.characterId, async (tx) => {
    await restoreActiveManaPoolInTransaction(tx, command);
    return readActiveManaInTransaction(tx, command.characterId);
  });
}

export async function restoreAllCharacterMana(characterId: number): Promise<ActiveManaView> {
  return withAuthorizedManaTransaction(characterId, (tx) => (
    restoreAllActiveManaInTransaction(tx, characterId)
  ));
}
