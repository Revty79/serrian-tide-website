import type { InitiativeParticipantState, PendingInitiativeActionState } from "./initiative-runtime";

export const ACTION_DECLARATION_STATUSES = [
  "draft",
  "locked",
  "committed",
  "rolling-ready",
  "rolling",
  "awaiting-god-ruling",
  "resolved",
  "cancelled",
  "interrupted",
  "abandoned",
] as const;

export const ACTION_WINDOW_KINDS = [
  "ordinary",
  "melee-overlap",
  "firearm-trigger",
  "preparation",
] as const;

export const ACTION_DECLARATION_SOURCE_KINDS = [
  "generic",
  "weapon",
  "creature-attack",
  "spell",
  "item",
  "creature-ability",
] as const;

export const RESPONDER_OPPORTUNITY_STATUSES = [
  "pending",
  "response-declared",
  "declined",
  "ineligible",
  "cancelled",
] as const;

export type ActionDeclarationStatus = (typeof ACTION_DECLARATION_STATUSES)[number];
export type ActionWindowKind = (typeof ACTION_WINDOW_KINDS)[number];
export type ActionDeclarationSourceKind = (typeof ACTION_DECLARATION_SOURCE_KINDS)[number];
export type ResponderOpportunityStatus = (typeof RESPONDER_OPPORTUNITY_STATUSES)[number];

export type ActionDeclarationModifier = Readonly<{
  label: string;
  value: number;
}>;

export type ActionDeclarationDraft = Readonly<{
  actorCharacterId: number;
  targetCharacterIds: readonly number[];
  label: string;
  actionKind: string;
  sourceKind: ActionDeclarationSourceKind;
  sourceRef: string | null;
  sourceInstanceId: number | null;
  weaponItemId: number | null;
  firingModeId: number | null;
  attackMode: string;
  initiativeCost: number;
  allowsMultiRound: boolean;
  heldIntervention: boolean;
  windowKind: ActionWindowKind;
  aimDeclared: boolean;
  calledShot: Readonly<{
    declared: boolean;
    label: string;
    assignedPenalty: number | null;
  }>;
  explicitModifiers: readonly ActionDeclarationModifier[];
  preparesForDeclarationId: number | null;
  godNotes: string;
}>;

export type LockedActionDeclarationSnapshot = Readonly<{
  schemaVersion: 1;
  context: Readonly<{
    campaignId: number;
    sessionId: number;
    sceneId: number;
    encounterId: number;
    roundNumber: number;
    stepNumber: number;
  }>;
  actorCharacterId: number;
  targetCharacterIds: readonly number[];
  label: string;
  actionKind: string;
  source: Readonly<{
    kind: ActionDeclarationSourceKind;
    ref: string | null;
    instanceId: number | null;
  }>;
  weapon: null | Readonly<{
    itemId: number;
    weaponProfileId: number;
    firingModeId: number | null;
    attackMode: string;
  }>;
  governing: null | Readonly<{
    status: "resolved" | "needs-god-ruling";
    source: unknown;
    rollOverTarget: number | null;
    explanation: string;
  }>;
  initiativeCost: number;
  allowsMultiRound: boolean;
  heldIntervention: boolean;
  windowKind: ActionWindowKind;
  aimDeclared: boolean;
  calledShot: ActionDeclarationDraft["calledShot"];
  explicitModifiers: readonly ActionDeclarationModifier[];
  preparesForDeclarationId: number | null;
  godNotes: string;
  authorUserId: string;
  lockedByUserId: string;
  authoredAt: string;
  lockedAt: string;
}>;

export type ActionWindow = Readonly<{
  kind: ActionWindowKind;
  startInitiative: number;
  nominalCompletionInitiative: number;
  initiativeCost: number;
  includesBoundaryEquality: true;
  wraps: false;
  overlapMayExtendBeyondCompletion: boolean;
  preparesForDeclarationId: number | null;
}>;

export type ResponderCandidate = Readonly<{
  characterId: number;
  initiativePosition: number;
  included: boolean;
  reason: string;
  requiresGodConfirmation: boolean;
}>;

export type RunParticipantExplanation = Readonly<{
  characterId: number;
  initiativePosition: number;
  considered: boolean;
  reason: string;
}>;

export type HasTheRunResult = Readonly<{
  actorCharacterId: number;
  hasTheRun: boolean;
  nearestRelevantInitiative: number | null;
  maximumWindowBeforeInterference: number | null;
  preservationBoundary: "exclusive";
  nextReachedParticipantId: number | null;
  proposedInitiativeCost: number | null;
  proposedActionPreservesRun: boolean | null;
  requiresGodJudgment: boolean;
  reason: string;
  participants: readonly RunParticipantExplanation[];
}>;

