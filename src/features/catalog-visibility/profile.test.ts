import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getPageHelp } from "@/features/guidance/page-help";

test("Profile guidance explains personal modes, persistence, and independent environment activation", () => {
  const guide = getPageHelp("/profile");
  assert.equal(guide.title, "Your Profile");
  const copy = JSON.stringify(guide);
  for (const meaning of [/official Serrian Tide content/, /content you created/, /does not mean all content created by other users/, /Equipment and Inventory can have different settings/, /logging out and signing back in/, /does not delete it or remove it from existing Campaigns/, /Administrator enables filtering/]) assert.match(copy, meaning);
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

test("Item and Campaign discovery delegate to the shared visibility services", () => {
  assert.match(readFileSync("src/app/heavens/items/actions.ts", "utf8"), /loadItemCatalog\(session.user.id, filters\)/);
  assert.match(readFileSync("src/app/heavens/campaigns/actions.ts", "utf8"), /loadCampaignCatalogReferences/);
});
