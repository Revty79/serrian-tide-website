import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/app/realms/tabletop/page.tsx", "utf8");
const workspace = readFileSync("src/app/realms/tabletop/player-tabletop-workspace.tsx", "utf8");
const clientActions = readFileSync("src/app/realms/tabletop/player-tabletop-actions.tsx", "utf8");
const serverActions = readFileSync("src/app/realms/tabletop/actions.ts", "utf8");
const service = readFileSync("src/features/tabletop-operations/player-tabletop-console-service.ts", "utf8");
const model = readFileSync("src/features/tabletop-operations/player-tabletop-console.ts", "utf8");
const liveClient = readFileSync("src/features/tabletop-operations/tabletop-live-refresh.tsx", "utf8");
const liveRoute = readFileSync("src/app/api/tabletop/live/route.ts", "utf8");
const characterPage = readFileSync("src/app/realms/characters/[characterId]/page.tsx", "utf8");
const css = readFileSync("src/app/realms/tabletop/player-tabletop.module.css", "utf8");

test("the stable Realms route resolves every selection server-side", () => {
  assert.match(page, /searchParams: Promise/);
  assert.match(page, /resolvePlayerTabletopSelection/);
  assert.match(page, /readPlayerTabletopRuntime/);
  assert.doesNotMatch(page, /localStorage|sessionStorage/);
});

test("authorization uses exact assignment and Campaign membership", () => {
  assert.match(service, /requirePlayer/);
  assert.match(service, /campaignCharacter\.playerUserId, playerUserId/);
  assert.match(service, /campaignPlayer\.userId, playerUserId/);
  assert.match(service, /campaignCharacter\.isNpc, false/);
});

test("the projection excludes G.O.D. notes and hidden Creature state", () => {
  assert.doesNotMatch(service, /godNotes|privateNotes|campaignCreatureNpcProfile|creatureOccurrence/);
  assert.doesNotMatch(workspace, /godNotes|privateNotes|Creature occurrence/);
});

test("active hierarchy requires exact roster and Scene membership", () => {
  assert.match(service, /campaignSessionRoster\.characterId, character\.characterId/);
  assert.match(service, /campaignSessionSceneMember\.characterId, character\.characterId/);
  assert.match(service, /ambiguous active Session hierarchy/);
  assert.match(service, /ambiguous active Scene hierarchy/);
});

test("the console uses authoritative Active State readers", () => {
  for (const reader of [
    "readActiveHealthInTransaction",
    "readActiveManaInTransaction",
    "readActiveEffectsInTransaction",
    "readCharacterEquipmentStateInTransaction",
    "readCharacterItemChargeStateInTransaction",
  ]) assert.match(service, new RegExp(reader));
});

test("Health and effects render without direct editing controls", () => {
  assert.match(workspace, /Health, Mana & effects/);
  assert.match(workspace, /activeConditions/);
  assert.match(workspace, /activeModifiers/);
  assert.doesNotMatch(workspace, /applyDamage|addManualCondition|addManualModifier|restoreMana/);
});

test("Pass 11 Called Checks and High Low are consolidated, not copied", () => {
  assert.match(workspace, /PlayerCalledCheckPanel/);
  assert.doesNotMatch(characterPage, /PlayerCalledCheckPanel|getPlayerCalledCheckWorkspace/);
  assert.doesNotMatch(clientActions, /answerPlayerCalledCheck|answerPlayerHighLow|lockPlayerHighLowCall/);
  const panel = readFileSync("src/app/realms/characters/[characterId]/player-called-check-panel.tsx", "utf8");
  assert.match(panel, /Immediate requests/);
  assert.match(panel, /Recent request and attempt history/);
});

test("general Rolls use the ledger as free, nonmechanical records", () => {
  assert.match(serverActions, /recordPlayerTabletopFreeRollInTransaction/);
  assert.match(service, /recordRollInTransaction/);
  assert.match(service, /purposeKind: "free"/);
  assert.match(service, /mechanical: null/);
  assert.match(service, /pendingActionId: null/);
  assert.match(service, /reactionId: null/);
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /idempotencyKey/);
});

test("browser-supplied results are sent only for entered physical Rolls", () => {
  assert.match(service, /input\.method === "entered" \? input\.enteredTotal \?\? null : null/);
  assert.match(clientActions, /method === "entered" \? Number\(enteredTotal\) : null/);
});

