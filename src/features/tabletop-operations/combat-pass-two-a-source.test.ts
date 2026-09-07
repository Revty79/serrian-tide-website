import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

test("G.O.D. Initiative actions accept signed nonzero safe participant keys while DB identities stay positive", () => {
  const initiativeActions = read("src/app/heavens/tabletop/initiative-actions.ts");
  const declarationActions = read("src/app/heavens/tabletop/action-declaration-actions.ts");
  assert.match(initiativeActions, /function assertParticipantKey[\s\S]*Number\.isSafeInteger\(value\)[\s\S]*value === 0/);
  for (const operation of [
    "enrollLateEncounterInitiativeParticipant",
    "beginGenericInitiativeAction",
    "holdEncounterInitiative",
    "passEncounterInitiative",
    "setEncounterInitiativeParticipationStatus",
    "applyEncounterInitiativeDelta",
    "refreshEncounterInitiativeCapacity",
    "addEncounterDeferredInitiativeCost",
    "settleEncounterDeferredInitiativeCost",
  ]) {
    assert.match(initiativeActions, new RegExp(`export async function ${operation}[\\s\\S]{0,500}assertParticipantKey`));
  }
  assert.match(declarationActions, /participantKey\(responderCharacterId, "Responder Participant"\)/);
  assert.match(initiativeActions, /function assertPositiveId[\s\S]*value <= 0/);
});

test("ordinary attacks, movement, and called locations stay on the existing declaration and effect paths", () => {
  const resolver = read("src/features/tabletop-operations/action-source-resolver-service.ts");
  const consequence = read("src/features/tabletop-operations/ordinary-attack-consequence-service.ts");
  const effects = read("src/features/tabletop-operations/action-effect-plan-service.ts");
  const declarations = read("src/app/heavens/tabletop/action-declaration-workspace.tsx");
  assert.match(resolver, /calculateMovementInitiativeCost/);
  assert.match(resolver, /Movement requires an exact mode, distance, and intent/);
  assert.match(consequence, /resolveAttackProtectionInTransaction/);
  assert.match(consequence, /ordinary attack damage does not add firearm-only success damage/);
  assert.match(effects, /persistPlannedMechanicalEffectInTransaction/);
  assert.match(effects, /Firearm consequences must be generated through the dedicated per-bullet firearm runtime/);
  assert.match(effects, /isDedicatedFirearmDeclaration\(locked\)/);
  assert.match(declarations, /Authored target location/);
  assert.match(declarations, /Exact authored Creature Attack/);
});
