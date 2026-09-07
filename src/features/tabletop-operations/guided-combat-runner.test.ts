import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shared = readFileSync("src/components/tabletop/battle-layout.tsx", "utf8");
const godRunner = readFileSync("src/app/heavens/tabletop/encounter-battle-screen.tsx", "utf8");
const playerRunner = readFileSync("src/app/realms/tabletop/player-combat-console.tsx", "utf8");

test("focused combat keeps common actions visible and moves uncommon actions behind More actions", () => {
  assert.match(shared, /PRIMARY_BATTLE_COMMAND_KEYS = new Set\(\["attack", "cast", "defend"\]\)/);
  assert.match(shared, /<summary>More actions<\/summary>/);
  assert.match(shared, /selectedIsMore/);
});

test("focused combat hides legacy technical workspaces while preserving reference-mode escape hatches", () => {
  for (const summary of [
    "Initiative controls and shared timeline",
    "All consequence plans",
    "All firearm attack history",
    "Advanced declaration, eligibility, and defense controls",
    "Full combat reference and manual operations",
  ]) assert.match(shared, new RegExp(summary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(godRunner, />Tabletop Reference</);
  assert.match(playerRunner, />Tabletop Reference</);
});

test("guided Player combat promotes required action and defense Rolls to the top of the runner", () => {
  assert.match(shared, /PLAYER_ROLL_PANEL_SUMMARY/);
  assert.match(shared, /function playerRollReady/);
  assert.match(shared, /declaration\.status === "rolling-ready"/);
  assert.match(shared, /reaction\.status === "declared"/);
  assert.match(shared, /reaction\.rollRequired/);
  assert.match(shared, /summary: "ROLL NOW — action or defense"/);
  assert.match(playerRunner, />Website Roll</);
  assert.match(playerRunner, />Roll response</);
  assert.match(playerRunner, />Enter physical Roll</);
});

test("G.O.D. guided exchange still keeps declaration, defense, Roll, and result machinery in the focused stage", () => {
  assert.match(godRunner, /<ActionDeclarationWorkspace[\s\S]*compact[\s\S]*directCommit/);
  assert.match(godRunner, /<DefenseInterventionWorkspace/);
  assert.match(godRunner, /<ActionEffectPlanWorkspace/);
  assert.match(godRunner, /title={`Roll \$\{selectedOwnedExchange/);
});
