import type {
  MechanicalEffectSource,
  RuntimeDuration,
  TemporaryModifierChannel,
} from "@/features/mechanical-effects";

export type ActiveEffectDuration = {
  kind: RuntimeDuration["kind"];
  value: number | null;
  label: string;
};

export type ActiveEffectSourceSnapshot = {
  kind: MechanicalEffectSource["kind"];
  id: string;
  name: string;
  effectKey: string | null;
};

export type ActiveCondition = {
  id: number;
  characterId: number;
  name: string;
  description: string;
  source: ActiveEffectSourceSnapshot;
  duration: ActiveEffectDuration;
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string;
};

export type ActiveModifier = {
  id: number;
  characterId: number;
  label: string;
  channel: TemporaryModifierChannel;
  targetKey: string;
  amount: number;
  source: ActiveEffectSourceSnapshot;
  duration: ActiveEffectDuration;
  createdAt: string;
  endedAt: string | null;
  endNote: string;
};

export type ActiveEffectsView = {
  characterId: number;
  conditions: ActiveCondition[];
  modifiers: ActiveModifier[];
};

export type ActiveModifierTotal = {
  channel: TemporaryModifierChannel;
  targetKey: string;
  total: number;
};

export function formatRuntimeDuration(duration: RuntimeDuration): ActiveEffectDuration {
  const value = duration.kind === "combat-steps" || duration.kind === "combat-rounds"
    ? duration.value ?? null
    : null;
  const unit = duration.kind === "combat-steps" ? "Combat Step" : "Combat Round";
  const fallback = duration.kind === "until-removed"
    ? "Until Removed"
    : duration.kind === "scene"
      ? "Scene"
      : `${value} ${unit}${value === 1 ? "" : "s"}`;
  return { kind: duration.kind, value, label: duration.label?.trim() || fallback };
}

export function getActiveModifierTotal(
  modifiers: readonly ActiveModifier[],
  channel: TemporaryModifierChannel,
  targetKey: string,
): number {
  return modifiers.reduce((total, modifier) => (
    modifier.endedAt === null
    && modifier.channel === channel
    && modifier.targetKey === targetKey
      ? total + modifier.amount
      : total
  ), 0);
}

export function getActiveModifierTotals(
  modifiers: readonly ActiveModifier[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const modifier of modifiers) {
    if (modifier.endedAt !== null) continue;
    const key = `${modifier.channel}:${modifier.targetKey}`;
    totals.set(key, (totals.get(key) ?? 0) + modifier.amount);
  }
  return totals;
}

export function getActiveModifierTotalRows(
  modifiers: readonly ActiveModifier[],
): ActiveModifierTotal[] {
  const totals = new Map<string, ActiveModifierTotal>();
  for (const modifier of modifiers) {
    if (modifier.endedAt !== null) continue;
    const key = `${modifier.channel}\u0000${modifier.targetKey}`;
    const current = totals.get(key);
    totals.set(key, {
      channel: modifier.channel,
      targetKey: modifier.targetKey,
      total: (current?.total ?? 0) + modifier.amount,
    });
  }
  return [...totals.values()];
}

export function getRuntimeEffectiveValue(
  permanentValue: number,
  modifiers: readonly ActiveModifier[],
  channel: TemporaryModifierChannel,
  targetKey: string,
): number {
  return permanentValue + getActiveModifierTotal(modifiers, channel, targetKey);
}

export function validateMovementModifierTarget(
  targetKey: string,
  availableMovementModes: readonly string[],
): boolean {
  if (!targetKey.startsWith("movement:")) return false;
  const requested = targetKey.slice("movement:".length).trim();
  return availableMovementModes.some((mode) => mode.trim() === requested);
}
