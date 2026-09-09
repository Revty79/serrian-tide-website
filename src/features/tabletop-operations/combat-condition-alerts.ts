import { combatConditionState, combatObject as object } from "./combat-condition-state";
import { combatLimbConditions } from "./combat-limb-state";

export type CombatConditionAlert = {
  id: string;
  participantId: number;
  actorName: string;
  title: string;
  detail: string;
  occurredAt: string | null;
};

/** Receipts survive refresh/recovery; current condition stays separate from history.
 * Call with the authorized viewer, never send other actors' alerts to a Player. */
export function combatConditionAlerts(
  participants: { participantId: number; name: string; local: unknown }[],
  viewer: { authority: "god-owner" } | { authority: "player"; characterId: number },
): CombatConditionAlert[] {
  const alerts: CombatConditionAlert[] = [];
  for (const member of participants) {
    if (viewer.authority === "player" && member.participantId !== viewer.characterId) continue;
    const condition = object(object(member.local).combatCondition);
    const state = combatConditionState(member.local);
    const history = Array.isArray(condition.history) ? condition.history.map(object) : [];
    for (const [index, event] of history.entries()) {
      const request = object(event.request), evidence = object(request.evidence);
      if (request.status !== "dead" && request.status !== "incapacitated") continue;
      const title = request.status === "dead" ? "Death" : evidence.unconscious === true || evidence.rule === "head-hp-zero" ? "Unconscious" : "Incapacitated";
      alerts.push({ id: `${member.participantId}:condition:${String(request.requestKey ?? index)}`,
        participantId: member.participantId, actorName: member.name, title,
        detail: (typeof request.reason === "string" ? request.reason : "Cannot act or defend until the condition is resolved.")
          + (state.status === "able" ? " This condition has since resolved." : ""),
        occurredAt: typeof event.recordedAt === "string" ? event.recordedAt : null });
    }
    if (!history.length && state.status !== "able") alerts.push({
      id: `${member.participantId}:retained-condition:${state.revision}`, participantId: member.participantId, actorName: member.name,
      title: state.status === "dead" ? "Death" : state.status === "defeated" ? "Defeated" : "Incapacitated", detail: state.reason, occurredAt: null,
    });
    for (const limb of combatLimbConditions(member.local)) alerts.push({
      id: `${member.participantId}:limb:${limb.sourceEffectId}:${limb.poolKey}`, participantId: member.participantId, actorName: member.name,
      title: `${limb.name} incapacitated`, detail: `${limb.name} reached 0 HP or lower and became unusable.${limb.recoveredAt ? " This limb has since recovered." : ""}`,
      occurredAt: limb.incapacitatedAt,
    });
  }
  return alerts.sort((left, right) => (right.occurredAt ?? "").localeCompare(left.occurredAt ?? "") || left.id.localeCompare(right.id));
}
