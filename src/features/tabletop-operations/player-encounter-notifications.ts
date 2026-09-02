import type { PlayerEncounterView } from "./player-encounter-service";

export type PlayerEncounterNotificationPriority = "critical" | "important" | "informational";

export type PlayerEncounterNotification = {
  priority: PlayerEncounterNotificationPriority;
  title: string;
  detail: string;
};

export type PlayerEncounterUiSnapshot = {
  encounterId: number;
  encounterTitle: string;
  characterId: number;
  totalDamage: number;
  remainingHealth: number | null;
  currentInitiative: number | null;
  participationStatus: string;
  hasActionOpportunity: boolean;
  pendingAction: null | { id: number; label: string };
  reactionActions: Array<{ id: number; actorName: string; label: string }>;
  mana: Array<{ system: string; current: number }>;
  conditions: Array<{ id: number; name: string }>;
  modifiers: Array<{ id: number; label: string }>;
  injuries: Array<{ id: number; name: string }>;
  ownRolls: Array<{ id: number; label: string; result: number }>;
};

export function createPlayerEncounterUiSnapshot(view: PlayerEncounterView): PlayerEncounterUiSnapshot {
  const own = view.character;
  const initiative = own.initiative;
  const reactionActionIds = initiative.enrolled ? initiative.reactionOpportunityActionIds : [];
  const reactionActions = view.participants.flatMap((participant) => (
    participant.pendingAction && reactionActionIds.includes(participant.pendingAction.id)
      ? [{ id: participant.pendingAction.id, actorName: participant.name, label: participant.pendingAction.label }]
      : []
  ));
  return {
    encounterId: view.context.encounterId,
    encounterTitle: view.context.encounterTitle,
    characterId: own.identity.characterId,
    totalDamage: own.health?.totalDamage ?? 0,
    remainingHealth: own.health?.total.remainingHp ?? null,
    currentInitiative: initiative.enrolled ? initiative.currentInitiative : null,
    participationStatus: initiative.enrolled ? initiative.participationStatus : "not-enrolled",
    hasActionOpportunity: initiative.enrolled && (initiative.canAct || initiative.canIntervene),
    pendingAction: initiative.enrolled && initiative.pendingAction
      ? { id: initiative.pendingAction.id, label: initiative.pendingAction.label }
      : null,
    reactionActions,
    mana: own.mana?.pools.map((pool) => ({ system: pool.system, current: pool.currentMana })) ?? [],
    conditions: own.effects?.conditions
      .filter(({ resolvedAt }) => resolvedAt === null)
      .map(({ id, name }) => ({ id, name })) ?? [],
    modifiers: own.effects?.modifiers
      .filter(({ endedAt }) => endedAt === null)
      .map(({ id, label }) => ({ id, label })) ?? [],
    injuries: own.health?.injuries
      .filter(({ resolved }) => !resolved)
      .map(({ id, name }) => ({ id, name })) ?? [],
    ownRolls: view.rolls
      .filter(({ rollerCharacterId }) => rollerCharacterId === own.identity.characterId)
      .map(({ id, label, purposeKind, resultTotal }) => ({ id, label: label || purposeKind, result: resultTotal })),
  };
}

function addedById<T extends { id: number }>(previous: readonly T[], current: readonly T[]): T[] {
  const previousIds = new Set(previous.map(({ id }) => id));
  return current.filter(({ id }) => !previousIds.has(id));
}

function removedById<T extends { id: number }>(previous: readonly T[], current: readonly T[]): T[] {
  const currentIds = new Set(current.map(({ id }) => id));
  return previous.filter(({ id }) => !currentIds.has(id));
}

