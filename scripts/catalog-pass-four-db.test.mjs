import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { after, before, mock, test } from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

assert.equal(process.env.SERRIAN_CATALOG_DISPOSABLE, "true");
assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_catalog_visibility_dev$/);
const actors = new AsyncLocalStorage();
const owner = "pass-four-owner", admin = "pass-four-admin", foreign = "pass-four-foreign", player = "pass-four-player";
mock.module(pathToFileURL(path.resolve("src/lib/server-access.ts")).href, { namedExports: {
  requireSession: async () => ({ user: { id: actors.getStore() ?? owner } }),
  requireGodOrAdminAccessContext: async () => {
    const id = actors.getStore() ?? owner;
    const roles = (await rows("select role from user_role where user_id=$1", [id])).map(({ role }) => role);
    if (!roles.some((role) => role === "admin" || role === "god")) throw new Error("Authoring access required.");
    return { session: { user: { id } }, roles };
  },
} });
mock.module("next/cache", { namedExports: { revalidatePath() {} } });
const { pool } = await import("../src/db/index.ts");
const rows = async (text, values = []) => (await pool.query(text, values)).rows;
const one = async (text, values = []) => (await rows(text, values))[0];
const { setCatalogActivation, setSystemCanon } = await import("../src/features/catalog-visibility/actions.ts");
const { bindCatalogPreferenceOperations } = await import("../src/features/catalog-visibility/catalog-preference-service.ts");
const { getCatalogBrowseState } = await import("../src/features/catalog-visibility/catalog-query.ts");
const items = await import("../src/app/heavens/items/actions.ts");
const campaigns = await import("../src/app/heavens/campaigns/actions.ts");
const races = await import("../src/app/heavens/races/actions.ts");
const creatures = await import("../src/app/heavens/creatures/actions.ts");
const abilities = await import("../src/app/heavens/derived-abilities/actions.ts");
const skills = await import("../src/app/heavens/skills/actions.ts");
const forms = await import("../src/app/heavens/form-access-actions.ts");
const prefs = bindCatalogPreferenceOperations(async () => owner);
const activation = (catalog, enabled = true, actor = admin) => actors.run(actor, () => setCatalogActivation({ catalog, enabled }));
const fixture = new Map();
let tagId, hiddenTagId, campaignId, mineRace, hiddenRace, raceRoot, hiddenSkill, mineSkill, powerItem;
const snapshot = async () => {
  const result = {};
  for (const table of ["items", "item_properties", "item_tag_links", "weapon_profiles", "item_powers", "item_power_sources", "catalog_visibility_activation", "user_catalog_preferences", "campaign_race", "campaign_allowed_race", "campaign_inventory_item", "campaign_inventory_tag"]) result[table] = await rows(`select to_jsonb(t) body from ${table} t order by to_jsonb(t)::text`);
  return result;
};

