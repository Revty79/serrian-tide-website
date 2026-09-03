import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(
  "src/app/heavens/tabletop/tabletop-workspace.tsx",
  "utf8",
);
const tabletopCss = readFileSync(
  "src/app/heavens/tabletop/tabletop.css",
  "utf8",
);

test("Campaign introduction is opened on demand instead of filling the workspace", () => {
  assert.match(workspace, />View Campaign Intro<\/button>/);
  assert.match(workspace, /aria-haspopup="dialog"/);
  assert.doesNotMatch(workspace, /<p>\{selectedCampaign\.overview/);
  assert.match(workspace, /dialog\.showModal\(\)/);
  assert.match(workspace, /onCancel=\{\(event\) =>/);
});

test("Campaign introduction dialog preserves long prose in a bounded reading surface", () => {
  assert.match(tabletopCss, /\.tabletop-campaign-intro-dialog\s*\{[\s\S]*?max-height:/);
  assert.match(tabletopCss, /\.tabletop-campaign-intro-copy\s*\{[\s\S]*?overflow-y:\s*auto/);
  assert.match(tabletopCss, /\.tabletop-campaign-intro-copy\s*\{[\s\S]*?white-space:\s*pre-wrap/);
  assert.match(tabletopCss, /\.tabletop-campaign-intro-dialog::backdrop/);
});
