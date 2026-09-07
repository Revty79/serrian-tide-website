/**
 * Shared, side-effect-free combat guidance. Timing completion is not exchange
 * completion: due rolls/results must settle before another ordinary opportunity.
 * This module never picks a tactic, rolls dice, or changes Initiative.
 */
export type CombatTaskKind =
  | "choose-action" | "eligibility" | "choose-response"
  | "roll-attack" | "roll-defense" | "resolve-exchange" | "apply-result"
  | "ruling" | "advance-time" | "next-round" | "start" | "closed" | "blocked";

export type CombatTask = Readonly<{
  key: string;
  kind: CombatTaskKind;
  participantId: number | null;
  declarationId: number | null;
  recordId: number | null;
  title: string;
  detail: string;
}>;

type Opportunity = Readonly<{
  id: number; responderCharacterId: number; responderName: string;
  status: string; requiresGodConfirmation: boolean; reachedAtInitiative: number;
}>;
type Declaration = Readonly<{
  id: number; actorCharacterId: number; actorName: string; status: string;
  pendingActionId: number | null;
  draft: Readonly<{ label: string; actionKind: string }>;
  lockedSnapshot: Readonly<{
    label: string;
    authoredSource?: Readonly<{ resolutionMode: string }> | null;
  }> | null;
  timing: Readonly<{ status: string; startInitiative: number; remainingInitiativeCost: number }> | null;
  opportunities: readonly Opportunity[];
  rollState: Readonly<{ attackRollId: number | null; resolved: boolean; message: string }>;
}>;
type Reaction = Readonly<{
  id: number; declarationId: number; responderCharacterId: number;
  responderName: string; status: string; rollRequired: boolean; rollId: number | null;
}>;
type Plan = Readonly<{
  id: number; declarationId: number; status: string;
}>;
export type CombatProgressionInput = Readonly<{
  runtimeStatus: "active" | "closed" | "not-initialized";
  timelineInitiative: number;
  nextEvent: null | Readonly<{
    kind: "normal-opportunity" | "pending-completion" | "round-boundary" | "none";
    initiative: number; characterIds: readonly number[]; canAdvance: boolean;
  }>;
  canAdvanceRound: boolean;
  participants: readonly Readonly<{ characterId: number; name: string }>[];
  declarations: readonly Declaration[];
  reactions: readonly Reaction[];
  plans: readonly Plan[];
}>;
export type CombatProgression = Readonly<{
  tasks: readonly CombatTask[];
  /** Ordinary choices and time advancement must not outrun due exchanges. */
  canAdvanceTime: boolean;
  canStartRound: boolean;
  actingParticipantIds: readonly number[];
}>;

const terminalDeclarations = new Set(["resolved", "cancelled", "abandoned"]);
const terminalPlans = new Set(["applied", "declined", "cancelled", "superseded"]);
const rollable = new Set(["rolling-ready", "rolling", "awaiting-god-ruling"]);
function task(kind: CombatTaskKind, key: string, title: string, detail: string,
  participantId: number | null = null, declarationId: number | null = null,
  recordId: number | null = null): CombatTask {
  return { kind, key, title, detail, participantId, declarationId, recordId };
}
function result(tasks: CombatTask[]): CombatProgression {
  return {
    tasks,
    canAdvanceTime: tasks.length === 1 && tasks[0].kind === "advance-time",
    canStartRound: tasks.length === 1 && tasks[0].kind === "next-round",
    actingParticipantIds: tasks.filter(({ kind }) => kind === "choose-action")
      .flatMap(({ participantId }) => participantId === null ? [] : [participantId]),
  };
}
function responses(declaration: Declaration): CombatTask[] {
  return declaration.opportunities.filter(({ status }) => status === "pending").map((opportunity) => task(
    opportunity.requiresGodConfirmation ? "eligibility" : "choose-response",
    `response:${opportunity.id}`,
    opportunity.requiresGodConfirmation ? `Can ${opportunity.responderName} respond?` : `${opportunity.responderName}: choose a response`,
    `Against ${declaration.actorName} — ${declaration.lockedSnapshot?.label ?? declaration.draft.label}.`,
    opportunity.responderCharacterId, declaration.id, opportunity.id,
  ));
}
function exchangeTasks(declaration: Declaration, input: CombatProgressionInput): CombatTask[] {
  const label = `${declaration.actorName} — ${declaration.lockedSnapshot?.label ?? declaration.draft.label}`;
  const choices = responses(declaration);
  if (choices.length) return choices;
  const reactions = input.reactions.filter(({ declarationId }) => declarationId === declaration.id);
  if (declaration.status === "interrupted" || declaration.status === "awaiting-god-ruling"
    || reactions.some(({ status }) => status === "needs-ruling")) {
    return [task("ruling", `ruling:${declaration.id}`, `G.O.D. decision: ${label}`,
      declaration.rollState.message, declaration.actorCharacterId, declaration.id)];
  }
  const rolls: CombatTask[] = [];
  if (!declaration.rollState.resolved && rollable.has(declaration.status)) {
    for (const reaction of reactions) {
      if (reaction.status === "declared" && reaction.rollRequired && reaction.rollId === null) {
        rolls.push(task("roll-defense", `roll-defense:${reaction.id}`, `${reaction.responderName}: roll defense`,
          `Responding to ${label}.`, reaction.responderCharacterId, declaration.id, reaction.id));
      }
    }
    const automatic = declaration.lockedSnapshot?.authoredSource?.resolutionMode === "automatic-no-roll";
    if (!automatic && declaration.rollState.attackRollId === null) {
      rolls.push(task("roll-attack", `roll-attack:${declaration.id}`, `${declaration.actorName}: roll the action`,
        label, declaration.actorCharacterId, declaration.id, declaration.id));
    }
    if (rolls.length) return rolls;
  }
  const plan = input.plans.find(({ declarationId }) => declarationId === declaration.id);
  if (plan && !terminalPlans.has(plan.status)) {
    return [task(plan.status === "requires-god-ruling" ? "ruling" : "apply-result",
      `result:${plan.id}`, `Finish result: ${label}`, `Result status: ${plan.status.replaceAll("-", " ")}.`,
      declaration.actorCharacterId, declaration.id, plan.id)];
  }
  return [task(declaration.rollState.resolved ? "apply-result" : "resolve-exchange",
    `finish:${declaration.id}`, `Finish ${label}`,
    declaration.rollState.resolved ? "Apply the known result before moving combat forward." : "Compare the recorded rolls, or finish this action without dice when its rules require no roll.",
    declaration.actorCharacterId, declaration.id, declaration.id)];
}

