import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { after, before, mock, test } from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

assert.equal(process.env.SERRIAN_CATALOG_DISPOSABLE, "true");
assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_catalog_visibility_dev$/);
const actor = new AsyncLocalStorage();
const owner = "privacy-owner", foreign = "privacy-other", admin = "privacy-admin", player = "privacy-player";
const rolesFor = id => id === admin ? ["admin"] : id === player ? ["player"] : ["god", "player"];
const session = () => ({ user: { id: actor.getStore() ?? owner } });
mock.module(pathToFileURL(path.resolve("src/lib/server-access.ts")).href, { namedExports: {
  requireSession: async () => session(),
  requirePlayer: async () => session(),
  requireGod: async () => { if (!rolesFor(session().user.id).includes("god")) throw new Error("G.O.D. required"); return session(); },
  requireGodOrAdminAccessContext: async () => {
    const current = session(), roles = rolesFor(current.user.id);
    if (!roles.includes("god") && !roles.includes("admin")) throw new Error("Authoring access required");
    return { session: current, roles };
  },
} });
mock.module("next/cache", { namedExports: { revalidatePath() {} } });
const { db, pool } = await import("../src/db/index.ts");
const one = async (text, values = []) => (await pool.query(text, values)).rows[0];
const { assertNewCatalogReferences } = await import("../src/features/catalog-visibility/catalog-access.ts");
const { loadCampaignSkillAccessInTransaction } = await import("../src/features/campaigns/campaign-skill-access-service.ts");
const { loadCharacterDerivedAbilitiesInTransaction } = await import("../src/features/derived-abilities/character-derived-ability-service.ts");
const { listCreatureCatalogInTransaction } = await import("../src/features/tabletop-operations/creature-spawn-service.ts");
const items = await import("../src/app/heavens/items/actions.ts");
const races = await import("../src/app/heavens/races/actions.ts");
const creatures = await import("../src/app/heavens/creatures/actions.ts");
const skills = await import("../src/app/heavens/skills/actions.ts");
const abilities = await import("../src/app/heavens/derived-abilities/actions.ts");
const campaigns = await import("../src/app/heavens/campaigns/actions.ts");
const characters = await import("../src/app/characters/actions.ts");
const interaction = await import("../src/app/heavens/interaction-rule-actions.ts");
const mechanics = await import("../src/features/special-abilities/editor-actions.ts");
const roots = [
  { kind: "race", table: "races", get: races.getRace, save: races.saveRace },
  { kind: "creature", table: "creatures", get: creatures.getCreature, save: creatures.saveCreature },
  { kind: "skill", table: "skill", get: skills.getSkill, save: skills.saveSkill },
  { kind: "derivedAbility", table: "derived_ability", get: abilities.getDerivedAbility, save: abilities.saveDerivedAbility },
  ...["equipment", "inventory"].map(scope => ({ kind: "item", table: "items", scope, get: items.getItem, save: items.saveItem })),
];
let campaignId, characterId;
before(async () => {
  for (const id of [owner, foreign, admin, player]) {
    await pool.query('insert into "user"(id,name,email) values($1,$1,$2)', [id, `${id}@example.invalid`]);
    for (const role of rolesFor(id)) await pool.query("insert into user_role(user_id,role) values($1,$2)", [id, role]);
  }
  for (const root of roots) {
    root.ids = {};
    for (const [label, creator, canon] of [["mine", owner, false], ["private", foreign, false], ["unowned", null, false], ["canon", foreign, true]]) {
      const name = `Privacy ${root.scope ?? root.kind} ${label}`;
      const fields = root.kind === "creature" ? "canonical_id,canonical_name,size" : root.kind === "item" ? "canonical_id,name,catalog_scope,equipment_group,record_type,family,category,price_basis" : "name";
      const values = root.kind === "creature" ? [name.toUpperCase(), name, "Medium"] : root.kind === "item" ? [name.toUpperCase(), name, root.scope, root.scope === "equipment" ? "general" : null, "Item", "Privacy", "Privacy", "Each"] : [name];
      const n = values.length;
      root.ids[label] = (await one(`insert into ${root.table}(${fields},created_by_user_id,is_system_canon,canon_marked_by_user_id,canon_marked_at) values(${values.map((_,i) => `$${i+1}`).join(",")},$${n+1},$${n+2},case when $${n+2} then $${n+3} else null end,case when $${n+2} then now() else null end) returning id`, [...values, creator, canon, admin])).id;
    }
  }
  campaignId = (await one(`insert into campaign(name,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,assigned_fate_points,created_by_user_id)
    values('Privacy Campaign',100,100,10,10,100,0,'Credits','Assigned',0,$1) returning id`, [owner])).id;
  await pool.query("insert into campaign_player(campaign_id,user_id) values($1,$2)", [campaignId, player]);
  characterId = (await one("insert into campaign_character(campaign_id,player_user_id,name) values($1,$2,'Privacy Character') returning id", [campaignId, player])).id;
  await pool.query("insert into campaign_character_profile(character_id,race_id) values($1,$2)", [characterId, roots[0].ids.private]);
  await pool.query("insert into campaign_character_attribute(character_id,attribute_key,value) select $1,unnest(array['STR','DEX','CON','INT','WIS','CHR']),25", [characterId]);
  await pool.query("insert into campaign_race(campaign_id,race_id,sort_order) values($1,$2,0)", [campaignId, roots[0].ids.private]);
  await pool.query("insert into campaign_allowed_race(campaign_id,race_id,sort_order) values($1,$2,0)", [campaignId, roots[0].ids.private]);
  await pool.query("insert into campaign_character_skill_allocation(character_id,skill_id,points) values($1,$2,5)", [characterId, roots[2].ids.private]);
  await pool.query("insert into character_derived_ability(character_id,derived_ability_id,acquisition_method,acquired_by_user_id) values($1,$2,'awarded',$3)", [characterId, roots[3].ids.private, owner]);
  for (const [i, root] of roots.slice(4).entries()) await pool.query("insert into campaign_inventory_item(campaign_id,item_id,sort_order) values($1,$2,$3)", [campaignId, root.ids.private, i]);
});
after(() => pool.end());

