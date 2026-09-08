import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { db } from "@/db";
import { campaignCharacter } from "@/db/realm-schema";
import { itemArmorDamageModifier } from "@/db/item-schema";
import { campaignSessionEncounterParticipant } from "@/db/tabletop-operations-schema";
import { readActiveHealthInTransaction } from "@/features/active-state/active-health-service";
import { readActiveEffectsInTransaction } from "@/features/active-state/active-effects-service";
import { getActiveModifierTotal } from "@/features/active-state/active-effects";
import { readCharacterEquipmentStateInTransaction } from "@/features/items/equipment-state-service";
import type { LockedActionDeclarationSnapshot } from "./action-declaration";
import type { ActionEffectPlanProposal, ActionEffectProposal } from "./action-effect-bridge";
import type { RollMechanicalSnapshot } from "./roll-mechanical-snapshot";
import type { OwnedEncounterRuntimeContext } from "./runtime-integration-service";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const records = (value: unknown) => Array.isArray(value) ? value.map(object) : [];
function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim())) return Number(value);
  return null;
}

export type OrdinaryAttackRuling = Readonly<{
  targetParticipantId: number;
  hitLocationNumber: number;
  finalDamage?: number;
  reason: string;
  injuryName?: string;
  defeated?: boolean;
  defeatValueXp?: number;
}>;

/** Source-specific ordinary damage; firearms and per-success spells have their own calculations. */
export function calculateOrdinaryAttackDamage(baseDamage: number, extraSuccesses: number, armor: number, soak: number) {
  if (![baseDamage, extraSuccesses, armor, soak].every((value) => Number.isFinite(value) && value >= 0)
    || !Number.isInteger(extraSuccesses)) throw new Error("Ordinary damage requires nonnegative authored numbers and whole extra successes.");
  const grossDamage = baseDamage + extraSuccesses;
  return { baseDamage, extraSuccesses, armor, soak, grossDamage, netDamage: Math.max(0, grossDamage - armor - soak) };
}

