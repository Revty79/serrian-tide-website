import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Pass 2 migration is additive and preserves legacy Roll storage", () => {
  const migration = read("drizzle/0022_immutable_roll_ledger_snapshots.sql");
  assert.match(migration, /ADD VALUE 'private'/);
  assert.match(migration, /ADD COLUMN "mechanical_snapshot" jsonb/);
  assert.match(migration, /CREATE TABLE "campaign_session_roll_amendment"/);
  assert.match(migration, /ENUM\('correction', 'void', 'ruling'\)/);
  assert.match(migration, /campaign_session_roll_amendment_previous_fk/);
  assert.match(migration, /campaign_session_roll_amendment_roll_fk/);
  assert.match(migration, /ON DELETE restrict/g);
  assert.match(migration, /campaign_session_roll_amendment_first_uq/);
  assert.match(migration, /campaign_session_roll_amendment_successor_uq/);
  assert.match(migration, /campaign_session_roll_amendment_reason_valid/);
  assert.match(migration, /campaign_session_roll_amendment_content_valid/);
  assert.doesNotMatch(migration, /^(?:DROP|TRUNCATE|DELETE FROM|UPDATE)\b/im);
  assert.doesNotMatch(migration, /ALTER TABLE "campaign_session_roll" ALTER COLUMN/);
});

test("one shared service produces snapshots and appends all later interpretation", () => {
  const service = read("src/features/tabletop-operations/roll-runtime-service.ts");
  const snapshot = read("src/features/tabletop-operations/roll-mechanical-snapshot.ts");
  assert.match(snapshot, /resolvePercentileCheck\(/);
  assert.match(service, /buildRollMechanicalSnapshot/);
  assert.match(service, /campaignCharacterAttribute/);
  assert.match(service, /campaignCharacterSkillAllocation/);
  assert.match(service, /calculatedPercentage: source\.calculatedPercentage/);
  assert.match(service, /\.insert\(campaignSessionRollAmendment\)/);
  assert.doesNotMatch(service, /\.update\(campaignSessionRoll\)/);
  assert.match(service, /kind: "correction"/);
  assert.match(service, /kind: "void"/);
  assert.match(service, /kind: "ruling"/);
  assert.match(service, /previousAmendmentId/);
  assert.match(service, /parseRollMechanicalSnapshot/);
});

test("private reads bind to verified rolling Character context and redact foreign mechanics", () => {
  const runtime = read("src/features/tabletop-operations/roll-runtime.ts");
  const service = read("src/features/tabletop-operations/roll-runtime-service.ts");
  const playerAction = read("src/app/realms/characters/[characterId]/encounter/actions.ts");
  const playerRollAction = playerAction.slice(playerAction.indexOf("export async function recordPlayerEncounterRoll"));
  assert.match(runtime, /"table", "private", "god-only"/);
  assert.match(service, /eq\(campaignSessionRoll\.rollerCharacterId, actor\.characterId\)/);
  assert.match(service, /mechanicsRedacted/);
  assert.match(service, /mayReadMechanics/);
  assert.match(playerAction, /characterId,/);
  assert.match(playerAction, /visibility: "table"/);
  assert.doesNotMatch(playerRollAction, /\.\.\.input/);
});

test("G.O.D. controls expose manual resolution, correction, ruling, and append-only void", () => {
  const tray = read("src/app/heavens/tabletop/roll-tray.tsx");
  const ledger = read("src/app/heavens/tabletop/roll-ledger.tsx");
  const actions = read("src/app/heavens/tabletop/roll-actions.ts");
  assert.match(tray, /mechanical:/);
  assert.match(tray, /governingSource/);
  assert.match(tray, /parseModifiers/);
  assert.match(ledger, /Original mechanical snapshot/);
  assert.match(ledger, /Latest effective interpretation/);
  assert.match(ledger, /Append-only amendment history/);
  assert.match(ledger, /correctGodRoll/);
  assert.match(ledger, /recordGodRollRuling/);
  assert.match(actions, /correctRollInTransaction/);
  assert.match(actions, /recordRollRulingInTransaction/);
});
