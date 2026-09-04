export type EncounterCloseoutBlockerCode =
  | "initiative-active"
  | "action-declaration-open"
  | "pending-action-active"
  | "pending-action-interrupted"
  | "authored-action-pending"
  | "authored-action-needs-ruling"
  | "reaction-declared"
  | "reaction-needs-ruling";

export type EncounterCloseoutBlocker = {
  code: EncounterCloseoutBlockerCode;
  message: string;
  characterId: number | null;
};

export type ExperienceAwardInput = {
  characterId: number;
  amount: number;
};

export function buildEncounterCloseoutBlockers(input: {
  initiativeStatus: "active" | "closed" | null;
  actionDeclarations?: ReadonlyArray<{
    status: "draft" | "locked" | "committed" | "rolling-ready" | "rolling" | "awaiting-god-ruling" | "resolved" | "cancelled" | "interrupted" | "abandoned";
    label: string;
    actorCharacterId: number;
  }>;
  pendingActions: ReadonlyArray<{
    status: "active" | "interrupted" | "completed" | "abandoned" | "ended";
    label: string;
    actorCharacterId: number;
  }>;
  authoredActions: ReadonlyArray<{
    resolutionStatus: "pending" | "resolved" | "cancelled" | "needs-ruling";
    label: string;
    sourceCharacterId: number;
  }>;
  reactions: ReadonlyArray<{
    status: "declared" | "resolved" | "cancelled" | "needs-ruling";
    reactionType: string;
    reactorCharacterId: number;
  }>;
}): EncounterCloseoutBlocker[] {
  const blockers: EncounterCloseoutBlocker[] = [];
  if (input.initiativeStatus === "active") {
    blockers.push({
      code: "initiative-active",
      message: "Initiative Runtime is still active. Close Initiative before finalizing this Encounter.",
      characterId: null,
    });
  }
  for (const declaration of input.actionDeclarations ?? []) {
    if (declaration.status === "resolved" || declaration.status === "cancelled" || declaration.status === "abandoned") continue;
    blockers.push({
      code: "action-declaration-open",
      message: `${declaration.label} has an open ${declaration.status.replaceAll("-", " ")} declaration. Resolve, cancel, or abandon it before closeout.`,
      characterId: declaration.actorCharacterId,
    });
  }
  for (const action of input.pendingActions) {
    if (action.status === "active") {
      blockers.push({
        code: "pending-action-active",
        message: `${action.label} is still an active pending action.`,
        characterId: action.actorCharacterId,
      });
    } else if (action.status === "interrupted") {
      blockers.push({
        code: "pending-action-interrupted",
        message: `${action.label} is interrupted and still requires an explicit ruling.`,
        characterId: action.actorCharacterId,
      });
    }
  }
  for (const action of input.authoredActions) {
    if (action.resolutionStatus === "pending") {
      blockers.push({
        code: "authored-action-pending",
        message: `${action.label} has completed Initiative timing but its authored consequences remain unresolved.`,
        characterId: action.sourceCharacterId,
      });
    } else if (action.resolutionStatus === "needs-ruling") {
      blockers.push({
        code: "authored-action-needs-ruling",
        message: `${action.label} still needs a G.O.D. authored-action ruling.`,
        characterId: action.sourceCharacterId,
      });
    }
  }
  for (const reaction of input.reactions) {
    if (reaction.status === "declared") {
      blockers.push({
        code: "reaction-declared",
        message: `${reaction.reactionType} is declared and must be resolved before closeout.`,
        characterId: reaction.reactorCharacterId,
      });
    } else if (reaction.status === "needs-ruling") {
      blockers.push({
        code: "reaction-needs-ruling",
        message: `${reaction.reactionType} needs an explicit Keep/Refund ruling before closeout.`,
        characterId: reaction.reactorCharacterId,
      });
    }
  }
  return blockers;
}

export function normalizeExperienceAwards(
  awards: readonly ExperienceAwardInput[],
): ExperienceAwardInput[] {
  const seen = new Set<number>();
  const normalized: ExperienceAwardInput[] = [];
  for (const award of awards) {
    if (!Number.isInteger(award.characterId) || award.characterId <= 0) {
      throw new Error("Every XP reward recipient requires a valid Character identity.");
    }
    if (!Number.isInteger(award.amount) || award.amount < 0) {
      throw new Error("Encounter XP awards must be nonnegative whole numbers.");
    }
    if (seen.has(award.characterId)) {
      throw new Error("Each Encounter reward recipient may appear only once.");
    }
    seen.add(award.characterId);
    if (award.amount > 0) normalized.push({ characterId: award.characterId, amount: award.amount });
  }
  return normalized;
}

export function parseCreatureKillXpSuggestion(snapshotJson: string): number | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(snapshotJson);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const core = (parsed as { core?: unknown }).core;
  if (typeof core !== "object" || core === null || Array.isArray(core)) return null;
  const killXp = (core as { killXp?: unknown }).killXp;
  return Number.isInteger(killXp) && (killXp as number) >= 0 ? killXp as number : null;
}

export function getSuggestedCreatureXpTotal(
  candidates: ReadonlyArray<{ characterId: number; suggestedXp: number | null }>,
  selectedCharacterIds: readonly number[],
): number {
  const selected = new Set(selectedCharacterIds);
  return candidates.reduce((total, candidate) => (
    selected.has(candidate.characterId) && candidate.suggestedXp !== null
      ? total + candidate.suggestedXp
      : total
  ), 0);
}

export function splitSuggestedExperience(
  suggestedTotal: number,
  recipientCount: number,
): number | null {
  if (!Number.isFinite(suggestedTotal) || suggestedTotal < 0) {
    throw new Error("Suggested XP must be a nonnegative finite value.");
  }
  if (!Number.isInteger(recipientCount) || recipientCount <= 0) return null;
  return suggestedTotal / recipientCount;
}
