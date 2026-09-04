import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import type { CharacterSkillLineageInput } from "@/features/items/character-weapon-governance";
import { validateCanonicalSkillPath } from "@/features/items/weapon-skill-governance";

import {
  buildDefenseInterventionSnapshot,
  getDefenseInitiativeCommitment,
  parseDefenseInterventionSnapshot,
  reconcileDefenseCost,
  resolveDefenseGroup,
  resolveDodgeGovernance,
  resolveTackle,
  type DefenseSkillPathMapping,
} from "./defense-intervention";
import { extendPendingInitiativeActionCost, type InitiativeEngineState } from "./initiative-runtime";
import { resolvePercentileCheck } from "./percentile-resolution";

const SKILLS = [
  { id: 1, name: "Reactive Defense", classification: "General", tier: 1, primaryAttribute: "DEX", secondaryAttribute: null, definition: "" },
  { id: 2, name: "Close Evasion", classification: "General", tier: 2, primaryAttribute: "DEX", secondaryAttribute: null, definition: "" },
  { id: 3, name: "Aerial Operations", classification: "General", tier: 1, primaryAttribute: "STR", secondaryAttribute: null, definition: "" },
  { id: 4, name: "Flight Evasion", classification: "General", tier: 2, primaryAttribute: "STR", secondaryAttribute: null, definition: "" },
  { id: 5, name: "Sibling Defense", classification: "General", tier: 2, primaryAttribute: "DEX", secondaryAttribute: null, definition: "" },
] as const;

const RELATIONSHIPS = [
  { id: 1, skillId: 2, relatedSkillId: 1, relationshipType: "parent", sortOrder: 0 },
  { id: 2, skillId: 4, relatedSkillId: 3, relationshipType: "parent", sortOrder: 0 },
  { id: 3, skillId: 5, relatedSkillId: 1, relationshipType: "parent", sortOrder: 0 },
] as const;

function lineage(allocations: CharacterSkillLineageInput["allocations"] = []): CharacterSkillLineageInput {
  return {
    context: { characterId: 9, npcKind: "race" },
    attributes: { STR: 40, DEX: 30, CON: 20, INT: 20, WIS: 20, CHR: 20 },
    allocations,
    skillCatalog: SKILLS.map((entry) => ({ ...entry, spellLevel: null, manaCost: null, spellDocumentJson: null })),
    skillRelationships: RELATIONSHIPS,
    race: null,
  };
}

function mapping(id: number, endpointSkillId: number, overrides: Partial<DefenseSkillPathMapping> = {}): DefenseSkillPathMapping {
  return {
    id,
    endpointSkillId,
    reviewState: "approved",
    conditional: false,
    circumstanceLabel: "",
    sortOrder: id,
    path: validateCanonicalSkillPath(endpointSkillId, SKILLS, RELATIONSHIPS),
    ...overrides,
  };
}

function roll(resultTotal: number, target = 50) {
  return resolvePercentileCheck({ resultTotal, originalTarget: target });
}

test("No Defense costs zero, never needs a Roll, and remains an immutable declaration snapshot", () => {
  assert.equal(getDefenseInitiativeCommitment("no-reaction"), 0);
  const snapshot = buildDefenseInterventionSnapshot({
    actionDeclarationId: 1,
    pendingActionId: 2,
    responderOpportunityId: 3,
    responderCharacterId: 4,
    protectedTargetCharacterId: 4,
    targetCharacterId: 5,
    opposesReactionId: null,
    reactionType: "no-reaction",
    source: { kind: "none", label: "No Defense", itemId: null, instanceId: null, skillAllocationId: null, attributeKey: null, derivedAbilityId: null, sourceRef: null, governingSource: null, governingSnapshot: null },
    rollRequired: false,
    initiativeCost: 0,
    explicitModifiers: [],
    intendedMechanicalPurpose: "",
    godApprovalReason: "",
    declaredByUserId: "player",
    declaredAt: "2026-09-05T00:00:00.000Z",
  });
  assert.deepEqual(parseDefenseInterventionSnapshot(snapshot), snapshot);
  assert.throws(() => buildDefenseInterventionSnapshot({ ...snapshot, rollRequired: true }), /never creates a Roll/);
});

test("Dodge selects the lowest exact approved path, preserves ties, and ignores review-required mappings", () => {
  const resolved = resolveDodgeGovernance({
    lineage: lineage(),
    mappings: [mapping(1, 2), mapping(2, 4), mapping(3, 5, { reviewState: "review-required" })],
  });
  assert.equal(resolved.status, "resolved");
  if (resolved.status !== "resolved") return;
  assert.equal(resolved.selected.source.kind, "attribute");
  assert.equal(resolved.selected.source.originalTarget, 60);
  assert.deepEqual(resolved.tiedMappingIds, [2]);

  const tied = resolveDodgeGovernance({ lineage: lineage(), mappings: [mapping(10, 4), mapping(11, 4)] });
  assert.equal(tied.status, "resolved");
  if (tied.status === "resolved") {
    assert.equal(tied.hasTie, true);
    assert.deepEqual(tied.tiedMappingIds, [10, 11]);
  }
});