const LEGAL_TRANSITIONS: Readonly<Record<ActionDeclarationStatus, readonly ActionDeclarationStatus[]>> = {
  draft: ["locked", "cancelled"],
  locked: ["committed", "cancelled"],
  committed: ["rolling-ready", "awaiting-god-ruling", "interrupted", "cancelled", "abandoned"],
  "rolling-ready": ["committed", "rolling", "awaiting-god-ruling", "resolved", "interrupted", "cancelled", "abandoned"],
  rolling: ["committed", "rolling", "awaiting-god-ruling", "resolved", "interrupted", "cancelled", "abandoned"],
  "awaiting-god-ruling": ["rolling-ready", "resolved", "interrupted", "cancelled", "abandoned"],
  interrupted: ["committed", "resolved", "cancelled", "abandoned"],
  resolved: [],
  cancelled: [],
  abandoned: [],
};

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  return value;
}

function positive(value: number, label: string): number {
  finite(value, label);
  if (value <= 0) throw new Error(`${label} must be greater than zero.`);
  return value;
}

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} is invalid.`);
  return value;
}

function text(value: unknown, label: string, maximum: number, required = true): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const normalized = value.trim();
  if (required && !normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maximum) throw new Error(`${label} must be ${maximum} characters or fewer.`);
  return normalized;
}

function optionalId(value: number | null | undefined, label: string): number | null {
  return value === null || value === undefined ? null : positiveId(value, label);
}

export function normalizeActionDeclarationDraft(input: ActionDeclarationDraft): ActionDeclarationDraft {
  if (!ACTION_DECLARATION_SOURCE_KINDS.includes(input.sourceKind)) throw new Error("Action source kind is invalid.");
  if (!ACTION_WINDOW_KINDS.includes(input.windowKind)) throw new Error("Action window kind is invalid.");
  const initiativeCost = positive(input.initiativeCost, "Initiative Cost");
  if (input.windowKind === "firearm-trigger" && initiativeCost !== 1) {
    throw new Error("A firearm trigger window must cost exactly 1 Initiative.");
  }
  const targetCharacterIds = [...new Set(input.targetCharacterIds.map((id) => positiveId(id, "Target Character")))];
  const calledShotDeclared = input.calledShot.declared === true;
  const assignedPenalty = input.calledShot.assignedPenalty === null
    ? null
    : finite(input.calledShot.assignedPenalty, "Called Shot assigned penalty");
  if (calledShotDeclared && assignedPenalty === null) {
    throw new Error("A declared Called Shot must preserve its explicitly assigned penalty.");
  }
  const explicitModifiers = input.explicitModifiers.map((modifier) => ({
    label: text(modifier.label, "Modifier label", 160),
    value: finite(modifier.value, "Modifier value"),
  }));
  const weaponItemId = optionalId(input.weaponItemId, "Weapon Item");
  if (input.sourceKind === "weapon" && weaponItemId === null) {
    throw new Error("A Weapon declaration requires an exact Item identity.");
  }
  return {
    actorCharacterId: positiveId(input.actorCharacterId, "Acting Character"),
    targetCharacterIds,
    label: text(input.label, "Action label", 240),
    actionKind: text(input.actionKind, "Action kind", 120),
    sourceKind: input.sourceKind,
    sourceRef: input.sourceRef === null ? null : text(input.sourceRef, "Source identity", 400),
    sourceInstanceId: optionalId(input.sourceInstanceId, "Source instance"),
    weaponItemId,
    firingModeId: optionalId(input.firingModeId, "Firing Mode"),
    attackMode: text(input.attackMode, "Attack or firing mode", 160, false),
    initiativeCost,
    allowsMultiRound: input.allowsMultiRound === true,
    heldIntervention: input.heldIntervention === true,
    windowKind: input.windowKind,
    aimDeclared: input.aimDeclared === true,
    calledShot: {
      declared: calledShotDeclared,
      label: text(input.calledShot.label, "Called Shot label", 240, false),
      assignedPenalty,
    },
    explicitModifiers,
    preparesForDeclarationId: optionalId(input.preparesForDeclarationId, "Prepared declaration"),
    godNotes: text(input.godNotes, "G.O.D. notes", 2000, false),
  };
}

export function assertActionDeclarationTransition(
  current: ActionDeclarationStatus,
  next: ActionDeclarationStatus,
): void {
  if (!ACTION_DECLARATION_STATUSES.includes(current) || !ACTION_DECLARATION_STATUSES.includes(next)) {
    throw new Error("Action declaration status is invalid.");
  }
  if (!LEGAL_TRANSITIONS[current].includes(next)) {
    throw new Error(`Action declaration cannot transition from ${current} to ${next}.`);
  }
}

export function buildLockedActionDeclarationSnapshot(input: {
  draft: ActionDeclarationDraft;
  context: LockedActionDeclarationSnapshot["context"];
  weapon: LockedActionDeclarationSnapshot["weapon"];
  governing: LockedActionDeclarationSnapshot["governing"];
  authorUserId: string;
  lockedByUserId: string;
  authoredAt: Date;
  lockedAt: Date;
  authoritativeSourceRef?: string | null;
}): LockedActionDeclarationSnapshot {
  const draft = normalizeActionDeclarationDraft(input.draft);
  if (draft.sourceKind === "weapon" && input.weapon === null) {
    throw new Error("A locked Weapon declaration requires an authoritative Weapon Profile snapshot.");
  }
  return {
    schemaVersion: 1,
    context: {
      campaignId: positiveId(input.context.campaignId, "Campaign"),
      sessionId: positiveId(input.context.sessionId, "Session"),
      sceneId: positiveId(input.context.sceneId, "Scene"),
      encounterId: positiveId(input.context.encounterId, "Encounter"),
      roundNumber: positiveId(input.context.roundNumber, "Round"),
      stepNumber: positiveId(input.context.stepNumber, "Combat Step"),
    },
    actorCharacterId: draft.actorCharacterId,
    targetCharacterIds: draft.targetCharacterIds,
    label: draft.label,
    actionKind: draft.actionKind,
    source: {
      kind: draft.sourceKind,
      ref: input.authoritativeSourceRef === undefined ? draft.sourceRef : input.authoritativeSourceRef,
      instanceId: draft.sourceInstanceId,
    },
    weapon: input.weapon === null ? null : { ...input.weapon },
    governing: input.governing === null ? null : {
      ...input.governing,
      source: structuredClone(input.governing.source),
    },
    initiativeCost: draft.initiativeCost,
    allowsMultiRound: draft.allowsMultiRound,
    heldIntervention: draft.heldIntervention,
    windowKind: draft.windowKind,
    aimDeclared: draft.aimDeclared,
    calledShot: draft.calledShot,
    explicitModifiers: draft.explicitModifiers,
    preparesForDeclarationId: draft.preparesForDeclarationId,
    godNotes: draft.godNotes,
    authorUserId: text(input.authorUserId, "Author", 255),
    lockedByUserId: text(input.lockedByUserId, "Locking user", 255),
    authoredAt: input.authoredAt.toISOString(),
    lockedAt: input.lockedAt.toISOString(),
  };
}

export function parseActionDeclarationDraft(value: unknown): ActionDeclarationDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Stored action declaration draft is invalid.");
  return normalizeActionDeclarationDraft(value as ActionDeclarationDraft);
}

export function parseLockedActionDeclarationSnapshot(value: unknown): LockedActionDeclarationSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Stored locked declaration snapshot is invalid.");
  const candidate = value as LockedActionDeclarationSnapshot;
  if (candidate.schemaVersion !== 1) throw new Error("Stored locked declaration snapshot version is unsupported.");
  const rebuilt = buildLockedActionDeclarationSnapshot({
    draft: {
      actorCharacterId: candidate.actorCharacterId,
      targetCharacterIds: candidate.targetCharacterIds,
      label: candidate.label,
      actionKind: candidate.actionKind,
      sourceKind: candidate.source.kind,
      sourceRef: candidate.source.ref,
      sourceInstanceId: candidate.source.instanceId,
      weaponItemId: candidate.weapon?.itemId ?? null,
      firingModeId: candidate.weapon?.firingModeId ?? null,
      attackMode: candidate.weapon?.attackMode ?? "",
      initiativeCost: candidate.initiativeCost,
      allowsMultiRound: candidate.allowsMultiRound,
      heldIntervention: candidate.heldIntervention,
      windowKind: candidate.windowKind,
      aimDeclared: candidate.aimDeclared,
      calledShot: candidate.calledShot,
      explicitModifiers: candidate.explicitModifiers,
      preparesForDeclarationId: candidate.preparesForDeclarationId,
      godNotes: candidate.godNotes,
    },
    context: candidate.context,
    weapon: candidate.weapon,
    governing: candidate.governing,
    authorUserId: candidate.authorUserId,
    lockedByUserId: candidate.lockedByUserId,
    authoredAt: new Date(candidate.authoredAt),
    lockedAt: new Date(candidate.lockedAt),
    authoritativeSourceRef: candidate.source.ref,
  });
  if (!Number.isFinite(new Date(candidate.authoredAt).valueOf()) || !Number.isFinite(new Date(candidate.lockedAt).valueOf())) {
    throw new Error("Stored locked declaration timestamps are invalid.");
  }
  return rebuilt;
}

export function deriveActionWindow(
  startInitiative: number,
  snapshot: Pick<LockedActionDeclarationSnapshot, "initiativeCost" | "windowKind" | "preparesForDeclarationId">,
): ActionWindow {
  const start = finite(startInitiative, "Start Initiative");
  const cost = positive(snapshot.initiativeCost, "Initiative Cost");
  if (snapshot.windowKind === "firearm-trigger" && cost !== 1) {
    throw new Error("A firearm trigger window must cost exactly 1 Initiative.");
  }
  return {
    kind: snapshot.windowKind,
    startInitiative: start,
    nominalCompletionInitiative: start - cost,
    initiativeCost: cost,
    includesBoundaryEquality: true,
    wraps: false,
    overlapMayExtendBeyondCompletion: snapshot.windowKind === "melee-overlap",
    preparesForDeclarationId: snapshot.preparesForDeclarationId,
  };
}

export function initiativePositionIsInActionWindow(window: ActionWindow, initiativePosition: number): boolean {
  const position = finite(initiativePosition, "Responder Initiative");
  return position <= window.startInitiative && position >= window.nominalCompletionInitiative;
}

export function deriveResponderCandidates(
  window: ActionWindow,
  actorCharacterId: number,
  participants: readonly InitiativeParticipantState[],
): ResponderCandidate[] {
  return participants.map((participant): ResponderCandidate => {
    if (participant.characterId === actorCharacterId) {
      return {
        characterId: participant.characterId,
        initiativePosition: participant.currentInitiative,
        included: false,
        reason: "The acting Participant is excluded from their own action window.",
        requiresGodConfirmation: false,
      };
    }
    if (participant.participationStatus === "passed") {
      return {
        characterId: participant.characterId,
        initiativePosition: participant.currentInitiative,
        included: false,
        reason: "Passed Participants normally cannot re-enter this Round.",
        requiresGodConfirmation: false,
      };
    }
    if (participant.participationStatus === "suspended" || participant.currentInitiative <= 0) {
      return {
        characterId: participant.characterId,
        initiativePosition: participant.currentInitiative,
        included: false,
        reason: "The Participant cannot presently interfere from authoritative Initiative state.",
        requiresGodConfirmation: false,
      };
    }
    const included = initiativePositionIsInActionWindow(window, participant.currentInitiative);
    return {
      characterId: participant.characterId,
      initiativePosition: participant.currentInitiative,
      included,
      reason: included
        ? `${participant.participationStatus === "holding" ? "Holding" : "Active"} Initiative ${participant.currentInitiative} is reached by the inclusive ${window.startInitiative} to ${window.nominalCompletionInitiative} window.`
        : `Initiative ${participant.currentInitiative} lies outside the inclusive ${window.startInitiative} to ${window.nominalCompletionInitiative} window.`,
      requiresGodConfirmation: included,
    };
  });
}

export function responderOpportunitiesAreReconciled(
  opportunities: readonly { status: ResponderOpportunityStatus }[],
): boolean {
  return opportunities.every(({ status }) => status !== "pending");
}

export function assertActionCanRoll(
  status: ActionDeclarationStatus,
  opportunities: readonly { status: ResponderOpportunityStatus }[],
): void {
  if (status !== "rolling-ready" && status !== "rolling") {
    throw new Error("An action Roll requires a locked, committed, rolling-ready declaration.");
  }
  if (!responderOpportunitiesAreReconciled(opportunities)) {
    throw new Error("Every eligible responder opportunity must be reconciled before an action Roll.");
  }
}

export function calculateInterruptedActionProgress(input: {
  startInitiative: number;
  interruptionInitiative: number;
  originalInitiativeCost: number;
}): { initiativeSpent: number; remainingInitiativeCost: number; currentInitiative: number } {
  const start = finite(input.startInitiative, "Start Initiative");
  const interruption = finite(input.interruptionInitiative, "Interruption Initiative");
  const original = positive(input.originalInitiativeCost, "Original Initiative Cost");
  if (interruption > start) throw new Error("Interruption cannot rewind Initiative.");
  const initiativeSpent = Math.min(original, start - interruption);
  return {
    initiativeSpent,
    remainingInitiativeCost: original - initiativeSpent,
    currentInitiative: start - initiativeSpent,
  };
}

export function calculateHasTheRun(input: {
  actorCharacterId: number;
  participants: readonly InitiativeParticipantState[];
  pendingActions?: readonly Pick<PendingInitiativeActionState, "actorCharacterId" | "status">[];
  proposedInitiativeCost?: number | null;
  explicitlyIneligibleCharacterIds?: readonly number[];
  exceptionalCharacterIds?: readonly number[];
}): HasTheRunResult {
  const actor = input.participants.find(({ characterId }) => characterId === input.actorCharacterId);
  if (!actor) throw new Error("The run actor is not enrolled in Initiative.");
  const ineligible = new Set(input.explicitlyIneligibleCharacterIds ?? []);
  const exceptional = new Set(input.exceptionalCharacterIds ?? []);
  const participants = input.participants.flatMap((participant): RunParticipantExplanation[] => {
    if (participant.characterId === actor.characterId) return [];
    const explicitlyExcluded = ineligible.has(participant.characterId) && !exceptional.has(participant.characterId);
    const statusCapable = participant.participationStatus === "active" || participant.participationStatus === "holding";
    const considered = !explicitlyExcluded && (exceptional.has(participant.characterId) || (statusCapable && participant.currentInitiative > 0));
    const reason = explicitlyExcluded
      ? "Explicitly ruled ineligible by the G.O.D."
      : exceptional.has(participant.characterId)
        ? "Explicitly added by the G.O.D. as capable of interference."
        : participant.participationStatus === "passed"
          ? "Passed for this Round and normally cannot re-enter."
          : participant.participationStatus === "suspended"
            ? "Suspended by authoritative Initiative state."
            : participant.currentInitiative <= 0
              ? "No positive Initiative is presently available."
              : participant.participationStatus === "holding"
                ? "Holding and remains capable of interference."
                : "Active and capable of interference by Initiative state.";
    return [{
      characterId: participant.characterId,
      initiativePosition: participant.currentInitiative,
      considered,
      reason,
    }];
  });
  const competing = participants.filter(({ considered }) => considered)
    .sort((left, right) => right.initiativePosition - left.initiativePosition || left.characterId - right.characterId);
  const nearest = competing[0] ?? null;
  const activeAction = input.pendingActions?.some((action) => (
    action.actorCharacterId === actor.characterId && action.status === "active"
  )) ?? false;
  const ahead = nearest === null || actor.currentInitiative > nearest.initiativePosition;
  const eligibleActor = actor.participationStatus === "active" || actor.participationStatus === "holding";
  const hasTheRun = eligibleActor && actor.currentInitiative > 0 && !activeAction && ahead;
  const maximumWindowBeforeInterference = hasTheRun && nearest
    ? actor.currentInitiative - nearest.initiativePosition
    : nearest === null && hasTheRun ? null : 0;
  const proposedInitiativeCost = input.proposedInitiativeCost === null || input.proposedInitiativeCost === undefined
    ? null
    : positive(input.proposedInitiativeCost, "Proposed Initiative Cost");
  const proposedActionPreservesRun = proposedInitiativeCost === null
    ? null
    : hasTheRun && (maximumWindowBeforeInterference === null || proposedInitiativeCost < maximumWindowBeforeInterference);
  const reason = !eligibleActor
    ? `The actor is ${actor.participationStatus} and cannot presently have the run.`
    : actor.currentInitiative <= 0
      ? "The actor has no positive Current Initiative."
      : activeAction
        ? "The actor is already committed to an active action."
        : !ahead
          ? "Another capable Participant is at or ahead of the actor."
          : nearest
            ? `The actor remains ahead until a window reaches Initiative ${nearest.initiativePosition}; equality opens an opportunity.`
            : "No other Participant is mechanically capable of interference.";
  return {
    actorCharacterId: actor.characterId,
    hasTheRun,
    nearestRelevantInitiative: nearest?.initiativePosition ?? null,
    maximumWindowBeforeInterference,
    preservationBoundary: "exclusive",
    nextReachedParticipantId: nearest?.characterId ?? null,
    proposedInitiativeCost,
    proposedActionPreservesRun,
    requiresGodJudgment: competing.length > 0,
    reason,
    participants,
  };
}
