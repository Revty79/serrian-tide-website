import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sceneWorkspace = readFileSync(
  "src/app/heavens/tabletop/scene-workspace.tsx",
  "utf8",
);
const encounterWorkspace = readFileSync(
  "src/app/heavens/tabletop/encounter-workspace.tsx",
  "utf8",
);
const tabletopCss = readFileSync(
  "src/app/heavens/tabletop/tabletop.css",
  "utf8",
);

test("Scene and Encounter hierarchy uses vertical workspace composition instead of nested sidebars", () => {
  assert.match(sceneWorkspace, /tabletop-scenes-layout" data-workspace-flow="vertical"/);
  assert.match(encounterWorkspace, /tabletop-encounters-layout" data-workspace-flow="vertical"/);
  assert.doesNotMatch(sceneWorkspace, /<aside className="tabletop-scene-library"/);
  assert.doesNotMatch(encounterWorkspace, /<aside className="tabletop-encounter-library"/);
  assert.match(sceneWorkspace, /<EncounterWorkspace/);
  assert.match(encounterWorkspace, /<InitiativeTracker data=/);
  assert.match(encounterWorkspace, /<CombatAidWorkspace data=/);
  assert.match(encounterWorkspace, /<EncounterCloseout/);
});

test("desktop hierarchy keeps one Session rail and flowing Scene and Encounter selectors", () => {
  const correction = tabletopCss.slice(tabletopCss.indexOf("/* Build 8 layout correction"));
  assert.ok(correction.length > 0, "The focused Build 8 layout correction must remain present.");
  assert.match(correction, /\.tabletop-workspace\{grid-template-columns:minmax\(240px,280px\) minmax\(0,1fr\)\}/);
  assert.match(correction, /\.tabletop-scenes-layout,\.tabletop-encounters-layout\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(correction, /\.tabletop-scene-library>div,\.tabletop-encounter-library>div\{display:flex;flex-wrap:wrap\}/);
  assert.doesNotMatch(correction, /grid-template-columns:(?:270|245)px/);
});

test("Initiative and Combat Aid use container-safe grids with narrow-width stacking", () => {
  const correction = tabletopCss.slice(tabletopCss.indexOf("/* Build 8 layout correction"));
  assert.match(correction, /\.initiative-participant-grid\{grid-template-columns:repeat\(auto-fit,minmax\(320px,1fr\)\)\}/);
  assert.match(correction, /\.combat-aid-layout\{grid-template-columns:minmax\(240px,300px\) minmax\(0,1fr\)\}/);
  assert.match(correction, /\.combat-aid-health-tracks\{grid-template-columns:repeat\(auto-fit,minmax\(180px,1fr\)\)\}/);
  assert.match(correction, /@media\(max-width:1050px\)\{\.tabletop-workspace\{grid-template-columns:1fr\}/);
  assert.match(correction, /@media\(max-width:900px\)\{\.combat-aid-layout\{grid-template-columns:1fr\}\}/);
  assert.match(correction, /@media\(max-width:700px\)\{\.initiative-participant-grid\{grid-template-columns:1fr\}/);
});
