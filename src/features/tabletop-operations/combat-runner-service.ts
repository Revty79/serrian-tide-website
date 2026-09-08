import "server-only";

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { campaignSessionEncounterInitiative } from "@/db/tabletop-operations-schema";
import { buildCombatProgression, type CombatProgression } from "./combat-progression";
import {
  readActionDeclarationWorkspaceInTransaction,
  recordActionTimingCompletionsInTransaction,
  recordLongActionRoundContinuationsInTransaction,
} from "./action-declaration-service";
import { readDefenseInterventionWorkspaceInTransaction, resolveDeclaredDefensesIfReadyInTransaction } from "./defense-intervention-service";
import {
  readActionEffectWorkspaceInTransaction, generateActionEffectPlanInTransaction,
  approveActionEffectPlanInTransaction, applyActionEffectPlanInTransaction,
} from "./action-effect-plan-service";
import {
  canAdvanceInitiativeRound, getNextInitiativeTimelineEvent,
  advanceInitiativeToNextEvent, advanceInitiativeRound,
} from "./initiative-runtime";
import {
  loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction,
  type OwnedEncounterRuntimeContext, type RuntimeIntegrationTransaction,
} from "./runtime-integration-service";
import { withHeldCombatChoices, canFinishRoundWithHolders } from "./combat-held-actions";
import { publishTabletopInvalidationInTransaction } from "./tabletop-live-events";

export type CombatRunnerSnapshot = Readonly<{
  revision: string;
  rollRevisions?: Readonly<Record<string, string>>;
  progression: CombatProgression;
  autoContinue: boolean;
  heldNames: readonly string[];
}>;

/** Caller must first authorize and lock the exact Encounter. Never send this
 * internal aggregate directly to a Player: it contains G.O.D.-only snapshots. */
export async function readCombatRunnerInTransaction(tx: RuntimeIntegrationTransaction, context: OwnedEncounterRuntimeContext) {
  const [runtime] = await tx.select({ status: campaignSessionEncounterInitiative.status })
    .from(campaignSessionEncounterInitiative).where(eq(campaignSessionEncounterInitiative.encounterId, context.encounterId)).limit(1);
  if (!runtime || runtime.status === "closed") throw new Error("Start or recover Initiative before running combat.");
  const actor = { authority: "god-owner" as const, userId: context.ownerUserId };
  const engine = await loadInitiativeEngineInTransaction(tx, context.encounterId);
  const declarations = await readActionDeclarationWorkspaceInTransaction(tx, context, actor);
  const defenses = await readDefenseInterventionWorkspaceInTransaction(tx, context, actor);
  const effects = await readActionEffectWorkspaceInTransaction(tx, context);
  const event = getNextInitiativeTimelineEvent(engine);
  const progression = withHeldCombatChoices(engine, buildCombatProgression({
    runtimeStatus: runtime.status, timelineInitiative: engine.runtime.timelineInitiative,
    nextEvent: {
      kind: event.kind === "pending-round-boundary" ? "round-boundary" : event.kind,
      initiative: event.initiative,
      characterIds: event.kind === "normal-opportunity" ? event.characterIds : [],
      canAdvance: event.kind !== "none" && (event.kind !== "normal-opportunity" || event.initiative < engine.runtime.timelineInitiative),
    },
    canAdvanceRound: canAdvanceInitiativeRound(engine) || canFinishRoundWithHolders(engine),
    participants: declarations.participants, declarations: declarations.declarations,
    reactions: defenses.reactions, plans: effects.plans,
  }), declarations.participants);
  // Only stable persisted mechanics enter the revision. A retry or second tab
  // with the old revision cannot advance combat a second time.
  const revision = createHash("sha256").update(JSON.stringify({
    engine, declarations: declarations.declarations.map((entry) => ({
      id: entry.id, status: entry.status, timing: entry.timing, rollState: entry.rollState,
      opportunities: entry.opportunities, version: entry.versionNumber,
    })),
    reactions: defenses.reactions.map((entry) => [entry.id, entry.status, entry.rollId]),
    plans: effects.plans.map((entry) => [entry.id, entry.status, entry.effects]),
  })).digest("hex");
  // Another combatant's roll may change the encounter revision without changing
  // this immutable roll slot. Readiness and ownership are rechecked on submit.
  const rollRevisions = Object.fromEntries(progression.tasks.flatMap((task) => {
    if (task.kind !== "roll-attack" && task.kind !== "roll-defense") return [];
    const declaration = declarations.declarations.find(({ id }) => id === task.declarationId);
    const reaction = task.kind === "roll-defense" ? defenses.reactions.find(({ id }) => id === task.recordId) : null;
    const token = createHash("sha256").update(JSON.stringify({
      encounterId: context.encounterId, taskKey: task.key, participantId: task.participantId,
      recordId: task.recordId, pendingActionId: declaration?.pendingActionId,
      version: declaration?.versionNumber, action: declaration?.lockedSnapshot,
      defense: reaction?.declaration ?? null,
    })).digest("hex");
    return [[task.key, token]];
  }));
  const heldNames = engine.participants.filter(({ participationStatus }) => participationStatus === "holding")
    .map(({ characterId }) => declarations.participants.find((entry) => entry.characterId === characterId)?.name ?? "Holding combatant");
  const routine = progression.tasks.length > 0 && progression.tasks.every(({ kind, declarationId }) =>
    (kind === "apply-result" || kind === "resolve-exchange") && !declarations.declarations.some((entry) =>
      entry.id === declarationId && entry.draft.actionKind.startsWith("firearm-")));
  const applicationFailed = effects.plans.some(({ status }) => status === "application-failed" || status === "partially-applied");
  const snapshot: CombatRunnerSnapshot = { revision, rollRevisions, progression, heldNames,
    autoContinue: !applicationFailed && (routine || progression.canAdvanceTime && heldNames.length === 0) };
  return { snapshot, engine, declarations, defenses, effects, actor };
}