test("Dodge conditional routes need explicit approval and exact allocation lineage never jumps to a sibling", () => {
  const conditional = mapping(1, 2, { conditional: true, circumstanceLabel: "Room to move" });
  assert.equal(resolveDodgeGovernance({ lineage: lineage(), mappings: [conditional] }).status, "needs-god-ruling");
  assert.equal(resolveDodgeGovernance({ lineage: lineage(), mappings: [conditional], approvedConditionalMappingIds: [1] }).status, "resolved");

  const exact = resolveDodgeGovernance({
    lineage: lineage([{ id: 90, characterId: 9, skillId: 5, parentAllocationId: null, points: 20 }]),
    mappings: [mapping(2, 2)],
  });
  assert.equal(exact.status, "resolved");
  if (exact.status === "resolved") assert.equal(exact.selected.source.kind, "attribute");
});

test("Dodge always costs one and adds no attacker cost on either result", () => {
  assert.equal(getDefenseInitiativeCommitment("dodge"), 1);
  assert.deepEqual(reconcileDefenseCost({ reactionType: "dodge", committedInitiativeCost: 1, defenseSucceeded: true }), { defenderFinalCost: 1, defenderRefund: 0, attackerAdditionalCost: 0 });
  assert.deepEqual(reconcileDefenseCost({ reactionType: "dodge", committedInitiativeCost: 1, defenseSucceeded: false }), { defenderFinalCost: 1, defenderRefund: 0, attackerAdditionalCost: 0 });
});

test("Parry and Block commit full Item cost, refund successful defense to one, and add full cost to attacker", () => {
  assert.equal(getDefenseInitiativeCommitment("parry", 6), 6);
  assert.equal(getDefenseInitiativeCommitment("block", 4), 4);
  assert.deepEqual(reconcileDefenseCost({ reactionType: "parry", committedInitiativeCost: 6, defenseSucceeded: true }), { defenderFinalCost: 1, defenderRefund: 5, attackerAdditionalCost: 6 });
  assert.deepEqual(reconcileDefenseCost({ reactionType: "block", committedInitiativeCost: 4, defenseSucceeded: true }), { defenderFinalCost: 1, defenderRefund: 3, attackerAdditionalCost: 4 });
  assert.deepEqual(reconcileDefenseCost({ reactionType: "parry", committedInitiativeCost: 6, defenseSucceeded: false }), { defenderFinalCost: 6, defenderRefund: 0, attackerAdditionalCost: 0 });
  assert.throws(() => getDefenseInitiativeCommitment("block", null), /greater than zero/);
});

test("multiple defenders resolve independently and every successful Parry or Block contributes its full cost", () => {
  const result = resolveDefenseGroup({
    attack: roll(70),
    defenses: [
      { reactionId: 1, reactionType: "parry", committedInitiativeCost: 6, roll: roll(80) },
      { reactionId: 2, reactionType: "block", committedInitiativeCost: 4, roll: roll(90) },
      { reactionId: 3, reactionType: "dodge", committedInitiativeCost: 1, roll: roll(50) },
    ],
  });
  assert.equal(result.atLeastOneDefenseStoppedAttack, true);
  assert.equal(result.attackStopped, true);
  assert.equal(result.attackerAdditionalCost, 10);
  assert.deepEqual(result.outcomes.map(({ defenderFinalCost }) => defenderFinalCost), [1, 1, 1]);
});

test("ordinary ties favor defense, higher attack wins, and missing response Roll blocks resolution", () => {
  const tie = resolveDefenseGroup({ attack: roll(60), defenses: [{ reactionId: 1, reactionType: "dodge", committedInitiativeCost: 1, roll: roll(60) }] });
  assert.equal(tie.attackStopped, true);
  const attackWins = resolveDefenseGroup({ attack: roll(80), defenses: [{ reactionId: 1, reactionType: "dodge", committedInitiativeCost: 1, roll: roll(60) }] });
  assert.equal(attackWins.attackContinues, true);
  const missing = resolveDefenseGroup({ attack: roll(80), defenses: [{ reactionId: 1, reactionType: "dodge", committedInitiativeCost: 1, roll: null }] });
  assert.equal(missing.status, "unresolved");
  assert.deepEqual(missing.missingRollReactionIds, [1]);
});

