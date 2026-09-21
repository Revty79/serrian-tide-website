import type { MechanicalEffect } from "@/features/mechanical-effects/models";
import type { FrozenActionSourceSnapshot } from "@/features/tabletop-operations/action-effect-bridge";
import type { IncomingSourceFacts } from "./models";

export type FrozenIncomingSourceFacts = Omit<IncomingSourceFacts, "mechanicalEffectKind" | "conditionName">;
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" && value.trim() ? value : null;

/** Only exact structured snapshot fields establish facts. Legacy missing fields stay unknown. */
export function incomingFactsFromFrozenSource(source: Pick<FrozenActionSourceSnapshot, "kind" | "authoredData" | "incomingSourceFacts">): FrozenIncomingSourceFacts {
  if (source.incomingSourceFacts) return structuredClone(source.incomingSourceFacts);
  const authored = source.authoredData;
  const authoring = object(authored.authoring);
  const nonItemSource = ["spell", "creature-attack", "creature-ability", "derived-ability"].includes(source.kind);
  const construction = object(authoring.magic).document;
  return {
    sourceKind: source.kind, weaponFamily: source.kind === "weapon" ? null : "none",
    damageType: text(authored.damageType),
    magical: source.kind === "spell" ? true
      : ["creature-attack", "creature-ability"].includes(source.kind)
        ? construction ? true : typeof authoring.magical === "boolean" ? authoring.magical : null
        : null,
    itemProperties: nonItemSource ? [] : null, itemTags: nonItemSource ? [] : null,
  };
}

/** Firearm/ammunition inheritance has not been ruled. Do not merge or choose either Item. */
export function projectileIncomingFacts(damageType: string | null, firearm: boolean): FrozenIncomingSourceFacts {
  return { sourceKind: "weapon", weaponFamily: firearm ? "firearm" : "none", damageType: text(damageType), magical: null, itemProperties: null, itemTags: null };
}

export function incomingFactsForEffect(source: FrozenIncomingSourceFacts, effect: MechanicalEffect): IncomingSourceFacts {
  return { ...structuredClone(source), mechanicalEffectKind: effect.kind, conditionName: effect.kind === "condition.apply" ? effect.name : null };
}