for (const root of roots) test(`${root.scope ?? root.kind}: direct reads and forged selections cannot bypass creator/canon access`, async () => {
  assert.ok(await root.get(root.ids.mine));
  assert.ok(await root.get(root.ids.canon));
  assert.equal(await root.get(root.ids.private), null);
  assert.equal(await root.get(root.ids.unowned), null);
  assert.ok(await actor.run(foreign, () => root.get(root.ids.private)));
  assert.ok(await actor.run(admin, () => root.get(root.ids.unowned)));
  await assert.rejects(actor.run(player, () => root.get(root.ids.canon)), /Authoring/);
  for (const id of [root.ids.private, root.ids.unowned]) await assert.rejects(db.transaction(tx => assertNewCatalogReferences(tx, { userId: owner, roles: ["god"] }, root.kind, [id])), /System Canon/);
  await db.transaction(tx => assertNewCatalogReferences(tx, { userId: owner, roles: ["god"] }, root.kind, [root.ids.mine, root.ids.canon]));
});

test("Campaign membership preserves assigned private content without opening the G.O.D. catalogs", async () => {
  const sheet = await actor.run(player, () => characters.getCharacter(characterId));
  assert.equal(sheet.selectedRace.race.id, roots[0].ids.private);
  for (const label of ["mine", "canon", "private"]) {
    assert.ok(sheet.skillCatalog.some(row => row.id === roots[2].ids[label]));
    assert.ok(sheet.derivedAbilities.some(row => row.id === roots[3].ids[label]));
  }
  assert.ok(!sheet.skillCatalog.some(row => row.id === roots[2].ids.unowned));
  assert.ok(!sheet.derivedAbilities.some(row => row.id === roots[3].ids.unowned));
  for (const root of roots.slice(4)) assert.ok(sheet.authorizedItems.some(row => row.id === root.ids.private));
  await assert.rejects(actor.run(foreign, () => characters.getCharacter(characterId)), /own Character/);
  await pool.query("insert into campaign_player(campaign_id,user_id) values($1,$2)", [campaignId, foreign]);
  assert.equal(await actor.run(foreign, () => races.getRace(roots[0].ids.mine)), null);
  const access = await db.transaction(tx => loadCampaignSkillAccessInTransaction(tx, campaignId));
  assert.ok(!access.library.skills.some(row => row.id === roots[2].ids.unowned));
  const state = await db.transaction(tx => loadCharacterDerivedAbilitiesInTransaction(tx, characterId, player, false));
  assert.ok(!state.catalog.some(row => row.id === roots[3].ids.unowned));
  await pool.query("delete from campaign_player where campaign_id=$1 and user_id=$2", [campaignId, player]);
  await assert.rejects(actor.run(player, () => characters.getCharacter(characterId)), /Character not found|memberships/);
});