test("history is visibility-filtered through the existing Roll ledger and bounded", () => {
  assert.match(service, /readRollLedgerInTransaction/);
  assert.match(service, /readPlayerCalledCheckSessionWorkspaceInTransaction/);
  assert.match(service, /readAs: "player"/);
  assert.match(service, /characterId: character\.characterId/);
  assert.match(model, /PLAYER_TABLETOP_HISTORY_LIMIT = 30/);
  assert.match(model, /\.slice\(0, limit\)/);
});

test("exact Item instances and firearm state are projected without conversion", () => {
  assert.match(service, /campaignCharacterItemInstance/);
  assert.match(service, /campaignCharacterFirearmState/);
  assert.match(model, /ownershipKey: `instance:\$\{owned\.id\}`/);
  assert.match(model, /legacyAggregateFirearm/);
  assert.doesNotMatch(service, /convert|migrate/);
});

test("Spells preserve exact allocation lineage and missing mechanics", () => {
  assert.match(model, /parentAllocationId/);
  assert.match(model, /parseSpellDocument/);
  assert.match(model, /requiresGodRuling/);
  assert.doesNotMatch(model, /infer.*damage|infer.*duration|infer.*target/i);
});

test("only possessed Derived Abilities are projected without acquisition mutations", () => {
  assert.match(model, /if \(!status\?\.possessed\) return \[\]/);
  assert.match(workspace, /Possessed abilities/);
  assert.doesNotMatch(workspace, /learnDerivedAbility|confirmDerivedAbility|grantDerivedAbility/);
});

test("one console-scoped event stream reloads authoritative state and cleans up", () => {
  assert.equal((workspace.match(/TabletopLiveRefresh/g) ?? []).length, 2);
  assert.match(workspace, /scope="console"/);
  assert.match(liveClient, /source\.close\(\)/);
  assert.match(liveClient, /clearTimeout/);
  assert.match(liveRoute, /consoleScope \? null/);
});

test("the Player live endpoint rechecks role, assignment, and membership", () => {
  assert.match(liveRoute, /role === "player"/);
  assert.match(liveRoute, /campaignCharacter\.playerUserId, authenticatedUserId/);
  assert.match(liveRoute, /campaignPlayer\.userId, authenticatedUserId/);
  assert.equal(
    (liveRoute.match(/await resolveTabletopSubscriptionAuthorization\(/g) ?? []).length,
    2,
  );
});

test("Pass 13 combat controls extend the accepted console without exposing effect application", () => {
  assert.match(workspace, /PlayerCombatConsole/);
  assert.match(workspace, /TabletopLiveRefresh mode="player"/);
  assert.doesNotMatch(workspace + clientActions + serverActions, /applyEncounterDamage|approveActionEffect|correctInitiative/);
});

test("G.O.D. and authoring controls never render", () => {
  assert.doesNotMatch(workspace + clientActions, /Campaign Settings|Issue Called Check|Reveal to Table|Correct Initiative|Edit canonical|Create override/);
});

test("responsive CSS prevents page overflow and preserves accessible controls", () => {
  assert.match(css, /overflow-x: clip/);
  assert.match(css, /min-width: 0/);
  assert.match(css, /min-height: 2\.75rem/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /@media \(max-width: 42rem\)/);
});

test("the Player Tabletop uses the shared Realms glass, gold, and branded visual language", () => {
  assert.match(workspace, /className=\{styles\.brandMark\}/);
  assert.match(workspace, /aria-label="Player tabletop navigation"/);
  assert.match(css, /font-family: "Evanescent"/);
  assert.match(css, /backdrop-filter: blur\(16px\)/);
  assert.match(css, /rgb\(245 202 115/);
  assert.match(css, /linear-gradient\(90deg, #a855f7, #fde68a, #a855f7\)/);
});

test("forms and live feedback carry accessible labels and status semantics", () => {
  assert.match(workspace, /aria-labelledby/);
  assert.match(workspace, /aria-label="Current Character and Session status"/);
  assert.match(clientActions, /role=\{message\.error \? "alert" : "status"\}/);
  assert.match(clientActions, /<label/);
});
