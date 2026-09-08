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
/** Confirmed rule: a hit exceeding twice the HP of the single authored head
 * is fatal. No rule is inferred for another location, shared/multiple heads,
 * or anatomy carrying an exceptional location mechanic. */
export function fatalHeadDamage(input: {
  damage: number; poolKey: string | null; poolName: string; maximumHp: number | null;
  location: AnatomyLocation | undefined; locations: AnatomyLocation[];
}): boolean {
  const isHead = (name: string) => name.trim().toLowerCase() === "head";
  return input.poolKey !== null && input.maximumHp !== null && input.maximumHp > 0
    && input.damage > 2 * input.maximumHp && isHead(input.poolName)
    && input.location !== undefined && isHead(input.location.name) && !input.location.specialEffect
    && input.locations.filter(({ name }) => /head/i.test(name)).length === 1
    && input.locations.filter(({ name }) => /head/i.test(name)).every((location) => isHead(location.name) && location.poolKey === input.poolKey && !location.specialEffect)
    && input.locations.filter(({ poolKey }) => poolKey === input.poolKey).every(({ name }) => isHead(name));
}