test("Campaign saves reject new foreign Race/Item IDs while retaining existing assignments", async () => {
  const draft = await campaigns.getCampaignAdmin(campaignId);
  await campaigns.saveCampaignAdmin(draft);
  await assert.rejects(campaigns.saveCampaignAdmin({ ...draft, campaignRaceIds: [...draft.campaignRaceIds, roots[0].ids.unowned] }), /System Canon/);
  await assert.rejects(campaigns.saveCampaignAdmin({ ...draft, inventoryItemIds: [...draft.inventoryItemIds, roots[4].ids.unowned] }), /System Canon/);
  const saved = await campaigns.getCampaignAdmin(campaignId);
  assert.deepEqual(saved.campaignRaceIds, draft.campaignRaceIds);
  assert.deepEqual(saved.inventoryItemIds, draft.inventoryItemIds);
});

test("Creature encounter choices and forged retained Interaction references stay private", async () => {
  const catalog = await db.transaction(tx => listCreatureCatalogInTransaction(tx, owner));
  assert.ok(catalog.some(row => row.id === roots[1].ids.mine));
  assert.ok(catalog.some(row => row.id === roots[1].ids.canon));
  assert.ok(!catalog.some(row => row.id === roots[1].ids.private || row.id === roots[1].ids.unowned));
  const references = await interaction.getInteractionRuleCatalog({ creatures: ["PRIVACY CREATURE PRIVATE"], tags: [] });
  assert.ok(!references.creatures.some(row => row.canonicalId === "PRIVACY CREATURE PRIVATE"));
});

test("All six inactive catalogs still hide foreign and unattributed non-canon records", async () => {
  await pool.query("delete from catalog_visibility_scope_activation");
  for (const root of roots) {
    const search = `Privacy ${root.scope ?? root.kind}`;
    const result = root.kind === "item" ? await items.listItems({ catalogScope: root.scope, search })
      : root.kind === "race" ? await races.listRaces({ search })
      : root.kind === "creature" ? await creatures.listCreatures({ search })
      : root.kind === "skill" ? await skills.listSkills({ search })
      : await abilities.listDerivedAbilities({ search });
    assert.equal(result.visibility.enabled, false);
    assert.deepEqual(result.items.map(row => row.id).sort((a,b) => a-b), [root.ids.mine, root.ids.canon].sort((a,b) => a-b));
  }
});

test("Saved-reference pickers and Skill previews do not reveal another creator's private roots", async () => {
  await assert.rejects(mechanics.getMechanicsEditorReferences(roots[2].ids.private), /not available/);
  await assert.rejects(items.listItemAuthoringReferences(roots[4].ids.private), /not available/);
  await assert.rejects(abilities.getDerivedAbilityEditorReferences(roots[3].ids.private), /not available/);
  await pool.query("update skill set primary_attribute='STR',tier=1,classification='standard' where id=any($1::int[])", [Object.values(roots[2].ids)]);
  await pool.query("insert into skill_relationship(skill_id,related_skill_id,relationship_type,sort_order) values($1,$2,'parent',0)", [roots[2].ids.private, roots[2].ids.mine]);
  const draft = await skills.getSkill(roots[2].ids.mine);
  const preview = await skills.previewSkillMutation(draft);
  assert.ok(!preview.affectedSkills.some(row => row.id === roots[2].ids.private));
  assert.ok(!preview.affectedSkillIds.includes(roots[2].ids.private));
  await assert.rejects(skills.previewSkillMutation({ ...draft, relationships: [{ relatedSkillId: roots[2].ids.unowned, relationshipType: "parent", sortOrder: 0 }] }), /System Canon/);
});
