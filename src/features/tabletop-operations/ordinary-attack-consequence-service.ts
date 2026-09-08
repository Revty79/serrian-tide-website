import "server-only";

import type { db } from "@/db";

import type { FrozenActionAuthoredEffect, FrozenActionSourceSnapshot } from "./action-effect-bridge";
import type { LockedActionDeclarationSnapshot } from "./action-declaration";
import { readAttackTargetInTransaction, resolveAttackProtectionInTransaction } from "./attack-target-service";
import { calculateOrdinaryAttackDamage } from "./ordinary-attack-consequence";
import { getHitLocationFromPercentile } from "./roll-runtime";
import type { RollMechanicalSnapshot } from "./roll-mechanical-snapshot";
import type { OwnedEncounterRuntimeContext } from "./runtime-integration-service";

export type OrdinaryAttackConsequenceTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function damageValue(source: FrozenActionSourceSnapshot): string | number | null {
  const value = source.kind === "weapon" ? source.authoredData.resolvedDamage ?? source.authoredData.damage : source.authoredData.damage;
  return typeof value === "string" || typeof value === "number" ? value : null;
}

function outcomeSummary(input: {
  sourceName: string;
  targetName: string;
  locationName: string;
  grossDamage: number | null;
  armor: number | null;
  soak: number | null;
  netDamage: number | null;
  additionalSuccesses: number;
  calledShot: boolean;
}): string {
  const successNote = `${input.additionalSuccesses} extra success${input.additionalSuccesses === 1 ? "" : "es"} recorded; ordinary attack damage does not add firearm-only success damage.`;
  if (input.netDamage === null) return `${input.sourceName} hit ${input.targetName} at ${input.locationName}. ${successNote}`;
  return `${input.sourceName} hit ${input.targetName} at ${input.locationName}: ${input.grossDamage} gross - ${input.armor} armor - ${input.soak} soak = ${input.netDamage} damage. ${input.calledShot ? "Called Shot location and penalty were bound before the Roll. " : ""}${successNote}`;
}

export async function resolveOrdinaryAttackConsequencesInTransaction(
  tx: OrdinaryAttackConsequenceTransaction,
  context: OwnedEncounterRuntimeContext,
  locked: LockedActionDeclarationSnapshot,
  source: FrozenActionSourceSnapshot,
  governingRoll: RollMechanicalSnapshot,
): Promise<FrozenActionSourceSnapshot> {
  if (source.kind !== "weapon" && source.kind !== "creature-attack") return source;
  const calledLocation = locked.calledShot.declared ? locked.calledShot.locationNumber ?? null : null;
  const rolledLocation = getHitLocationFromPercentile(governingRoll.resolution.resultTotal);
  const hitLocationNumber = locked.calledShot.declared ? calledLocation : rolledLocation;
  const authoredDamage = damageValue(source);
  const damageType = text(source.authoredData.damageType) || null;
  const sourceRulingReasons = source.kind === "weapon" && text(authoredDamage) === "" && text(source.authoredData.authoredDamageModifier)
    ? [`The acting Character's frozen weapon damage modifier is unresolved: ${text(source.authoredData.authoredDamageModifier)}.`]
    : [];
  const effects: FrozenActionAuthoredEffect[] = [];
  for (const targetParticipantId of locked.targetCharacterIds) {
    const target = await readAttackTargetInTransaction(tx, context, targetParticipantId);
    const location = hitLocationNumber === null
      ? null
      : target.anatomy?.hitLocations.find(({ result }) => result === hitLocationNumber) ?? null;
    const preliminaryReasons: string[] = [];
    if (!target.anatomy) preliminaryReasons.push("The exact target anatomy is unavailable.");
    if (locked.calledShot.declared && calledLocation === null) preliminaryReasons.push("The Called Shot ruling did not bind an exact authored Hit Location.");
    if (hitLocationNumber !== null && !location) preliminaryReasons.push("The resolved Hit Location is absent from the target's exact authored anatomy.");
    const protection = location
      ? await resolveAttackProtectionInTransaction(tx, target, location.result, damageType)
      : { armor: null, soak: null, supported: false, snapshot: {}, rulingReasons: preliminaryReasons };
    const damage = calculateOrdinaryAttackDamage({
      authoredDamage,
      armor: protection.armor,
      soak: protection.soak,
      protectionSupported: protection.supported && preliminaryReasons.length === 0,
      protectionRulingReasons: [...sourceRulingReasons, ...preliminaryReasons, ...protection.rulingReasons],
    });
    const summary = outcomeSummary({
      sourceName: source.displayName,
      targetName: target.name,
      locationName: location?.name ?? "an unresolved location",
      grossDamage: damage.grossDamage,
      armor: damage.armor,
      soak: damage.soak,
      netDamage: damage.netDamage,
      additionalSuccesses: governingRoll.resolution.additionalSuccesses,
      calledShot: locked.calledShot.declared,
    });
    const instruction = {
      summary,
      calculation: damage,
      hitLocation: location ? { result: location.result, name: location.name, poolKey: location.poolKey } : null,
      protection: protection.snapshot,
      rulingReasons: damage.rulingReasons,
      application: location ? { hitLocationNumber: location.result, poolKey: location.poolKey } : {},
      objectivelyResolvedNoEffect: damage.supported && damage.netDamage === 0,
    };
    effects.push({
      key: `ordinary-attack-damage:target:${targetParticipantId}`,
      effect: damage.supported && damage.netDamage !== null && damage.netDamage > 0
        ? { kind: "health.damage", amount: damage.netDamage, application: "localized" }
        : null,
      instruction,
      applicationSupported: damage.supported && damage.netDamage !== null && damage.netDamage > 0,
      requiresGodReview: !damage.supported,
      targetParticipantIds: [targetParticipantId],
    });
    const frozenLocation = protection.snapshot.frozenLocation;
    const locationEffect = frozenLocation && typeof frozenLocation === "object" && !Array.isArray(frozenLocation)
      ? text((frozenLocation as Record<string, unknown>).locationEffect)
      : "";
    if (locationEffect) {
      effects.push({
        key: `hit-location-special-effect:target:${targetParticipantId}`,
        effect: null,
        instruction: {
          summary: `${location?.name ?? "The resolved Hit Location"} has an authored special effect for ${target.name}: ${locationEffect}`,
          locationEffect,
          rulingReasons: ["The authored Hit Location special effect has no structured executable definition."],
        },
        applicationSupported: false,
        requiresGodReview: true,
        targetParticipantIds: [targetParticipantId],
      });
    }
    const specialEffect = source.kind === "creature-attack" ? text(source.authoredData.specialEffect) : "";
    if (specialEffect) {
      effects.push({
        key: `creature-attack-special-effect:target:${targetParticipantId}`,
        effect: null,
        instruction: {
          summary: `${source.displayName} has an authored special effect for ${target.name}: ${specialEffect}`,
          specialEffect,
          rulingReasons: ["The authored Creature Attack special effect has no structured executable definition."],
        },
        applicationSupported: false,
        requiresGodReview: true,
        targetParticipantIds: [targetParticipantId],
      });
    }
  }
  return {
    ...source,
    authoredData: {
      ...source.authoredData,
      consequenceRule: "ordinary-attack",
      governingResultTotal: governingRoll.resolution.resultTotal,
      additionalSuccesses: governingRoll.resolution.additionalSuccesses,
      calledShot: locked.calledShot,
    },
    effects,
    warnings: [...source.warnings, ...effects.flatMap(({ instruction }) => Array.isArray(instruction.rulingReasons) ? instruction.rulingReasons.filter((reason): reason is string => typeof reason === "string") : [])],
  };
}
