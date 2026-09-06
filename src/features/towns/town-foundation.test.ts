import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const schema = read("src/db/town-schema.ts");
const migration = read("drizzle/0036_campaign_town_builder.sql");
const actions = read("src/app/heavens/towns/actions.ts");
const workspace = read("src/app/heavens/towns/town-workspace.tsx");
const navigation = read("src/features/navigation/authenticated-navigation.ts");
const campaignPlan = read("src/features/lifecycle/campaign-delete-plan.ts");
const lifecycle = read("src/features/lifecycle/lifecycle-service.ts");
const handoff = read("docs/architecture/town-builder.md");

test("0036 adds normalized Campaign Town, Shop membership, NPC association, and owned Place tables", () => {
  for (const tableName of ["town", "town_shop_membership", "town_npc_association", "town_place"]) {
    assert.match(migration, new RegExp(`CREATE TABLE "${tableName}"`));
  }
  assert.match(schema, /unique\("town_shop_membership_shop_uq"\)\.on\(table\.shopId\)/);
  assert.match(schema, /town_shop_membership_shop_campaign_fk[\s\S]*?\.onDelete\("restrict"\)/);
  assert.match(schema, /town_npc_association_npc_campaign_fk[\s\S]*?\.onDelete\("restrict"\)/);
  assert.match(schema, /town_place_town_campaign_fk[\s\S]*?\.onDelete\("cascade"\)/);
});

test("database guards enforce active same-Campaign relationship sources", () => {
  assert.match(migration, /town_assert_shop_membership_eligible/);
  assert.match(migration, /candidate_town"\."archived_at" IS NULL/);
  assert.match(migration, /candidate_shop"\."archived_at" IS NULL/);
  assert.match(migration, /town_assert_npc_association_eligible/);
  assert.match(migration, /"candidate_npc"\."npc_kind" IN \('race', 'creature'\)/);
  assert.match(migration, /"candidate_npc"\."npc_build_mode" IN \('simple', 'detailed'\)/);
  assert.match(migration, /town_assert_place_parent_editable/);
});

test("every Town action authenticates through a Campaign-owned scope", () => {
  const exported = [...actions.matchAll(/export async function (\w+)\([^]*?\n}/g)].map((match) => ({
    name: match[1],
    body: match[0],
  }));
  assert.ok(exported.length >= 22);
  for (const entry of exported) {
    assert.match(
      entry.body,
      /requireGodOrAdminAccessContext|requireCampaignManager|requireEditableTown|reorderTownChildren|getTown|previewTownLifecycle/,
      `${entry.name} must reload an authorized Campaign/Town scope`,
    );
  }
  assert.match(actions, /Both Towns must exist in the same Campaign/);
  assert.match(actions, /for\("update"\)/);
  assert.match(actions, /explicit reassign action/);
});

test("the Town workspace keeps authored drafts and scroll while organizing all supported records", () => {
  for (const seam of [
    "Available Campaign Shop",
    "Reassign Here",
    "Open Shop Record",
    "Persistent Race & Creature records",
    "Simple and Detailed NPCs may appear in many Towns",
    "Open NPC Record",
    "Town-owned descriptive records",
    "Archive / Delete",
    "useInPlaceScrollPreservation",
    `data-preserve-scroll="town-shops"`,
    `data-preserve-scroll="town-npcs"`,
    `data-preserve-scroll="town-places"`,
  ]) assert.match(workspace, new RegExp(seam.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(workspace, /function mergeDetail/);
  assert.match(workspace, /if \(!merged\[entry\.id\]\)/);
  assert.match(workspace, /if \(!merged\[entry\.associationId\]\)/);
  assert.match(workspace, /activeCampaignRef/);
  assert.match(workspace, /requestIdRef/);
});

test("Shop and NPC deletion surfaces Town dependencies and Campaign deletion is child-first", () => {
  const shopActions = read("src/app/heavens/shops/actions.ts");
  assert.match(shopActions, /Detach it in the Town Builder first/);
  assert.match(lifecycle, /label: "Town associations", blocking: true/);
  const npcLink = campaignPlan.indexOf('{ tableName: "town_npc_association"');
  const npcParent = campaignPlan.indexOf('{ tableName: "campaign_character", scope: "campaign" }');
  const shopLink = campaignPlan.indexOf('{ tableName: "town_shop_membership"');
  const shopParent = campaignPlan.indexOf('{ tableName: "shop", scope: "campaign" }');
  const place = campaignPlan.indexOf('{ tableName: "town_place"');
  const town = campaignPlan.indexOf('{ tableName: "town", scope: "campaign" }');
  assert.ok(npcLink >= 0 && npcLink < npcParent);
  assert.ok(shopLink >= 0 && shopLink < shopParent);
  assert.ok(place >= 0 && place < town);
});

test("Town lifecycle preserves placement references, audits destructive work, and defers runtime Shop entry", () => {
  assert.match(actions, /Attached Shops \(survive as standalone Shops\)/);
  assert.match(actions, /Associated NPCs \(survive\)/);
  assert.match(actions, /Active Town-owned places \(deleted\)/);
  assert.match(actions, /assertExactConfirmation/);
  assert.match(actions, /assertPermanentDeletionEnabled\(\)/);
  assert.match(actions, /entityKind: "town"/);
  assert.match(actions, /entityKind: "town-place"/);
  assert.match(actions, /Scene placements \(block deletion\)/);
  assert.match(handoff, /Entering or using a Shop/);
  assert.match(handoff, /deferred/);
  const combined = `${schema}\n${workspace}`;
  for (const forbidden of [/townSession|town_session/i, /populationSimulation/i, /operatingSchedule/i, /shopTransaction/i]) {
    assert.doesNotMatch(combined, forbidden);
  }
});

test("Town Builder is reachable and 0036 follows the exact 0035 tail", () => {
  const heavensPage = read("src/app/heavens/page.tsx");
  assert.match(navigation, /label: "Towns", href: "\/heavens\/towns"/);
  assert.match(heavensPage, /title: "TOWN BUILDER"/);
  assert.ok(heavensPage.indexOf('title: "TOWN BUILDER"') < heavensPage.indexOf('title: "NPCS"'));
  assert.match(heavensPage, /title: "NPCS",[\s\S]*?href: "\/heavens\/npcs",[\s\S]*?wide: true/);
  const journal = JSON.parse(read("drizzle/meta/_journal.json")) as {
    entries: Array<{ idx: number; version: string; when: number; tag: string; breakpoints: boolean }>;
  };
  assert.equal(journal.entries.length, 40);
  assert.equal(journal.entries[35]?.tag, "0035_campaign_shop_foundation");
  assert.deepEqual(journal.entries[36], {
    idx: 36,
    version: "7",
    when: journal.entries[36]?.when,
    tag: "0036_campaign_town_builder",
    breakpoints: true,
  });
  assert.equal(journal.entries[37]?.tag, "0037_site_appearance");
  assert.equal(journal.entries[38]?.tag, "0038_tabletop_location_placement");
  assert.equal(journal.entries[39]?.tag, "0039_tabletop_shop_visits");
});