before(async () => {
  for (const [id, role] of [[owner, "god"], [admin, "admin"], [foreign, "god"], [player, "player"]]) {
    await pool.query('insert into "user"(id,name,email) values($1,$1,$2)', [id, `${id}@example.invalid`]);
    await pool.query("insert into user_role(user_id,role) values($1,$2)", [id, role]);
  }
  tagId = (await one("insert into item_tags_catalog(canonical_id,name,tag_group,description) values('P4-TAG','Pass Four Shared','Test','Shared fixture metadata') returning id")).id;
  hiddenTagId = (await one("insert into item_tags_catalog(canonical_id,name,tag_group,description) values('P4-HIDDEN-TAG','Pass Four Hidden','Test','Hidden fixture metadata') returning id")).id;
  for (const scope of ["equipment", "inventory"]) {
    const ids = [];
    for (const [label, creator, canon] of [["Canon", foreign, true], ["Mine", owner, false], ["Foreign", foreign, false], ["Promoted", owner, true], ["Foreign Canon", foreign, true], ["Middle", foreign, false], ["Sibling", foreign, true]]) {
      const id = (await one(`insert into items(canonical_id,name,catalog_scope,equipment_group,record_type,family,category,price_basis,created_by_user_id,is_system_canon,canon_marked_by_user_id,canon_marked_at)
        values($1,$2,$3,$4,'Item','P4',$5,'Each',$6,$7,case when $7 then $8 else null end,case when $7 then now() else null end) returning id`,
      [`P4-${scope}-${label}`.toUpperCase(), `P4 ${scope} ${label}`, scope, scope === "equipment" ? "general" : null, `P4 ${label}`, creator, canon, admin])).id;
      ids.push(id);
      await pool.query("insert into item_tag_links(item_id,tag_id) values($1,$2)", [id, tagId]);
    }
    for (const [child, parent] of [[ids[1], ids[5]], [ids[5], ids[0]], [ids[6], ids[0]]]) await pool.query("update items set parent_item_id=$1 where id=$2", [parent, child]);
    await pool.query("insert into item_tag_links(item_id,tag_id) values($1,$2)", [ids[2], hiddenTagId]);
    fixture.set(scope, ids);
  }
  raceRoot = (await one("insert into races(name,created_by_user_id,is_system_canon,canon_marked_by_user_id,canon_marked_at) values('P4 Root',$1,true,$2,now()) returning id", [foreign, admin])).id;
  mineRace = (await one("insert into races(name,created_by_user_id,parent_race_id) values('P4 Mine Race',$1,$2) returning id", [owner, raceRoot])).id;
  hiddenRace = (await one("insert into races(name,created_by_user_id) values('P4 Hidden Race',$1) returning id", [foreign])).id;
  hiddenSkill = (await one("insert into skill(name,classification,tier,primary_attribute,created_by_user_id) values('P4 Hidden Skill','standard',1,'STR',$1) returning id", [foreign])).id;
  mineSkill = (await one("insert into skill(name,classification,tier,primary_attribute,created_by_user_id) values('P4 Mine Skill','standard',1,'STR',$1) returning id", [owner])).id;
  campaignId = (await one(`insert into campaign(name,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,assigned_fate_points,created_by_user_id)
    values('Pass Four Campaign',100,100,10,10,100,0,'Credits','Assigned',0,$1) returning id`, [owner])).id;
  await pool.query("insert into campaign_race(campaign_id,race_id,sort_order) values($1,$2,0)", [campaignId, hiddenRace]);
  await pool.query("insert into campaign_allowed_race(campaign_id,race_id,sort_order) values($1,$2,0)", [campaignId, hiddenRace]);
  await pool.query("insert into campaign_inventory_tag(campaign_id,tag_id,sort_order) values($1,$2,0)", [campaignId, hiddenTagId]);
  for (const [index, scope] of ["equipment", "inventory"].entries()) await pool.query("insert into campaign_inventory_item(campaign_id,item_id,sort_order) values($1,$2,$3)", [campaignId, fixture.get(scope)[2], index]);
  powerItem = fixture.get("equipment")[2];
  const power = (await one("insert into item_powers(item_id,name,trigger,sort_order) values($1,'Retained magic','activated',0) returning id", [powerItem])).id;
  await pool.query("insert into item_power_sources(item_power_id,source_kind,source_skill_id,source_extension_type,source_schema_version) values($1,'spell-construction',$2,'spell-construction',1)", [power, hiddenSkill]);
  await pool.query("insert into skill_extension(skill_id,extension_type,schema_version,data_json) values($1,'spell-construction',1,'{}')", [hiddenSkill]);
});
after(() => pool.end());

test("manual activation is current-Admin only, catalog-local, and cannot mutate records/preferences or the old receipt", async () => {
  assert.equal((await getCatalogBrowseState(owner, "equipment")).enabled, false);
  assert.equal((await getCatalogBrowseState(owner, "inventory")).enabled, false);
  await prefs.update({ catalog: "equipment", mode: "mine" });
  const before = await snapshot();
  for (const actor of [owner, player]) await assert.rejects(activation("equipment", true, actor), /Administrator/);
  await assert.rejects(actors.run(admin, () => setCatalogActivation({ catalog: "equipment", enabled: true, actor: admin })), /Invalid/);
  await activation("equipment");
  assert.equal((await getCatalogBrowseState(owner, "equipment")).enabled, true);
  assert.equal((await getCatalogBrowseState(owner, "inventory")).enabled, false);
  assert.deepEqual(await snapshot(), before);
  const row = await one("select * from catalog_visibility_scope_activation where catalog_key='equipment'");
  assert.equal(row.activated_by_user_id, admin); assert.equal(row.activation_method, "manual"); assert.equal(row.manifest_hash, null);
  await pool.query("delete from user_role where user_id=$1", [admin]);
  await assert.rejects(activation("equipment", false), /Administrator/);
  await pool.query("insert into user_role(user_id,role) values($1,'admin')", [admin]);
  await activation("equipment", false);
  const full = await items.listItems({ catalogScope: "equipment", search: "P4 equipment" });
  assert.equal(full.total, 5); assert.equal(full.visibility.mode, "mine"); assert.equal(full.visibility.enabled, false);
  assert.deepEqual(await snapshot(), before);
  await activation("equipment"); await activation("inventory");
});

