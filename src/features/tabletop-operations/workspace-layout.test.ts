import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sceneWorkspace = readFileSync(
  "src/app/heavens/tabletop/scene-workspace.tsx",
  "utf8",
);
const tabletopCss = readFileSync(
  "src/app/heavens/tabletop/tabletop.css",
  "utf8",
);

test("Scene workspace uses vertical composition without encounter controls", () => {
  assert.match(sceneWorkspace, /tabletop-scenes-layout" data-workspace-flow="vertical"/);
  assert.doesNotMatch(sceneWorkspace, /<aside className="tabletop-scene-library"/);
  assert.doesNotMatch(sceneWorkspace, /EncounterWorkspace|InitiativeTracker|CombatAidWorkspace/);
});

test("desktop hierarchy keeps one Session rail and flowing Scene selectors", () => {
  const correction = tabletopCss.slice(tabletopCss.indexOf("/* Build 8 layout correction"));
  assert.ok(correction.length > 0, "The focused Build 8 layout correction must remain present.");
  assert.match(correction, /\.tabletop-workspace\{grid-template-columns:minmax\(240px,280px\) minmax\(0,1fr\)\}/);
  assert.match(correction, /\.tabletop-scenes-layout\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(correction, /\.tabletop-scene-library>div\{display:flex;flex-wrap:wrap\}/);
  assert.doesNotMatch(correction, /grid-template-columns:(?:270|245)px/);
});
