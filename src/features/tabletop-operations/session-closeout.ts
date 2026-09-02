export type SessionCloseoutBlockerCode =
  | "scene-active"
  | "encounter-active"
  | "initiative-active"
  | "pending-action-active"
  | "pending-action-interrupted"
  | "authored-action-pending"
  | "authored-action-needs-ruling"
  | "reaction-declared"
  | "reaction-needs-ruling";

export type SessionCloseoutBlocker = {
  code: SessionCloseoutBlockerCode;
  message: string;
  sceneId: number | null;
  encounterId: number | null;
  characterId: number | null;
};

export type SessionCloseoutWarning = {
  code: "planned-scenes" | "planned-encounters" | "unbound-duration";
  message: string;
};

export function buildSessionCloseoutBlockers(input: {
  scenes: ReadonlyArray<{ id: number; title: string; status: "planned" | "active" | "completed" }>;
  encounters: ReadonlyArray<{ id: number; sceneId: number; title: string; status: "planned" | "active" | "completed" }>;
  initiatives: ReadonlyArray<{ encounterId: number; status: "active" | "closed" }>;
  pendingActions: ReadonlyArray<{ encounterId: number; actorCharacterId: number; label: string; status: "active" | "interrupted" | "completed" | "abandoned" | "ended" }>;
  authoredActions: ReadonlyArray<{ encounterId: number; sourceCharacterId: number; label: string; resolutionStatus: "pending" | "resolved" | "cancelled" | "needs-ruling" }>;
  reactions: ReadonlyArray<{ encounterId: number; reactorCharacterId: number; reactionType: string; status: "declared" | "resolved" | "cancelled" | "needs-ruling" }>;
}): SessionCloseoutBlocker[] {
  const blockers: SessionCloseoutBlocker[] = [];
  const encounterById = new Map(input.encounters.map((encounter) => [encounter.id, encounter]));
  for (const scene of input.scenes) {
    if (scene.status === "active") blockers.push({
      code: "scene-active",
      message: `Scene ${scene.title} is still active. Complete it before finalizing this Session.`,
      sceneId: scene.id,
      encounterId: null,
      characterId: null,
    });
  }
  for (const encounter of input.encounters) {
    if (encounter.status === "active") blockers.push({
      code: "encounter-active",
      message: `Encounter ${encounter.title} is still active. Finalize it before closing the Session.`,
      sceneId: encounter.sceneId,
      encounterId: encounter.id,
      characterId: null,
    });
  }
  for (const initiative of input.initiatives) {
    if (initiative.status !== "active") continue;
    const encounter = encounterById.get(initiative.encounterId);
    blockers.push({
      code: "initiative-active",
      message: `Initiative for ${encounter?.title ?? `Encounter #${initiative.encounterId}`} is still active.`,
      sceneId: encounter?.sceneId ?? null,
      encounterId: initiative.encounterId,
      characterId: null,
    });
  }
  for (const action of input.pendingActions) {
    if (action.status !== "active" && action.status !== "interrupted") continue;
    const encounter = encounterById.get(action.encounterId);
    blockers.push({
      code: action.status === "active" ? "pending-action-active" : "pending-action-interrupted",
      message: action.status === "active"
        ? `${action.label} remains an active pending action in ${encounter?.title ?? `Encounter #${action.encounterId}`}.`
        : `${action.label} is interrupted and still needs a ruling in ${encounter?.title ?? `Encounter #${action.encounterId}`}.`,
      sceneId: encounter?.sceneId ?? null,
      encounterId: action.encounterId,
      characterId: action.actorCharacterId,
    });
  }
  for (const action of input.authoredActions) {
    if (action.resolutionStatus !== "pending" && action.resolutionStatus !== "needs-ruling") continue;
    const encounter = encounterById.get(action.encounterId);
    blockers.push({
      code: action.resolutionStatus === "pending" ? "authored-action-pending" : "authored-action-needs-ruling",
      message: action.resolutionStatus === "pending"
        ? `${action.label} has unresolved authored consequences in ${encounter?.title ?? `Encounter #${action.encounterId}`}.`
        : `${action.label} still needs a G.O.D. authored-action ruling in ${encounter?.title ?? `Encounter #${action.encounterId}`}.`,
      sceneId: encounter?.sceneId ?? null,
      encounterId: action.encounterId,
      characterId: action.sourceCharacterId,
    });
  }
  for (const reaction of input.reactions) {
    if (reaction.status !== "declared" && reaction.status !== "needs-ruling") continue;
    const encounter = encounterById.get(reaction.encounterId);
    blockers.push({
      code: reaction.status === "declared" ? "reaction-declared" : "reaction-needs-ruling",
      message: reaction.status === "declared"
        ? `${reaction.reactionType} remains declared in ${encounter?.title ?? `Encounter #${reaction.encounterId}`}.`
        : `${reaction.reactionType} still needs a Keep/Refund ruling in ${encounter?.title ?? `Encounter #${reaction.encounterId}`}.`,
      sceneId: encounter?.sceneId ?? null,
      encounterId: reaction.encounterId,
      characterId: reaction.reactorCharacterId,
    });
  }
  return blockers;
}

export function buildSessionCloseoutWarnings(input: {
  plannedSceneCount: number;
  plannedEncounterCount: number;
  unboundDurations: ReadonlyArray<{ characterName: string; effectLabel: string; durationLabel: string }>;
}): SessionCloseoutWarning[] {
  const warnings: SessionCloseoutWarning[] = [];
  if (input.plannedSceneCount > 0) warnings.push({
    code: "planned-scenes",
    message: `${input.plannedSceneCount} planned ${input.plannedSceneCount === 1 ? "Scene was" : "Scenes were"} not used. Prepared content may remain historical.`,
  });
  if (input.plannedEncounterCount > 0) warnings.push({
    code: "planned-encounters",
    message: `${input.plannedEncounterCount} planned ${input.plannedEncounterCount === 1 ? "Encounter was" : "Encounters were"} not used. Prepared content does not block Session closeout.`,
  });
  for (const duration of input.unboundDurations) warnings.push({
    code: "unbound-duration",
    message: `${duration.characterName} has an unbound ${duration.durationLabel} effect, ${duration.effectLabel}. It will not auto-advance and is not being guessed or cleared.`,
  });
  return warnings;
}