for (const scope of ["equipment", "inventory"]) test(`${scope}: modes, promoted ownership, exact nested context, facets, count and pagination`, async () => {
  const ids = fixture.get(scope);
  for (const [mode, expected] of [["canon", [0, 3, 4, 6]], ["mine", [1, 3]], ["canon-and-mine", [0, 1, 3, 4, 6]]]) {
    await prefs.update({ catalog: scope, mode });
    const result = await items.listItems({ catalogScope: scope, search: `P4 ${scope}`, pageSize: 100 });
    assert.equal(result.total, expected.length);
    assert.deepEqual(result.items.filter((row) => row.catalogSource !== "context").map(({ id }) => id).sort((a,b) => a-b), expected.map((index) => ids[index]).sort((a,b) => a-b));
    assert.equal(result.items.find(({ id }) => id === ids[3]).catalogSource, "canon");
    if (mode === "mine") {
      assert.deepEqual(result.items.filter((row) => row.catalogSource === "context").map(({ id }) => id), [ids[0]]);
      assert.ok(!result.items.some(({ id }) => id === ids[6]));
    }
    assert.ok(!(await items.listItemFacets(scope)).tags.includes("Pass Four Hidden"));
  }
  await prefs.update({ catalog: scope, mode: "mine" });
  const page = await items.listItems({ catalogScope: scope, search: `P4 ${scope} Mine`, pageSize: 1 });
  assert.equal(page.total, 1); assert.equal(page.pageCount, 1); assert.equal(page.items.length, 2);
});

test("Needs Canon Review and Item designation are Admin-only and preserve all Item definitions and metadata", async () => {
  await assert.rejects(items.listItems({ catalogScope: "equipment", needsCanonReview: true }), /Administrator/);
  await assert.rejects(items.listItemFacets("equipment", false, true), /Administrator/);
  for (const scope of ["equipment", "inventory"]) {
    const id = fixture.get(scope)[2];
    const review = () => actors.run(admin, () => items.listItems({ catalogScope: scope, needsCanonReview: true, search: `P4 ${scope} Foreign` }));
    assert.ok((await review()).items.some((row) => row.id === id));
    for (const actor of [owner, player]) await assert.rejects(actors.run(actor, () => setSystemCanon({ root: "item", id, isSystemCanon: true })), /Administrator/);
    const before = await snapshot();
    await actors.run(admin, () => setSystemCanon({ root: "item", id, isSystemCanon: true }));
    assert.ok(!(await review()).items.some((row) => row.id === id));
    await actors.run(admin, () => setSystemCanon({ root: "item", id, isSystemCanon: false }));
    const after = await snapshot();
    const stripUpdated = (state) => state.items.map(({ body }) => { const rest = { ...body }; delete rest.updated_at; return rest; });
    assert.deepEqual(stripUpdated(after), stripUpdated(before));
    delete before.items; delete after.items; assert.deepEqual(after, before);
  }
});

