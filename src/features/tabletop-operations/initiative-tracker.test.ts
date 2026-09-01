import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  advanceInitiativeToNextEvent,
  closeInitiativeRuntime,
  correctInitiativeRuntimePosition,
  enrollLateInitiativeParticipant,
  holdInitiative,
  initializeInitiativeRuntime,
  passInitiative,
  setCurrentInitiative,
  startInitiativeAction,
  type InitiativeEngineState,
} from "./initiative-runtime";
import {
  buildInitiativeTrackerReadModel,
  type InitiativeTrackerIdentityInput,
  type InitiativeTrackerRuntimeInput,
} from "./initiative-tracker";

function readSource(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const identities: InitiativeTrackerIdentityInput[] = [
  { characterId: 1, name: "Bob", kind: "pc", kindLabel: "Player Character", playerName: "Brannan", creatureTemplateName: null },
  { characterId: 2, name: "Ryan", kind: "race-npc", kindLabel: "Race NPC", playerName: null, creatureTemplateName: null },
  { characterId: 3, name: "Ash Cat", kind: "creature-npc", kindLabel: "Creature NPC", playerName: null, creatureTemplateName: "Ash Cat" },
];

const capacities = identities.map(({ characterId }) => ({
  characterId,
  movementModes: [{ movementMode: characterId === 3 ? "Climb" : "Land", baseMovement: 3, normalTotalInitiative: 30 }],
  error: null,
}));

function serializable(engine: InitiativeEngineState): InitiativeTrackerRuntimeInput {
  return {
    runtime: {
      ...engine.runtime,
      startedAt: engine.runtime.startedAt.toISOString(),
      closedAt: engine.runtime.closedAt?.toISOString() ?? null,
    },
    participants: engine.participants,
    pendingActions: engine.pendingActions,
  };
}

function model(engine: InitiativeEngineState | null, overrides: Partial<{
  encounterStatus: "planned" | "active" | "completed";
  sceneStatus: "planned" | "active" | "completed";
  sessionStatus: "planned" | "active" | "completed";
}> = {}) {
  return buildInitiativeTrackerReadModel({
    encounter: { id: 9, title: "The Bridge", status: overrides.encounterStatus ?? "active" },
    sessionStatus: overrides.sessionStatus ?? "active",
    sceneStatus: overrides.sceneStatus ?? "active",
    identities,
    capacities,
    runtime: engine ? serializable(engine) : null,
  });
}

function state(...entrants: Array<{ characterId: number; normalTotalInitiative: number }>): InitiativeEngineState {
  return initializeInitiativeRuntime(9, entrants.map((entrant) => ({ ...entrant, movementMode: "Land" })), new Date("2026-09-01T18:00:00.000Z"));
}

test("Tracker joins runtime Participants to Encounter identity without copying identity into Initiative state", () => {
  const tracker = model(state(
    { characterId: 1, normalTotalInitiative: 35 },
    { characterId: 2, normalTotalInitiative: 30 },
    { characterId: 3, normalTotalInitiative: 25 },
  ));
  assert.deepEqual(tracker.participants.map(({ name, kindLabel }) => [name, kindLabel]), [
    ["Bob", "Player Character"],
    ["Ryan", "Race NPC"],
    ["Ash Cat", "Creature NPC"],
  ]);
  assert.equal(tracker.participants[0]!.playerName, "Brannan");
  assert.equal(tracker.participants[2]!.creatureTemplateName, "Ash Cat");
  assert.equal("name" in tracker.runtime!.participants[0]!, false);
});

test("initialization is available only for an active hierarchy with Participants and no runtime", () => {
  assert.equal(model(null).canInitialize, true);
  assert.equal(model(null, { encounterStatus: "planned" }).canInitialize, false);
  assert.match(model(null, { sceneStatus: "planned" }).initializationBlockReason!, /active Session, Scene, and Encounter/);
  assert.equal(model(state({ characterId: 1, normalTotalInitiative: 35 })).canInitialize, false);

  const empty = buildInitiativeTrackerReadModel({
    encounter: { id: 9, title: "Empty", status: "active" },
    sessionStatus: "active",
    sceneStatus: "active",
    identities: [],
    capacities: [],
    runtime: null,
  });
  assert.equal(empty.canInitialize, false);
  assert.match(empty.initializationBlockReason!, /at least one Encounter Participant/);
});

test("next-event presentation distinguishes normal opportunity, completion precedence, Round boundary, and none", () => {
  const normal = model(state(
    { characterId: 1, normalTotalInitiative: 35 },
    { characterId: 2, normalTotalInitiative: 30 },
  ));
  assert.equal(normal.nextEvent?.kind, "normal-opportunity");
  assert.equal(normal.nextEvent?.canAdvance, false);

  let completion = state(
    { characterId: 1, normalTotalInitiative: 35 },
    { characterId: 2, normalTotalInitiative: 30 },
  );
  completion = startInitiativeAction(completion, {
    id: 11, actorCharacterId: 1, label: "Sword Attack", initiativeCost: 5, allowsMultiRound: false,
  });
  const completionView = model(completion);
  assert.equal(completionView.nextEvent?.kind, "pending-completion");
  assert.equal(completionView.nextEvent?.initiative, 30);
  assert.match(completionView.nextEvent!.summary, /Bob — Sword Attack completes at 30/);

  let boundary = setCurrentInitiative(state({ characterId: 1, normalTotalInitiative: 10 }), 1, 5);
  boundary = correctInitiativeRuntimePosition(boundary, { roundNumber: 1, stepNumber: 1, timelineInitiative: 5 });
  boundary = startInitiativeAction(boundary, {
    id: 12, actorCharacterId: 1, label: "Ritual", initiativeCost: 12, allowsMultiRound: true,
  });
  assert.equal(model(boundary).nextEvent?.kind, "round-boundary");

  const none = passInitiative(state({ characterId: 1, normalTotalInitiative: 20 }), 1);
  assert.equal(model(none).nextEvent?.kind, "none");
});

test("Held intervention presents retained 23 to completion 21", () => {
  let engine = state(
    { characterId: 1, normalTotalInitiative: 23 },
    { characterId: 2, normalTotalInitiative: 21 },
  );
  engine = holdInitiative(engine, 1);
  engine = advanceInitiativeToNextEvent(engine);
  const holding = model(engine).participants.find(({ characterId }) => characterId === 1)!;
  assert.equal(holding.currentInitiative, 23);
  assert.equal(holding.canIntervene, true);
  engine = startInitiativeAction(engine, {
    id: 13, actorCharacterId: 1, label: "Punch", initiativeCost: 2, allowsMultiRound: false, heldIntervention: true,
  });
  const tracker = model(engine);
  const action = tracker.pendingActions.find(({ id }) => id === 13)!;
  assert.equal(action.startInitiative, 23);
  assert.equal(action.startTimelineInitiative, 21);
  assert.equal(action.expectedCompletionInitiative, 21);
});

test("retained completion above timeline is displayed without rewinding shared time", () => {
  let engine = state(
    { characterId: 1, normalTotalInitiative: 23 },
    { characterId: 2, normalTotalInitiative: 20 },
  );
  engine = holdInitiative(engine, 1);
  engine = advanceInitiativeToNextEvent(engine);
  engine = startInitiativeAction(engine, {
    id: 14, actorCharacterId: 1, label: "Retained Strike", initiativeCost: 2, allowsMultiRound: false, heldIntervention: true,
  });
  const tracker = model(engine);
  assert.equal(tracker.runtime?.runtime.timelineInitiative, 20);
  assert.equal(tracker.nextEvent?.initiative, 21);
  assert.match(tracker.nextEvent!.detail, /timeline remains 20/);
});

test("late entry and signed uncapped values remain truthful in presentation", () => {
  let engine = passInitiative(state({ characterId: 1, normalTotalInitiative: 20 }), 1);
  engine = enrollLateInitiativeParticipant(engine, { characterId: 2, normalTotalInitiative: 30, movementMode: "Land" });
  engine = enrollLateInitiativeParticipant(engine, { characterId: 3, normalTotalInitiative: 35, movementMode: "Climb" });
  engine = setCurrentInitiative(engine, 1, -4);
  engine = setCurrentInitiative(engine, 3, 70);
  const tracker = model(engine);
  assert.equal(tracker.runtime?.runtime.timelineInitiative, 20);
  assert.equal(tracker.participants.find(({ characterId }) => characterId === 2)?.currentInitiative, 30);
  assert.equal(tracker.participants.find(({ characterId }) => characterId === 2)?.normalTotalInitiative, 30);
  assert.equal(tracker.participants.find(({ characterId }) => characterId === 3)?.currentInitiative, 70);
  assert.equal(tracker.participants.find(({ characterId }) => characterId === 1)?.currentInitiative, -4);
});

test("Tracker sorting, action affordances, and reaction hints derive from engine helpers", () => {
  let engine = state(
    { characterId: 1, normalTotalInitiative: 35 },
    { characterId: 2, normalTotalInitiative: 30 },
    { characterId: 3, normalTotalInitiative: 20 },
  );
  engine = startInitiativeAction(engine, {
    id: 15, actorCharacterId: 1, label: "Cast Spell", initiativeCost: 8, allowsMultiRound: false,
  });
  const tracker = model(engine);
  assert.equal(tracker.nextEvent?.kind, "normal-opportunity");
  assert.equal(tracker.participants[0]?.characterId, 2);
  assert.equal(tracker.participants[0]?.canAct, true);
  assert.deepEqual(tracker.pendingActions[0]?.reactionNames, ["Ryan"]);
});

test("closed Initiative is historical and exposes no live affordances", () => {
  let engine = passInitiative(state({ characterId: 1, normalTotalInitiative: 20 }), 1);
  engine = closeInitiativeRuntime(engine, new Date("2026-09-01T20:00:00.000Z"));
  const tracker = model(engine);
  assert.equal(tracker.runtime?.runtime.status, "closed");
  assert.equal(tracker.nextEvent, null);
  assert.equal(tracker.canAdvanceRound, false);
  assert.equal(tracker.participants.every(({ canAct, canHold, canPass, canIntervene }) => !canAct && !canHold && !canPass && !canIntervene), true);
});

test("Tracker UI wires Build 5 operations and keeps normal and forced Round advancement distinct", () => {
  const ui = readSource("src/app/heavens/tabletop/initiative-tracker.tsx");
  const encounterUi = readSource("src/app/heavens/tabletop/encounter-workspace.tsx");
  assert.match(encounterUi, /Encounter Prep/);
  assert.match(encounterUi, /Initiative Tracker/);
  for (const operation of [
    "initializeEncounterInitiative",
    "beginGenericInitiativeAction",
    "holdEncounterInitiative",
    "passEncounterInitiative",
    "advanceEncounterInitiativeTimeline",
    "interruptEncounterPendingAction",
    "resumeEncounterPendingAction",
    "restartEncounterPendingAction",
    "resumeEncounterPendingActionWithAdjustedCost",
    "endEncounterPendingAction",
    "abandonEncounterPendingAction",
    "completeEncounterPendingActionManually",
    "enrollLateEncounterInitiativeParticipant",
    "refreshEncounterInitiativeCapacity",
    "correctEncounterInitiativeRuntime",
    "closeEncounterInitiative",
  ]) assert.match(ui, new RegExp(`\\b${operation}\\b`), `Tracker UI is missing ${operation}`);
  assert.match(ui, /advanceEncounterInitiativeRound\(encounterId\)/);
  assert.match(ui, /advanceEncounterInitiativeRound\(encounterId, true\)/);
  assert.match(ui, /Action Label/);
  assert.match(ui, /Initiative Cost/);
  assert.match(ui, /Long \/ Multi-Round Action/);
  assert.doesNotMatch(ui, /Starting Initiative[^<]*<input|Roll Initiative|End Turn|Next Turn/);
});

test("Tracker architecture uses authoritative reads and contains no independent Initiative engine", () => {
  const tracker = readSource("src/features/tabletop-operations/initiative-tracker.ts");
  const ui = readSource("src/app/heavens/tabletop/initiative-tracker.tsx");
  const page = readSource("src/app/heavens/tabletop/page.tsx");
  const actions = readSource("src/app/heavens/tabletop/initiative-actions.ts");
  const combined = `${tracker}\n${ui}`;
  for (const helper of [
    "getNextInitiativeTimelineEvent",
    "canHoldingParticipantIntervene",
    "canParticipantReactToAction",
    "canAdvanceInitiativeRound",
    "getMaximumMovementDistance",
  ]) assert.match(combined, new RegExp(`\\b${helper}\\b`));
  assert.match(page, /identities: encounterWorkspace\.selectedEncounter!\.participants/);
  assert.match(actions, /campaignSessionEncounterParticipant\.characterId/);
  assert.match(actions, /resolveInitiativeCapacityOptionsInTransaction/);
  assert.doesNotMatch(combined, /Math\.random|\bd20\b|\bd100\b|rollInitiative|initiativeRoll/i);
  assert.doesNotMatch(ui, /campaignCharacterAttribute|raceMovementMode|currentInitiative\s*[-+*/]=|normalTotalInitiative\s*[-+*/]=/);
  for (const state of ["Health", "Mana", "Conditions", "Inventory", "Equipment", "Creature snapshots"]) {
    assert.doesNotMatch(ui, new RegExp(`(?:Apply|Spend|Edit|Set|Use) ${state}`, "i"));
  }
});

test("Initiative identity remains an authoritative read join rather than persisted copied columns", () => {
  const schema = readSource("src/db/tabletop-operations-schema.ts");
  const architecture = readSource("docs/architecture/tabletop-operations.md");
  const initiativeSchema = schema.slice(schema.indexOf("export const campaignSessionEncounterInitiative ="));
  assert.match(initiativeSchema, /campaign_session_encounter_initiative_participant_encounter_participant_fk/);
  assert.doesNotMatch(initiativeSchema, /player_name|creature_template_name|kind_label|character_name/);
  assert.match(architecture, /Build 6 Initiative Tracker boundary/);
  assert.match(architecture, /read model and controller for the Build 5 engine/);
});
