import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getPageHelp } from "@/features/guidance/page-help";

test("Profile guidance explains personal modes, persistence, and the deferred browsing boundary", () => {
  const guide = getPageHelp("/profile");
  assert.equal(guide.title, "Your Profile");
  const copy = JSON.stringify(guide);
  for (const meaning of [/official Serrian Tide content/, /content you created/, /does not mean all content created by other users/, /Equipment and Inventory can have different settings/, /logging out and signing back in/, /does not delete it or remove it from existing Campaigns/, /after canon classification/]) assert.match(copy, meaning);
});

test("Profile uses the authenticated account and Pass 1 operations without a role gate", () => {
  const page = readFileSync("src/app/profile/page.tsx", "utf8");
  assert.match(page, /auth\.api\.getSession/);
  assert.match(page, /if \(!session\) redirect\("\/login"\)/);
  assert.match(page, /getCurrentCatalogPreferences\(\)/);
  assert.match(page, /context=\{null\}/);
  assert.match(page, /key=\{session\.user\.id\}/);
  assert.doesNotMatch(page, /require(?:Role|Admin|God|Player|AccessContext)/);
  const editor = readFileSync("src/features/catalog-visibility/catalog-preferences-editor.tsx", "utf8");
  assert.match(editor, /updateCurrentCatalogPreference\(\{ catalog, mode: nextMode \}\)/);
  assert.match(editor, /setMode\(saved\[catalog\]\)/);
  assert.match(editor, /setMode\(previousMode\)/);
});

test("Pass 4 Item and Campaign reference queries remain outside preference filtering", () => {
  for (const file of ["items", "campaigns"]) {
    const source = readFileSync(`src/app/heavens/${file}/actions.ts`, "utf8");
    assert.doesNotMatch(source, /catalog-visibility|catalog-preferences|userCatalogPreferences|isCatalogContentVisible|getCurrentCatalogPreferences/, `${file} must not apply preferences before deliberate canon classification`);
  }
});