test("Campaign creation/editing use independent scopes, exact Race context, retained selections and filtered tag expansion", async () => {
  await prefs.update({ catalog: "equipment", mode: "canon" }); await prefs.update({ catalog: "inventory", mode: "mine" }); await prefs.update({ catalog: "race", mode: "mine" });
  const before = await snapshot();
  const fresh = await campaigns.getCampaignCreationReferenceData();
  assert.ok(fresh.races.some(({ id }) => id === mineRace)); assert.ok(!fresh.races.some(({ id }) => id === hiddenRace));
  assert.equal(fresh.races.find(({ id }) => id === raceRoot).catalogSource, "context");
  assert.ok(!fresh.tags.some(({ id }) => id === hiddenTagId));
  const retained = await campaigns.getCampaignReferenceData(campaignId);
  assert.equal(retained.races.find(({ id }) => id === hiddenRace).existingSelection, true);
  assert.ok(retained.tags.some(({ id }) => id === hiddenTagId));
  // Admin editing another creator's Campaign must still use that creator's preference.
  assert.deepEqual(await actors.run(admin, () => campaigns.getCampaignReferenceData(campaignId)), retained);
  const selected = [fixture.get("equipment")[2], fixture.get("inventory")[2]];
  const pool = await campaigns.getCampaignInventoryItems({ campaignId, selectedTagIds: [tagId], selectedItemIds: selected });
  assert.deepEqual(pool.filter((row) => row.matchesSelectedTags).map(({ id }) => id).sort((a,b) => a-b), [0,3,4,6].map((i) => fixture.get("equipment")[i]).concat([1,3].map((i) => fixture.get("inventory")[i])).sort((a,b) => a-b));
  for (const id of selected) { const row = pool.find((entry) => entry.id === id); assert.equal(row.existingSelection, true); assert.equal(row.matchesSelectedTags, false); }
  const freshItems = await campaigns.getCampaignInventoryItems({ campaignId: null, selectedTagIds: [tagId], selectedItemIds: selected });
  assert.ok(!freshItems.some(({ id }) => selected.includes(id)));
  assert.deepEqual(await snapshot(), before);
  const draft = await campaigns.getCampaignAdmin(campaignId);
  await campaigns.saveCampaignAdmin({ ...draft, overview: "Explicit edit preserves hidden membership" });
  const saved = await campaigns.getCampaignAdmin(campaignId);
  assert.deepEqual(saved.campaignRaceIds, [hiddenRace]); assert.deepEqual(saved.allowedRaceIds, [hiddenRace]); assert.deepEqual(saved.inventoryItemIds, selected);
  await prefs.update({ catalog: "race", mode: "canon" });
  const canon = await campaigns.getCampaignCreationReferenceData();
  assert.ok(canon.races.some(({ id }) => id === raceRoot)); assert.ok(!canon.races.some(({ id }) => id === mineRace));
});

test("embedded discovery filters new choices and keeps stored Item power/Skill/tag references", async () => {
  await prefs.update({ catalog: "skill", mode: "mine" });
  for (const find of [races.listRaceSkillCandidates, races.listNaturalAttackSkillCandidates, creatures.listCreatureSkillCandidates]) {
    const choices = await find("P4"); assert.ok(choices.some(({ id }) => id === mineSkill)); assert.ok(!choices.some(({ id }) => id === hiddenSkill));
  }
  assert.ok(!(await forms.listFormAccessReferences("skill", "P4")).some(({ id }) => id === hiddenSkill));
  assert.ok(!(await abilities.getDerivedAbilityEditorReferences()).skills.some(({ id }) => id === hiddenSkill));
  const hierarchy = await skills.getSkillEditorHierarchy();
  assert.ok(!hierarchy.skills.some(({ id }) => id === hiddenSkill));
  const fresh = await items.listItemAuthoringReferences(undefined, "equipment");
  assert.ok(!fresh.skills.some(({ id }) => id === hiddenSkill)); assert.ok(!fresh.powerSources.some(({ skillId }) => skillId === hiddenSkill));
  await assert.rejects(items.listItemAuthoringReferences(powerItem, "equipment"), /not available/);
  const retained = await actors.run(foreign, () => items.listItemAuthoringReferences(powerItem, "equipment"));
  assert.ok(retained.skills.some(({ id }) => id === hiddenSkill)); assert.ok(retained.powerSources.some(({ skillId }) => skillId === hiddenSkill));
  assert.ok(retained.tags.some(({ name }) => name === "Pass Four Hidden"));
  assert.ok(!(await items.findRelatedItems("P4 equipment Foreign")).some(({ id }) => id === powerItem));
});

test("manual activation attribution is an account deletion blocker", async () => {
  const reviewer = "pass-four-reviewer";
  await pool.query('insert into "user"(id,name,email) values($1,$1,$2)', [reviewer, `${reviewer}@example.invalid`]);
  await pool.query("insert into user_role(user_id,role) values($1,'admin')", [reviewer]);
  const { previewAdminAccountDeletion, permanentlyDeleteAdminAccount } = await import("../src/features/lifecycle/admin-account-lifecycle-service.ts");
  const preview = await previewAdminAccountDeletion(reviewer, admin);
  assert.equal(preview.canDelete, false);
  assert.equal(preview.blockers.find(({ key }) => key === "catalog_scope_activation_actor_fk")?.count, 2);
  await assert.rejects(permanentlyDeleteAdminAccount(reviewer, { targetUserId: admin, confirmationText: `DELETE ${admin}@example.invalid`, reason: "Attribution must remain" }), /blocked|references|activation/i);
  assert.equal((await one('select count(*)::int n from "user" where id=$1', [admin])).n, 1);
});
