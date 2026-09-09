import "server-only";
import { and, eq } from "drizzle-orm";
import type { db } from "@/db";
import { campaignCharacter } from "@/db/realm-schema";
import { campaignSessionEncounterParticipant as member } from "@/db/tabletop-operations-schema";
import { readActiveHealthInTransaction } from "@/features/active-state/active-health-service";
import type { FrozenActionSourceSnapshot, ActionEffectPlanProposal } from "./action-effect-bridge";
import type { RollMechanicalSnapshot } from "./roll-mechanical-snapshot";
import { combatObject as object } from "./combat-condition-state";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Complete authored spell applications from the original Roll at consequence
 * time. Costs/scaling belong to their existing services; this only resolves anatomy. */
export async function resolveSpellHitLocationsInTransaction(tx: Tx, encounterId: number, source: FrozenActionSourceSnapshot,
  roll: RollMechanicalSnapshot | null, proposal: ActionEffectPlanProposal): Promise<ActionEffectPlanProposal> {
  if (source.kind !== "spell") return proposal;
  const effects = [];
  for (const effect of proposal.effects) {
    const authored = object(effect.authoredValue), instruction = object(authored.instruction);
    if (instruction.hitLocationMode !== "standard-roll" || effect.status === "declined") { effects.push(effect); continue; }
    if (!roll) throw new Error("A damaging spell requires its original casting Roll to resolve the hit location.");
    const number = roll.resolution.resultTotal % 10;
    const [target] = await tx.select({ kind: member.participantKind, snapshot: member.creatureSnapshotJson, npcKind: campaignCharacter.npcKind }).from(member)
      .leftJoin(campaignCharacter, eq(campaignCharacter.id, member.characterId))
      .where(and(eq(member.encounterId, encounterId), eq(member.characterId, effect.targetParticipantId)));
    if (!target) throw new Error("The spell target no longer belongs to this encounter.");
    let poolKey: string | null = null, locationName: string | null = null;
    if (target.kind === "creature") {
      const locations = object(target.snapshot).hitLocations;
      const location = (Array.isArray(locations) ? locations.map(object) : []).find((entry) => entry.hitLocationNumber === number);
      poolKey = typeof location?.hpPoolCanonicalId === "string" ? location.hpPoolCanonicalId : null;
      locationName = typeof location?.locationName === "string" ? location.locationName : null;
    } else {
      const health = await readActiveHealthInTransaction(tx, effect.targetParticipantId, target.npcKind ?? "race");
      const location = health.anatomy.hitLocations.find((entry) => entry.result === number);
      poolKey = location?.poolKey ?? null; locationName = location?.name ?? null;
    }
    const supported = poolKey !== null && locationName !== null;
    const application = { hitLocationNumber: number, poolKey, spellHitLocation: { locationName, roll: roll.resolution.resultTotal } };
    effects.push({ ...effect, finalValue: { ...object(effect.finalValue), application },
      applicationSupported: effect.applicationSupported && supported, godReviewRequired: effect.godReviewRequired || !supported,
      status: supported ? effect.status : "requires-god-ruling" as const,
      amendmentReason: supported ? effect.amendmentReason : `The target's authored anatomy has no HP pool for hit location ${number}.` });
  }
  return { ...proposal, effects, status: effects.some((effect) => effect.status === "requires-god-ruling") ? "requires-god-ruling" : proposal.status };
}
