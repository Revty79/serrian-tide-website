/** Mechanical participation is distinct from voluntary departure and XP history. */
export type CombatConditionState = {
  status: "able" | "dead" | "incapacitated" | "defeated";
  reason: string;
  revision: number;
};
export const combatObject = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export type CombatBlocker = { key: string; status: "dead" | "incapacitated" | "defeated"; reason: string;
  conditionId?: number; evidence?: Record<string, unknown>; resolvedAt?: string; resolution?: string };
export function combatBlockers(local: unknown): CombatBlocker[] {
  const record = combatObject(local), condition = combatObject(record.combatCondition);
  if (Array.isArray(condition.blockers)) return condition.blockers as CombatBlocker[];
  const status = condition.status;
  if (status === "able") return [];
  if (status === "dead" || status === "incapacitated" || record.defeat) return [{ key: "retained-condition", status: status === "dead" || status === "incapacitated" ? status : "defeated",
    reason: String(condition.reason ?? combatObject(record.defeat).reason ?? "Retained defeat needs an explicit ruling."),
    conditionId: typeof condition.conditionId === "number" ? condition.conditionId : undefined, evidence: combatObject(condition.evidence) }];
  return [];
}

export function combatConditionState(local: unknown): CombatConditionState {
  const record = combatObject(local), condition = combatObject(record.combatCondition);
  const status = condition.status;
  if (status === "able" || status === "dead" || status === "incapacitated" || status === "defeated") return {
    status, reason: typeof condition.reason === "string" ? condition.reason : "",
    revision: typeof condition.revision === "number" ? condition.revision : 0,
  };
  // Retained defeat evidence did not distinguish death from incapacity. Keep
  // that uncertainty explicit, and do not silently reactivate old defeats.
  return { status: record.defeat ? "defeated" : "able", revision: 0,
    reason: record.defeat ? String(combatObject(record.defeat).reason ?? "Recorded defeat requires a specific G.O.D. recovery ruling.") : "" };
}

export function combatConditionMessage(state: CombatConditionState): string | null {
  return state.status === "able" ? null : `${state.status === "dead" ? "Dead" : state.status === "incapacitated" ? "Incapacitated" : "Defeated"}: ${state.reason} Cannot act or defend until this condition is resolved.`;
}

type AnatomyLocation = { name: string; poolKey: string | null; specialEffect?: unknown };
/** Current accumulated head damage governs condition: 0 HP is unconscious,
 * -1 HP or lower is dead. Exceptional/shared/multiple-head anatomy still needs
 * its own supported rule. The severing example is not the death threshold. */
export function headDamageCondition(input: {
  poolDamage: number; poolKey: string | null; poolName: string; maximumHp: number | null;
  location: AnatomyLocation | undefined; locations: AnatomyLocation[];
}): "unconscious" | "dead" | null {
  const isHead = (name: string) => name.trim().toLowerCase() === "head";
  const supported = input.poolKey !== null && input.maximumHp !== null && Number.isFinite(input.maximumHp) && input.maximumHp > 0
    && Number.isFinite(input.poolDamage) && input.poolDamage >= 0 && isHead(input.poolName)
    && input.location !== undefined && isHead(input.location.name) && !input.location.specialEffect
    && input.locations.filter(({ name }) => /head/i.test(name)).length === 1
    && input.locations.filter(({ name }) => /head/i.test(name)).every((location) => isHead(location.name) && location.poolKey === input.poolKey && !location.specialEffect)
    && input.locations.filter(({ poolKey }) => poolKey === input.poolKey).every(({ name }) => isHead(name));
  if (!supported) return null;
  const remaining = input.maximumHp! - input.poolDamage;
  return remaining <= -1 ? "dead" : remaining <= 0 ? "unconscious" : null;
}

/** One authored pool covering the whole creature, including repeated Roll
 * locations that all refer to the same Body (as on Slime). */
export function wholeBodyDamageCondition(input: {
  poolKey: string | null; poolCount: number; poolDamage: number; maximumHp: number | null;
  totalMaximumHp: number | null; locations: AnatomyLocation[];
}): "incapacitated" | "dead" | null {
  if (input.poolKey === null || input.poolCount !== 1 || input.maximumHp === null || !Number.isFinite(input.maximumHp)
    || input.maximumHp <= 0 || input.maximumHp !== input.totalMaximumHp || !Number.isFinite(input.poolDamage)
    || !input.locations.length || !input.locations.every((entry) => entry.poolKey === input.poolKey && !entry.specialEffect)) return null;
  const remaining = input.maximumHp - input.poolDamage;
  return remaining <= -1 ? "dead" : remaining <= 0 ? "incapacitated" : null;
}