test("double-ott exception and complicated critical collisions remain Pass 1 G.O.D. rulings", () => {
  const exception = resolveDefenseGroup({ attack: roll(100), defenses: [{ reactionId: 1, reactionType: "dodge", committedInitiativeCost: 1, roll: roll(100) }] });
  assert.equal(exception.status, "awaiting-god-ruling");
  assert.equal(exception.attackContinues, true);
  const collision = resolveDefenseGroup({ attack: roll(1), defenses: [{ reactionId: 2, reactionType: "parry", committedInitiativeCost: 5, roll: roll(100) }] });
  assert.equal(collision.status, "awaiting-god-ruling");
  assert.equal(collision.outcomes[0]?.status, "god-ruling-required");
  assert.equal(collision.attackerAdditionalCost, 0);
});

test("Tackle costs three, resolves cooperation without a defense Roll, and never transfers a firearm bullet", () => {
  assert.equal(getDefenseInitiativeCommitment("tackle"), 3);
  const rescue = resolveTackle({ tackleRoll: roll(50), targetResponse: "no-defense", dangerKind: "firearm" });
  assert.equal(rescue.status, "succeeded");
  assert.equal(rescue.targetRemovedFromPath, true);
  assert.equal(rescue.bulletTransferredToTackler, false);
  assert.equal(rescue.originalActionRequiresGodDisposition, false);
  const failed = resolveTackle({ tackleRoll: roll(40), targetResponse: roll(80), dangerKind: "firearm" });
  assert.equal(failed.status, "failed");
  assert.equal(failed.targetRemovedFromPath, false);
  assert.equal("complication" in failed, false);
  const other = resolveTackle({ tackleRoll: roll(80), targetResponse: "no-defense", dangerKind: "other" });
  assert.equal(other.originalActionRequiresGodDisposition, true);
});

test("attacker extension preserves original cost, records added cost, and never rewinds the timeline", () => {
  const state: InitiativeEngineState = {
    runtime: { encounterId: 1, status: "active", roundNumber: 1, stepNumber: 3, timelineInitiative: 22, startedAt: new Date(), closedAt: null },
    participants: [{ encounterId: 1, characterId: 1, normalTotalInitiative: 30, currentInitiative: 22, participationStatus: "active", deferredInitiativeCost: 0, lastSatisfiedStep: 2, movementMode: "Land" }],
    pendingActions: [{ id: 7, encounterId: 1, actorCharacterId: 1, label: "Attack", actionKind: "attack", allowsMultiRound: true, originalInitiativeCost: 8, additionalInitiativeCost: 0, initiativeSpent: 8, remainingInitiativeCost: 0, startInitiative: 30, startTimelineInitiative: 20, expectedCompletionInitiative: 22, status: "completed", startedRound: 1, completedRound: 1 }],
  };
  const extended = extendPendingInitiativeActionCost(state, 7, 6);
  const action = extended.pendingActions[0]!;
  assert.equal(action.originalInitiativeCost, 8);
  assert.equal(action.additionalInitiativeCost, 6);
  assert.equal(action.remainingInitiativeCost, 6);
  assert.equal(action.expectedCompletionInitiative, 16);
  assert.equal(action.status, "active");
  assert.equal(extended.runtime.timelineInitiative, 22);
});

test("Pass 7 outcome structures manufacture no damage, Health, armor, ammunition, Conditions, tactics, or movement", () => {
  const result = resolveDefenseGroup({ attack: roll(70), defenses: [{ reactionId: 1, reactionType: "dodge", committedInitiativeCost: 1, roll: roll(80) }] });
  for (const forbidden of ["damage", "health", "armor", "soak", "ammunition", "condition", "tactic", "movement"]) {
    assert.equal(forbidden in result, false);
  }
});

test("migration 0026 extends the existing Reaction and pending-action models without rewriting earlier history", () => {
  const sql = readFileSync(path.join(process.cwd(), "drizzle/0026_defense_intervention_runtime.sql"), "utf8");
  assert.match(sql, /ALTER TYPE "public"\."campaign_session_encounter_reaction_type" ADD VALUE (?:IF NOT EXISTS )?'tackle'/);
  assert.match(sql, /ADD COLUMN "declaration_snapshot_json" jsonb/);
  assert.match(sql, /ADD COLUMN "additional_initiative_cost" double precision DEFAULT 0 NOT NULL/);
  assert.match(sql, /CREATE TABLE "campaign_session_encounter_reaction_event"/);
  assert.match(sql, /CREATE TABLE "defense_skill_path_mapping"/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DELETE FROM|UPDATE "campaign_session_encounter_reaction"/i);
});