export async function buildOrdinaryAttackConsequenceProposalInTransaction(
  tx: Transaction, context: OwnedEncounterRuntimeContext, locked: LockedActionDeclarationSnapshot,
  roll: RollMechanicalSnapshot, defense: Record<string, unknown> | null, ruling?: OrdinaryAttackRuling,
): Promise<ActionEffectPlanProposal> {
  const source = locked.authoredSource;
  if (!source || !["weapon", "creature-attack"].includes(source.kind) || locked.weapon?.firingModeId != null) {
    throw new Error("Ordinary consequences require an exact ordinary Weapon or Creature Attack source.");
  }
  if (ruling && (!locked.targetCharacterIds.includes(ruling.targetParticipantId) || !Number.isInteger(ruling.hitLocationNumber)
    || ruling.hitLocationNumber < 0 || ruling.hitLocationNumber > 9 || ruling.finalDamage !== undefined && (!Number.isFinite(ruling.finalDamage) || ruling.finalDamage < 0)
    || !ruling.reason.trim() || (ruling.defeatValueXp !== undefined && (!Number.isFinite(ruling.defeatValueXp) || ruling.defeatValueXp < 0)))) {
    throw new Error("An attack ruling requires its exact target, location 0–9, nonnegative damage/defeat value, and reason.");
  }
  const objective = object(defense?.objective);
  const prevented = !roll.resolution.succeeded || objective.attackStopped === true || ["stopped", "cancel"].includes(String(defense?.originalActionDisposition));
  const proposals: ActionEffectProposal[] = [];
  for (const targetParticipantId of locked.targetCharacterIds) {
    const adjudicated = ruling?.targetParticipantId === targetParticipantId ? ruling : undefined;
    const hitLocationNumber = adjudicated?.hitLocationNumber ?? roll.resolution.resultTotal % 10;
    const [target] = await tx.select({ kind: campaignSessionEncounterParticipant.participantKind, snapshot: campaignSessionEncounterParticipant.creatureSnapshotJson,
      npcKind: campaignCharacter.npcKind }).from(campaignSessionEncounterParticipant)
      .leftJoin(campaignCharacter, eq(campaignCharacter.id, campaignSessionEncounterParticipant.characterId))
      .where(and(eq(campaignSessionEncounterParticipant.encounterId, context.encounterId), eq(campaignSessionEncounterParticipant.characterId, targetParticipantId))).limit(1);
    if (!target) throw new Error("Attack target no longer belongs to this exact Encounter.");
    const issues: string[] = [];
    let poolKey: string | null = null;
    let locationName = "";
    let poolMaximumHp: number | null = null;
    let totalMaximumHp: number | null = null;
    let armor: number | null = null;
    let soak: number | null = null;
    if (target.kind === "creature") {
      const snapshot = object(target.snapshot);
      const location = records(snapshot.hitLocations).find((entry) => entry.hitLocationNumber === hitLocationNumber);
      poolKey = typeof location?.hpPoolCanonicalId === "string" ? location.hpPoolCanonicalId : null;
      locationName = String(location?.locationName ?? "");
      const pool = records(snapshot.hpPools).find((entry) => entry.canonicalId === poolKey);
      poolMaximumHp = numeric(pool?.maximumHp);
      totalMaximumHp = numeric(object(snapshot.core).totalHp);
      armor = numeric(location?.naturalArmor);
      soak = numeric(location?.soak);
      if (location?.locationEffect) issues.push("Authored location special effect needs a specific ruling.");
    } else {
      const health = await readActiveHealthInTransaction(tx, targetParticipantId, target.npcKind ?? "race");
      const location = health.anatomy.hitLocations.find(({ result }) => result === hitLocationNumber);
      poolKey = location?.poolKey ?? null;
      locationName = location?.name ?? "";
      poolMaximumHp = health.anatomy.pools.find(({ key }) => key === poolKey)?.maximumHp ?? null;
      totalMaximumHp = health.anatomy.totalMaximumHp;
      const equipment = await readCharacterEquipmentStateInTransaction(tx, targetParticipantId);
      const protection = equipment.wornArmor.filter(({ coveredLocationKeys }) => coveredLocationKeys.includes(String(hitLocationNumber)));
      armor = protection.length === 0 ? 0 : protection.length === 1 ? protection[0].baseSoak : null;
      const armorIds = protection.map(({ itemId }) => itemId);
      const modifiers = armorIds.length ? await tx.select().from(itemArmorDamageModifier).where(inArray(itemArmorDamageModifier.itemId, armorIds)).orderBy(asc(itemArmorDamageModifier.id)) : [];
      if (modifiers.length) issues.push("Armor damage-type rules require a specific ruling; free text was not converted to numbers.");
      if (protection.length > 1) issues.push("Multiple covering armor items require a stacking ruling.");
      soak = getActiveModifierTotal((await readActiveEffectsInTransaction(tx, targetParticipantId)).modifiers, "soak", "self");
    }
    if (!poolKey) issues.push(`The authored anatomy has no exact HP pool for location ${hitLocationNumber}.`);
    const base = numeric(source.authoredData.damage);
    if (base === null) issues.push("The selected attack has no direct numeric base damage.");
    if (armor === null || soak === null || armor < 0 || soak < 0) issues.push("The resolved location has no supported numeric armor/soak values.");
    if (locked.calledShot.declared && !adjudicated) issues.push("This called shot needs an explicit location ruling.");
    if (roll.resolution.requiresGodRuling && !adjudicated) issues.push("The critical outcome requires an explicit ruling.");
    if (source.authoredData.specialEffect) issues.push("The attack's authored special effect requires a separate ruling.");
    if (locked.targetCharacterIds.length !== 1 && !adjudicated) issues.push("This ordinary attack needs a ruling for its multiple targets.");
    const calculated = base !== null && armor !== null && armor >= 0 && soak !== null && soak >= 0
      ? calculateOrdinaryAttackDamage(base, roll.resolution.additionalSuccesses, armor, soak) : null;
    const netDamage = adjudicated?.finalDamage ?? calculated?.netDamage ?? null;
    // Location selection alone cannot override unsupported damage mechanics.
    const supported = poolKey !== null && netDamage !== null && (issues.length === 0 || adjudicated?.finalDamage !== undefined);
    const declined = prevented || supported && netDamage === 0;
    const application = { hitLocationNumber, poolKey, ordinaryAttack: { locationName, poolMaximumHp, totalMaximumHp, calculated,
      appliedDamage: netDamage, ruling: adjudicated ?? null, issues } };
    proposals.push({ effectKey: `ordinary-attack:target:${targetParticipantId}`, effectType: "health.damage", targetParticipantId,
      authoredValue: { source: source.authoredData, roll: roll.resolution, application }, calculatedValue: calculated,
      finalValue: declined ? null : { effect: netDamage !== null && netDamage > 0 ? { kind: "health.damage", application: "localized", amount: netDamage } : null, application },
      unit: "Health", resource: "", applicationSupported: !declined && supported, godReviewRequired: !declined && !supported,
      status: declined ? "declined" : supported ? "calculated" : "requires-god-ruling",
      amendmentReason: prevented ? "The recorded attack failed or its resolved defense prevented damage." : declined ? "Armor and soak absorbed the complete hit." : adjudicated?.reason ?? issues.join(" ") });
  }
  const unresolvedCritical = !ruling && (roll.resolution.requiresGodRuling || defense?.originalActionDisposition === "awaiting-god-ruling");
  return { status: unresolvedCritical || proposals.some(({ status }) => status === "requires-god-ruling") ? "requires-god-ruling" : "calculated", effects: proposals,
    explanation: "Ordinary attack: numeric base damage plus extra successes, resolved location, then supported protection. Damage remains pending until effect application." };
}