/** One authorized, revision-checked step. Decisions, dice, rounds and held
 * interventions are never silently supplied by this coordinator. */
export async function continueCombatRunnerInTransaction(
  tx: RuntimeIntegrationTransaction, context: OwnedEncounterRuntimeContext,
  input: { revision: string; command: "continue" | "round"; automatic?: boolean },
): Promise<{ changed: boolean; stale: boolean; snapshot: CombatRunnerSnapshot }> {
  if ([context.sessionStatus, context.sceneStatus, context.encounterStatus].some((status) => status !== "active")) {
    throw new Error("Combat requires an active Session, Scene and Encounter.");
  }
  let current = await readCombatRunnerInTransaction(tx, context);
  if (input.revision !== current.snapshot.revision) return { changed: false, stale: true, snapshot: current.snapshot };
  if (input.automatic && (input.command !== "continue" || !current.snapshot.autoContinue)) return { changed: false, stale: false, snapshot: current.snapshot };
  let changed = false;
  if (input.command === "round") {
    if (!current.snapshot.progression.canStartRound) throw new Error("Finish the displayed combat decisions before starting another round.");
    const after = advanceInitiativeRound(current.engine, canFinishRoundWithHolders(current.engine));
    await persistInitiativeEngineInTransaction(tx, context, current.engine, after);
    await recordLongActionRoundContinuationsInTransaction(tx, context, current.engine.runtime.roundNumber, after.runtime.roundNumber, after, context.ownerUserId);
    changed = true;
  } else if (current.snapshot.progression.canAdvanceTime) {
    const after = advanceInitiativeToNextEvent(current.engine);
    await persistInitiativeEngineInTransaction(tx, context, current.engine, after);
    const newlyCompleted = after.pendingActions.filter((action) => action.status === "completed"
      && current.engine.pendingActions.find(({ id }) => id === action.id)?.status !== "completed");
    await recordActionTimingCompletionsInTransaction(tx, context, newlyCompleted.map(({ id }) => id), context.ownerUserId);
    changed = true;
  } else {
    const tasks = current.snapshot.progression.tasks;
    if (!tasks.length || tasks.some(({ kind }) => kind !== "resolve-exchange" && kind !== "apply-result")) {
      throw new Error("Finish the displayed choice, roll or G.O.D. ruling first.");
    }
    const declarationIds = [...new Set(tasks.flatMap(({ declarationId }) => declarationId === null ? [] : [declarationId]))];
    for (const id of declarationIds) {
      const declaration = current.declarations.declarations.find((entry) => entry.id === id);
      if (!declaration || declaration.draft.actionKind.startsWith("firearm-")) throw new Error("Finish this shot using its firearm controls.");
      if (!declaration.rollState.resolved && declaration.lockedSnapshot?.authoredSource?.resolutionMode !== "automatic-no-roll") {
        await resolveDeclaredDefensesIfReadyInTransaction(tx, context, current.actor, id);
      }
    }
    // A successful Parry may have extended timing. Re-read before generating effects.
    current = await readCombatRunnerInTransaction(tx, context);
    if (current.snapshot.progression.tasks.some(({ kind }) => kind !== "resolve-exchange" && kind !== "apply-result")) {
      changed = true;
    } else {
      // Freeze every simultaneous result BEFORE applying any of them.
      const planIds: number[] = [];
      for (const id of declarationIds) planIds.push(await generateActionEffectPlanInTransaction(tx, context, current.actor, id));
      const prepared = await readActionEffectWorkspaceInTransaction(tx, context);
      const plans = prepared.plans.filter(({ id }) => planIds.includes(id));
      const needsRuling = plans.some((plan) => plan.status === "requires-god-ruling" || plan.effects.some((effect) =>
        !["applied", "declined", "manual-resolved"].includes(effect.status) && (effect.godReviewRequired || !effect.applicationSupported)));
      if (!needsRuling) {
        for (const plan of plans) {
          if (plan.status === "applied" || plan.status === "declined") continue;
          if (plan.status === "calculated") await approveActionEffectPlanInTransaction(tx, context, current.actor, plan.id, "Combat runner: all consequences are mechanically determined.");
          const status = await applyActionEffectPlanInTransaction(tx, context, current.actor, plan.id);
          if (status !== "applied") break; // Preserve partial results; do not auto-retry failures.
        }
      }
      changed = true;
    }
  }
  if (changed) await publishTabletopInvalidationInTransaction(tx, { ...context, characterIds: [], category: "action" });
  return { changed, stale: false, snapshot: (await readCombatRunnerInTransaction(tx, context)).snapshot };
}
