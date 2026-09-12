import type { readCombatOperations } from "./operation-actions";
import type { CombatScreenData } from "./screen-types";
import { isOrdinaryAttackReport, isSpellResultReport } from "./attack-report";

export type CombatOperations = Awaited<ReturnType<typeof readCombatOperations>>;
export type CombatFocus = { participantId: number; kind: "action" | "response" | "ruling"; planId?: number; sequence: number };
export type CombatNextInput = {
  label: string; explanation: string;
} & ({ kind: "wait" | "advance" | "round" }
  | { kind: "inspect"; participantId: number; focus: CombatFocus["kind"]; planId?: number }
  | { kind: "awareness"; opportunityId: number; participantId: number }
  | { kind: "resolve"; declarationId: number; firearmId?: number }
  | { kind: "review"; planId: number }
  | { kind: "trigger"; attackId: number });

export function automaticCombatInputKey(input: CombatNextInput, token: string): string | null {
  if (input.kind === "advance") return `${token}:advance`;
  if (input.kind === "resolve") return `${token}:resolve:${input.declarationId}:${input.firearmId ?? "ordinary"}`;
  if (input.kind === "trigger") return `${token}:trigger:${input.attackId}`;
  return null;
}

/** Navigation over authorized projections only. Engine services still decide and commit every change. */
export function combatNextInput(data: CombatScreenData, operations: CombatOperations | null): CombatNextInput {
  const projection = data.projection;
  const wait = (explanation: string): CombatNextInput => ({ kind: "wait", label: "Waiting", explanation });
  if (data.pause.frozen) return wait("Combat is paused by the G.O.D. Resume to continue from this point.");
  if (!projection || projection.closed) return wait(projection?.closed ? "Combat has ended. Information and history remain available." : "Prepare the encounter and initialize Initiative.");
  if (!operations) return wait("Reading the next combat input…");
  const choice = projection.entities.find((entity) => entity.mustChooseNow);
  const choose = (): CombatNextInput => ({ kind: "inspect", participantId: choice!.participantId, focus: "action",
    label: choice!.canControl ? `Choose ${choice!.name}'s action` : `View ${choice!.name}'s turn`, explanation: `${choice!.name} can choose an action against their own legal target, Hold or Pass. For a legitimate response, select Defend; the G.O.D. confirms eligibility. Other actions keep their remaining timing.${choice!.canControl ? "" : ` ${choice!.name}'s Player makes the choice.`}` });
  const respond = (action: NonNullable<CombatScreenData["projection"]>["declarations"][number], response: typeof action.opportunities[number]): CombatNextInput => {
    const name = action.lockedSnapshot?.label ?? action.draft.label;
    if (response.requiresGodConfirmation) return { kind: "awareness", opportunityId: response.id, participantId: response.responderCharacterId,
      label: `Can ${response.responderName} notice and respond to ${action.actorName}'s ${name}?`,
      explanation: `Decide from the situation at the table. Yes makes a response available; ${response.responderName} keeps any ordinary action choice. No continues this attack without that response. Neither choice applies damage early.` };
    const controlled = projection.entities.find((entity) => entity.participantId === response.responderCharacterId)?.canControl;
    return { kind: "inspect", participantId: response.responderCharacterId, focus: "response",
      label: controlled ? `Choose ${response.responderName}'s response` : `View ${response.responderName}'s response`,
      explanation: `${action.actorName}'s ${name} is waiting for ${response.responderName}${controlled ? " to choose a defense or no reaction below." : "'s Player to choose Defend, then a defense or no reaction on their screen."}` };
  };
  // Never infer a sealed choice from result readiness or committed resources.
  if (projection.checkpoint || operations.sealed) return choice ? choose() : wait(projection.progression.reason);
  const completed = projection.declarations.filter((entry) => entry.timing?.status === "completed" && !["resolved", "cancelled", "abandoned"].includes(entry.status));
  for (const action of completed) {
    const label = action.lockedSnapshot?.label ?? action.draft.label;
    const response = action.opportunities.find((opportunity) => {
      const entity = projection.entities.find((entry) => entry.participantId === opportunity.responderCharacterId);
      return opportunity.status === "pending" && opportunity.reactionId === null && entity && !entity.currentAction && !entity.participation.departed && entity.condition.status === "able"
        && (entity.responseDecisionOpportunityIds.includes(opportunity.id) || entity.canRespondNow);
    });
    if (response) return respond(action, response);
    const defense = operations.defenses?.reactions.find((entry) => entry.declarationId === action.id && entry.status === "needs-ruling");
    if (defense) return { kind: "inspect", participantId: defense.responderCharacterId, focus: "response", label: `Rule on the defense against ${label}`, explanation: "Resolve the specific defense question before applying the attack." };
    const report = operations.plans.find((entry) => entry.declarationId === action.id && (isOrdinaryAttackReport(entry) || isSpellResultReport(entry)) && ["calculated", "requires-god-ruling", "approved", "application-failed"].includes(entry.status));
    if (report) return { kind: "review", planId: report.id, label: `Review ${action.actorName}'s ${label}`, explanation: report.sourceKind === "spell" ? "Review the spell report below, then approve its calculated effects in one step." : "Review the attack report below, then approve its location and damage in one step." };
    const plan = operations.plans.find((entry) => entry.declarationId === action.id && ["requires-god-ruling", "partially-applied"].includes(entry.status));
    if (plan) return { kind: "inspect", participantId: action.actorCharacterId, focus: "ruling", planId: plan.id,
      label: `Rule on ${label} outcome`, explanation: plan.explanation };
    const firearm = operations.firearms?.attacks.find((entry) => entry.triggerDeclarationId === action.id || entry.aimDeclarationId === action.id);
    if (firearm?.aimDeclarationId === action.id && !firearm.triggerPendingActionId) {
      const entity = projection.entities.find((entry) => entry.participantId === action.actorCharacterId);
      return entity?.canControl ? { kind: "trigger", attackId: firearm.id, label: `Begin ${action.actorName}'s firing`, explanation: "Aim is complete. Continue using the original declaration Roll." }
        : { kind: "inspect", participantId: action.actorCharacterId, focus: "ruling", label: `Inspect ${action.actorName}'s completed Aim`, explanation: "The controlling Player can begin firing with the original Roll." };
    }
    return { kind: "resolve", declarationId: action.id, ...(firearm ? { firearmId: firearm.id } : {}),
      label: `Prepare ${action.actorName}'s ${label} result`, explanation: "Timing is complete. Prepare the result report using the recorded Roll and defense." };
  }
  if (choice) return choose();
  // Reached responses can be due while an action is still underway (including
  // sustained firing). Ask about those before attempting another timeline event.
  for (const action of projection.declarations.filter((entry) => entry.timing?.status === "active")) {
    const response = action.opportunities.find((opportunity) => {
      const entity = projection.entities.find((entry) => entry.participantId === opportunity.responderCharacterId);
      return opportunity.status === "pending" && opportunity.reactionId === null && entity && !entity.currentAction && !entity.participation.departed && entity.condition.status === "able"
        && (entity.responseDecisionOpportunityIds.includes(opportunity.id) || entity.canRespondNow);
    });
    if (response) return respond(action, response);
    const portion = operations.plans.find((plan) => plan.declarationId === action.id && plan.sourceSnapshot.identity.startsWith("firearm-attack:") && ["requires-god-ruling", "partially-applied"].includes(plan.status));
    if (portion) return { kind: "inspect", participantId: action.actorCharacterId, focus: "ruling", planId: portion.id, label: `Rule on ${portion.sourceSnapshot.displayName} firing result`, explanation: portion.explanation };
    const defense = operations.defenses?.reactions.find((entry) => entry.declarationId === action.id && entry.status === "needs-ruling");
    if (defense) return { kind: "inspect", participantId: defense.responderCharacterId, focus: "response", label: "Resolve the firing response", explanation: "Resolve the specific defense question at this Initiative before continuing the firing portion." };
    const firearm = operations.firearms?.attacks.find((entry) => entry.triggerDeclarationId === action.id && entry.firingPortionReady);
    if (firearm) return { kind: "resolve", declarationId: action.id, firearmId: firearm.id, label: `Finish ${action.actorName}'s firing portion`, explanation: "This portion has reached its firing point. Resolve it with the original Roll before advancing again." };
  }
  if (projection.progression.canAdvanceTimeline) return { kind: "advance", label: "Advance combat", explanation: "Continue to the next action opportunity or completion. No unfinished hit is applied early." };
  if (projection.progression.canAdvanceRound) return { kind: "round", label: "Next round", explanation: "Continue with preserved Initiative debt and pending work." };
  return wait(projection.progression.reason);
}