export function buildCombatProgression(input: CombatProgressionInput): CombatProgression {
  if (input.runtimeStatus === "not-initialized") return result([task("start", "start", "Start combat", "Choose participants and start Initiative.")]);
  if (input.runtimeStatus === "closed") return result([task("closed", "closed", "Combat is closed", "G.O.D. can review or recover unfinished combat.")]);
  const open = input.declarations.filter(({ status }) => !terminalDeclarations.has(status));
  // Return every due exchange, not whichever actor happens to be selected.
  const due = open.filter(({ timing }) => timing?.status === "completed");
  if (due.length) return result(due.flatMap((declaration) => exchangeTasks(declaration, input)));
  // A resolved declaration with an unapplied result also must not disappear.
  const outstandingPlans = input.plans.filter((plan) => !terminalPlans.has(plan.status)
    && input.declarations.some((declaration) => declaration.id === plan.declarationId
      && declaration.timing?.status === "completed" && declaration.status === "resolved"));
  if (outstandingPlans.length) return result(outstandingPlans.map((plan) => task(
    plan.status === "requires-god-ruling" ? "ruling" : "apply-result", `result:${plan.id}`,
    "Finish the combat result", `Result status: ${plan.status.replaceAll("-", " ")}.`, null, plan.declarationId, plan.id,
  )));
  const next = input.nextEvent;
  const actionChoices = () => (next?.characterIds ?? []).map((id) => task("choose-action", `act:${id}`,
    `${input.participants.find(({ characterId }) => characterId === id)?.name ?? "Combatant"}: choose an action`,
    `Initiative ${next?.initiative}. Choose an action, Hold, or Pass.`, id));
  // Existing server guards require simultaneous ordinary choices before response
  // eligibility. Do not direct the table into a forbidden defense operation.
  const simultaneous = next?.kind === "normal-opportunity" && !next.canAdvance
    && open.some((declaration) => declaration.timing?.startInitiative === next.initiative
      && declaration.opportunities.some((opportunity) => opportunity.status === "pending"
        && opportunity.reachedAtInitiative === next.initiative
        && next.characterIds.includes(opportunity.responderCharacterId)));
  if (simultaneous) return result(actionChoices());
  const interrupted = open.filter(({ status }) => status === "interrupted" || status === "awaiting-god-ruling");
  if (interrupted.length) return result(interrupted.flatMap((declaration) => exchangeTasks(declaration, input)));
  const choices = open.flatMap(responses);
  if (choices.length) return result(choices);
  if (next?.canAdvance) return result([task("advance-time", `time:${input.timelineInitiative}:${next.initiative}`,
    `Continue to Initiative ${next.initiative}`, "No unresolved response choice is being skipped.")]);
  if (next?.kind === "normal-opportunity") return result(actionChoices());
  if (input.canAdvanceRound) return result([task("next-round", "next-round", "Start the next round", "Keep unused Initiative and debt; continue long actions.")]);
  return result([task("blocked", "blocked", "G.O.D. decision needed",
    "Check holding combatants or an interrupted action. No roll, response, or round change has been invented.")]);
}
