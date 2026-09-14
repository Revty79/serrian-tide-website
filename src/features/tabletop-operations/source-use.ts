import type { SpellCastExecutionResult, SpellCastPlan, SpellCastRequest } from "@/features/characters/character-spell-runtime";
import type { ItemUseExecutionResult, ItemUsePlan, ItemUseRequest } from "@/features/items/item-use";

export type TabletopSourceUse =
  | { kind: "spell"; request: SpellCastRequest }
  | { kind: "item"; request: ItemUseRequest };
export type SourceUseStatus = "pending" | "approved" | "rejected" | "cancelled" | "completed";
export type SourceUseResult =
  | { kind: "spell"; result: SpellCastExecutionResult }
  | { kind: "item"; result: ItemUseExecutionResult };
export type SourceUseSnapshot = {
  name: string;
  cost: string;
  targets: { characterId: number; name: string }[];
  automaticEffects: string[];
  manualEffects: { title: string; description: string }[];
  signature: string;
};
export type SourceUseRequestView = {
  id: number;
  characterId: number;
  characterName: string;
  kind: TabletopSourceUse["kind"];
  status: SourceUseStatus;
  intent: string;
  snapshot: SourceUseSnapshot;
  ruling: string;
  contextActive: boolean;
  createdAt: string;
  events: { status: SourceUseStatus; note: string; actor: "player" | "god"; createdAt: string }[];
};

/** Object-key order must not change retry identity or an approved selection. */
export function stableSourceUseJson(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) => entry && typeof entry === "object" && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right)))
    : entry);
}

export function spellUseSnapshot(plan: SpellCastPlan): SourceUseSnapshot {
  return {
    name: plan.spell.name,
    cost: `${plan.finalManaCost} Mana; ${plan.finalOutOfCombatCastingTimeSeconds} seconds`,
    targets: plan.targetResults.map(({ characterId, name }) => ({ characterId, name })),
    automaticEffects: plan.automaticEffects.map(({ summary }) => summary),
    manualEffects: plan.manualEffects.map(({ title, description }) => ({ title, description })),
    signature: stableSourceUseJson({ source: plan.source, spell: plan.spell, caster: plan.caster,
      cost: plan.finalManaCost, time: plan.finalOutOfCombatCastingTimeSeconds,
      initiative: plan.finalInitiativeCost, groups: plan.targetGroups, manual: plan.manualEffects,
      automatic: plan.automaticEffects, applications: plan.automaticApplications.map((entry) => ({
        key: entry.applicationKey, target: entry.targetCharacterId, effect: entry.plan.effect,
      })) }),
  };
}

export function itemUseSnapshot(plan: ItemUsePlan): SourceUseSnapshot {
  const resource = plan.resource;
  return {
    name: plan.item.name,
    cost: resource ? `${resource.consumed} ${resource.kind === "instance" ? "Charge(s)" : "Item(s)"}` : "Unavailable",
    targets: [plan.target],
    automaticEffects: plan.effects.filter(({ effect }) => effect?.kind !== "manual").map(({ plan: effectPlan }) => effectPlan.summary),
    manualEffects: plan.manualEffects.map(({ title, description }) => ({ title, description })),
    signature: stableSourceUseJson({ item: plan.item, target: plan.target,
      resource: resource ? { kind: resource.kind, consumed: resource.consumed, useMode: resource.useMode } : null,
      effects: plan.effects.map(({ effectId, sortOrder, effect }) => ({ effectId, sortOrder, effect })) }),
  };
}
