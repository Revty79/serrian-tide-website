export type CombatRollPrompt = Readonly<{
  key: string;
  kind: "attack" | "defense" | "firearm-trigger" | "firearm-roll" | "firearm-finish" | "free";
  recordId: number;
  label: string;
  ready: boolean;
  detail: string;
  manualTargetRequired?: boolean;
}>;

type Declaration = Readonly<{
  id: number;
  actorCharacterId: number;
  actorName: string;
  pendingActionId: number | null;
  status: string;
  draft: Readonly<{ label: string; actionKind: string }>;
  lockedSnapshot: Readonly<{
    label: string;
    authoredSource?: Readonly<{ resolutionMode: string }> | null;
    governing?: Readonly<{ status: string }> | null;
  }> | null;
  rollState: Readonly<{ attackRollId: number | null; resolved: boolean; message: string }>;
  opportunities: readonly Readonly<{ status: string }>[];
  timing: Readonly<{ status: string; remainingInitiativeCost: number }> | null;
}>;

type Reaction = Readonly<{
  id: number;
  declarationId: number;
  responderCharacterId: number;
  responderName: string;
  reactionType: string;
  rollRequired: boolean;
  rollId: number | null;
  status: string;
}>;

const terminal = new Set(["resolved", "cancelled", "abandoned"]);

export function buildCombatRollPrompts(input: {
  declarations: readonly Declaration[];
  reactions: readonly Reaction[];
  controlledParticipantIds: readonly number[];
  allowManualTarget: boolean;
}): CombatRollPrompt[] {
  const controlled = new Set(input.controlledParticipantIds);
  const prompts: CombatRollPrompt[] = [];
  for (const reaction of input.reactions) {
    const declaration = input.declarations.find(({ id }) => id === reaction.declarationId);
    if (!controlled.has(reaction.responderCharacterId)
      || !reaction.rollRequired || reaction.rollId !== null || reaction.status !== "declared"
      || !declaration || terminal.has(declaration.status) || declaration.rollState.resolved) continue;
    prompts.push({
      key: `defense:${reaction.id}`, kind: "defense", recordId: reaction.id,
      label: `${reaction.responderName} — ${reaction.reactionType.replaceAll("-", " ")}`,
      ready: true,
      detail: `Defense against ${declaration.actorName}: ${declaration.lockedSnapshot?.label ?? declaration.draft.label}. This Roll is attached to that defense.`,
    });
  }
  for (const declaration of input.declarations) {
    if (!controlled.has(declaration.actorCharacterId) || declaration.pendingActionId === null
      || terminal.has(declaration.status) || declaration.rollState.resolved
      || declaration.rollState.attackRollId !== null
      || declaration.draft.actionKind.startsWith("firearm-")
      || declaration.lockedSnapshot?.authoredSource?.resolutionMode === "automatic-no-roll") continue;
    const waitingForTiming = declaration.timing?.status === "active";
    const waitingForResponse = declaration.opportunities.some(({ status }) => status === "pending");
    const needsTarget = declaration.lockedSnapshot?.governing?.status !== "resolved";
    const ready = !waitingForTiming && !waitingForResponse
      && ["rolling-ready", "rolling", "awaiting-god-ruling"].includes(declaration.status)
      && (!needsTarget || input.allowManualTarget);
    const detail = waitingForTiming
      ? `${declaration.timing!.remainingInitiativeCost} Initiative remains. G.O.D. must advance combat to this action's completion before the attack Roll.`
      : waitingForResponse
        ? "Choose the outstanding defenses or No Defense before rolling this attack."
        : needsTarget && !input.allowManualTarget
          ? "G.O.D. must supply this action's missing Roll target before you can roll it."
          : ready
            ? "This Roll is attached to this action. Recorded attack and defense Rolls are compared when all required Rolls are present."
            : declaration.rollState.message;
    prompts.push({
      key: `attack:${declaration.id}`, kind: "attack", recordId: declaration.id,
      label: `${declaration.actorName} — ${declaration.lockedSnapshot?.label ?? declaration.draft.label}`,
      ready, detail, manualTargetRequired: needsTarget && input.allowManualTarget,
    });
  }
  return prompts;
}

export function selectCombatRollPrompt(prompts: readonly CombatRollPrompt[], requestedKey: string | null): CombatRollPrompt | null {
  return prompts.find(({ key }) => key === requestedKey)
    ?? prompts.find(({ ready, kind }) => ready && kind !== "free")
    ?? prompts.find(({ kind }) => kind !== "free")
    ?? prompts[0] ?? null;
}

/** A continuation must use the exact trigger declaration, not another exchange's defense state. */
type FirearmRollDeclaration = Readonly<{
  id: number;
  rollState: Readonly<{
    attackRollId: number | null;
    missingResponseRolls: number;
    resolved: boolean;
    message: string;
  }>;
}>;

export function buildFirearmRollPrompts(attacks: readonly Readonly<{
  id: number;
  actorParticipantId: number;
  actorName: string;
  itemName: string;
  effectiveStatus: string;
  status: string;
  triggerDeclarationId?: number;
  triggerTimingStatus: string | null;
  attackRollId: number | null;
  responderOpportunities: readonly Readonly<{ status: string }>[];
}>[], controlledParticipantIds: readonly number[], declarations: readonly FirearmRollDeclaration[] = []): CombatRollPrompt[] {
  const controlled = new Set(controlledParticipantIds);
  return attacks.flatMap((attack) => {
    if (!controlled.has(attack.actorParticipantId)) return [];
    const triggerReady = attack.effectiveStatus === "trigger-ready";
    if (!triggerReady && attack.status !== "committed") return [];
    const timingComplete = attack.triggerTimingStatus === "completed";
    const responsesComplete = attack.responderOpportunities.every(({ status }) => status !== "pending");
    const declaration = declarations.find(({ id }) => id === attack.triggerDeclarationId);
    const attackRollId = attack.attackRollId ?? declaration?.rollState.attackRollId ?? null;
    const kind = triggerReady ? "firearm-trigger" : attackRollId === null ? "firearm-roll" : "firearm-finish";
    // A response choice is not a response Roll. The first attack Roll may precede
    // defense Rolls, but finishing that staged shot must wait for those Rolls.
    const defenseRollsComplete = Boolean(declaration
      && (declaration.rollState.resolved || declaration.rollState.missingResponseRolls === 0));
    const canFinish = kind !== "firearm-finish" || defenseRollsComplete;
    return [{
      key: `${kind}:${attack.id}`, kind, recordId: attack.id,
      label: `${attack.actorName} — ${attack.itemName}`,
      ready: triggerReady || timingComplete && responsesComplete && canFinish,
      detail: triggerReady
        ? "Pull the trigger to begin this shot's timing. No dice are rolled by this step."
        : !timingComplete
          ? "The shot is still spending Initiative. G.O.D. must advance combat to its completion."
          : !responsesComplete
            ? "Choose the outstanding defenses or No Defense before rolling this shot."
            : kind === "firearm-roll"
              ? "This Roll is attached to this firearm attack, including its ammunition and per-bullet resolution."
              : !declaration
                ? "The attack Roll is already recorded. Refresh combat to load this shot's defense state; do not roll again."
                : !defenseRollsComplete
                  ? `The attack Roll is already recorded; waiting for ${declaration.rollState.missingResponseRolls} defense Roll${declaration.rollState.missingResponseRolls === 1 ? "" : "s"}. Finish firing will become available here when those Rolls arrive.`
                  : "The Roll is already recorded. Finish firing using that result; do not roll again.",
    }];
  });
}
