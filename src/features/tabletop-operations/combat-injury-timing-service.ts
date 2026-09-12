import "server-only";
import { and, eq } from "drizzle-orm";
import { campaignCharacter, campaignCharacterActiveHealthPool } from "@/db/realm-schema";
import { weaponProfile } from "@/db/item-schema";
import { campaignSessionEncounterParticipant as member } from "@/db/tabletop-operations-schema";
import { readActiveHealthInTransaction } from "@/features/active-state/active-health-service";
import { combatObject as object } from "./combat-condition-state";
import { combatLimbConditions } from "./combat-limb-state";
import { weaponInjuryTiming, type TimingLimb } from "./combat-injury-timing";
import type { RuntimeIntegrationTransaction as Tx } from "./runtime-integration-service";

export async function readTimingLimbsInTransaction(tx: Tx, encounterId: number, participantId: number): Promise<TimingLimb[]> {
  const [row] = await tx.select({ local: member.localStateJson, snapshot: member.creatureSnapshotJson, npcKind: campaignCharacter.npcKind })
    .from(member).leftJoin(campaignCharacter, eq(campaignCharacter.id, member.characterId))
    .where(and(eq(member.encounterId, encounterId), eq(member.characterId, participantId)));
  if (!row) throw new Error("Injury timing requires an exact encounter combatant.");
  const conditions = combatLimbConditions(row.local).filter((entry) => !entry.recoveredAt);
  if (participantId > 0) {
    const localized = await tx.select({ damage: campaignCharacterActiveHealthPool.damage }).from(campaignCharacterActiveHealthPool)
      .where(eq(campaignCharacterActiveHealthPool.characterId, participantId));
    if (!conditions.length && !localized.some((entry) => entry.damage > 0)) return [];
    const health = await readActiveHealthInTransaction(tx, participantId, row.npcKind ?? "race");
    return health.anatomy.pools.map((pool) => ({ key: pool.key, name: pool.name,
      disabled: conditions.some((entry) => entry.poolKey === pool.key) || pool.maximumHp !== null && pool.maximumHp > 0
        && (health.state.pools.find((entry) => entry.poolKey === pool.key)?.damage ?? 0) >= pool.maximumHp }));
  }
  const rawPools = object(row.snapshot).hpPools;
  const damageByPool = object(object(row.local).health).poolDamage;
  return (Array.isArray(rawPools) ? rawPools.map(object) : []).map((pool) => ({ key: String(pool.canonicalId), name: String(pool.poolName),
    disabled: conditions.some((entry) => entry.poolKey === pool.canonicalId) || typeof pool.maximumHp === "number" && pool.maximumHp > 0
      && Number(object(damageByPool)[String(pool.canonicalId)] ?? 0) >= pool.maximumHp }));
}

export async function readWeaponInjuryTimingInTransaction(tx: Tx, encounterId: number, participantId: number, weaponProfileId: number, baseCost: number, chosenHands?: unknown) {
  const [profile] = await tx.select({ handedness: weaponProfile.handedness }).from(weaponProfile).where(eq(weaponProfile.id, weaponProfileId));
  if (!profile) throw new Error("The weapon profile no longer exists. Choose an available weapon.");
  return weaponInjuryTiming(baseCost, profile.handedness, await readTimingLimbsInTransaction(tx, encounterId, participantId), chosenHands);
}