export function derivePlayerEncounterNotifications(
  previous: PlayerEncounterUiSnapshot | null,
  current: PlayerEncounterUiSnapshot | null,
): PlayerEncounterNotification[] {
  if (!previous) return [];
  if (!current) {
    return [{
      priority: "critical",
      title: "ENCOUNTER ENDED",
      detail: `${previous.encounterTitle} is no longer active for this Character.`,
    }];
  }
  if (previous.characterId !== current.characterId || previous.encounterId !== current.encounterId) return [];

  const notifications: PlayerEncounterNotification[] = [];
  const damageReceived = current.totalDamage - previous.totalDamage;
  if (damageReceived > 0) {
    const healthChange = previous.remainingHealth !== null && current.remainingHealth !== null
      ? ` Health: ${previous.remainingHealth} to ${current.remainingHealth}.`
      : "";
    notifications.push({
      priority: "critical",
      title: `YOU TOOK ${damageReceived} DAMAGE`,
      detail: `Total Damage is now ${current.totalDamage}.${healthChange}`,
    });
  }

  const newReactions = addedById(previous.reactionActions, current.reactionActions);
  if (newReactions[0]) {
    notifications.push({
      priority: "critical",
      title: "REACTION AVAILABLE",
      detail: `${newReactions[0].actorName} is using ${newReactions[0].label}.`,
    });
  }

  for (const injury of addedById(previous.injuries, current.injuries)) {
    notifications.push({ priority: "critical", title: "INJURY RECORDED", detail: injury.name });
  }

  if (!previous.hasActionOpportunity && current.hasActionOpportunity && !current.pendingAction && !current.reactionActions.length) {
    notifications.push({
      priority: "important",
      title: "YOUR ACTION IS READY",
      detail: `You may act at Initiative ${current.currentInitiative ?? "the current table opportunity"}.`,
    });
  }
  if (!previous.pendingAction && current.pendingAction) {
    notifications.push({ priority: "important", title: "ACTION IN PROGRESS", detail: current.pendingAction.label });
  } else if (previous.pendingAction && !current.pendingAction) {
    notifications.push({
      priority: "important",
      title: "ACTION UPDATED",
      detail: `${previous.pendingAction.label} is no longer pending.`,
    });
  }
  if (previous.participationStatus !== current.participationStatus && ["holding", "passed"].includes(current.participationStatus)) {
    notifications.push({
      priority: "important",
      title: current.participationStatus === "holding" ? "INITIATIVE HELD" : "INITIATIVE PASSED",
      detail: current.participationStatus === "holding"
        ? `You are holding at Initiative ${current.currentInitiative ?? "the current value"}.`
        : "You have passed for this Round.",
    });
  }

  for (const condition of addedById(previous.conditions, current.conditions)) {
    notifications.push({ priority: "important", title: "CONDITION ADDED", detail: condition.name });
  }
  for (const condition of removedById(previous.conditions, current.conditions)) {
    notifications.push({ priority: "important", title: "CONDITION REMOVED", detail: condition.name });
  }
  for (const modifier of addedById(previous.modifiers, current.modifiers)) {
    notifications.push({ priority: "important", title: "MODIFIER ADDED", detail: modifier.label });
  }
  for (const modifier of removedById(previous.modifiers, current.modifiers)) {
    notifications.push({ priority: "important", title: "MODIFIER ENDED", detail: modifier.label });
  }

  const priorMana = new Map(previous.mana.map((pool) => [pool.system, pool.current]));
  const manaChanges = current.mana.flatMap((pool) => {
    const before = priorMana.get(pool.system);
    return before !== undefined && before !== pool.current ? [`${pool.system}: ${before} to ${pool.current}`] : [];
  });
  if (manaChanges.length) {
    notifications.push({ priority: "informational", title: "MANA CHANGED", detail: manaChanges.join("; ") });
  }

  const newOwnRoll = addedById(previous.ownRolls, current.ownRolls)[0];
  if (newOwnRoll) {
    notifications.push({
      priority: "informational",
      title: "ROLL RECORDED",
      detail: `${newOwnRoll.label}: ${newOwnRoll.result}`,
    });
  }
  return notifications;
}
