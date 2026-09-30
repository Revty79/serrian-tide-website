import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { after, before, mock, test } from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
assert.equal(process.env.SERRIAN_SPECIAL_ABILITY_DISPOSABLE, "true");
assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_special_ability_disposable_dev$/);
const actors = new AsyncLocalStorage();
const god = "synthetic-mechanics-god", other = "synthetic-other", player = "synthetic-player", admin = "synthetic-admin";
mock.module(pathToFileURL(path.resolve("src/lib/server-access.ts")).href, { namedExports: {
  requireSession: async () => ({ user: { id: actors.getStore() ?? god } }),
  requireGodOrAdminAccessContext: async () => {
    const id = actors.getStore() ?? god;
    const roles = (await pool.query("select role from user_role where user_id=$1", [id])).rows.map(row => row.role);
    if (!roles.some(role => ["admin", "god"].includes(role))) throw new Error("Authoring access required.");
    return { session: { user: { id } }, roles };
  },
} });
mock.module("next/cache", { namedExports: { revalidatePath() {} } });
const { db, pool } = await import("../src/db/index.ts");
const { getSkill, saveSkill } = await import("../src/app/heavens/skills/actions.ts");
const { getDerivedAbility, saveDerivedAbility } = await import("../src/app/heavens/derived-abilities/actions.ts");
const lifecycle = await import("../src/features/lifecycle/lifecycle-service.ts");
const { getSpecialAbilityMechanicsProjection } = await import("../src/features/special-abilities/read-service.ts");
const { getMechanicsEditorReferences } = await import("../src/features/special-abilities/editor-actions.ts");
const { createEmptySpell } = await import("../src/features/spell-construction/utilities/spellFactory.ts");
const { lockMechanicsReferenceGraph } = await import("../src/features/special-abilities/reference-service.ts");
const { saveSkillExtensionMutations } = await import("../src/features/skills/skill-extension-persistence.ts");
const actor = { userId: god, roles: ["god"] }, type = "special-ability-mechanics";
const rule = (references = []) => ({ key: "same-stable-key", kind: "capability", domain: "other", title: "Synthetic capability", description: "Synthetic description only.",
  when: { mode: "always" }, limitations: "", notes: "", references });
const document = (references = []) => ({ schemaVersion: 1, rules: [rule(references)] });
const upsert = (data = document(), extensionType = type, schemaVersion = 1) => ({ operation: "upsert", extensionType, schemaVersion, data });
const remove = extensionType => ({ operation: "remove", extensionType });
const fresh = (name, mutations = []) => ({ core: { name, classification: "special ability", tier: null, primaryAttribute: null, secondaryAttribute: null, definition: "Synthetic fixture.", sourceSystem: null, sourceExternalId: null }, relationships: [], extensions: [], extensionMutations: mutations });
const raw = async id => (await pool.query("select * from skill_extension where skill_id=$1 order by extension_type", [id])).rows;
const update = async (id, mutations = [], core = {}, confirmation = {}) => { const draft = await getSkill(id); return saveSkill({ ...draft, core: { ...draft.core, ...core }, extensionMutations: mutations }, confirmation); };
const target = (kind, id) => ({ entityKind: kind, entityId: id });
const makeDerived = async name => (await pool.query("insert into derived_ability(name,created_by_user_id) values($1,$2) returning id", [name, god])).rows[0].id;
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
async function stillPending(promise) {
  let settled = false;
  void promise.then(() => { settled = true; }, () => { settled = true; });
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(settled, false, "Concurrent lifecycle/save must wait for the graph lock.");
}
before(async () => {
  for (const [id, role] of [[god, "god"], [other, "god"], [player, "player"], [admin, "admin"]]) {
    await pool.query('insert into "user"(id,name,email) values($1,$1,$2)', [id, id + "@example.invalid"]);
    await pool.query("insert into user_role(user_id,role) values($1,$2)", [id, role]);
  }
});
after(async () => { await pool.end(); });

test("mechanics pickers authorize discovery, retain exact archived identities, and honor catalog visibility", async () => {
  const selected = await saveSkill(fresh("Synthetic picker retained"));
  const derived = await makeDerived("Synthetic picker derived");
  const owner = await saveSkill(fresh("Synthetic picker owner", [upsert(document([{ kind: "skill", skillId: selected.id }, { kind: "derived-ability", derivedAbilityId: derived }]))]));
  await lifecycle.archiveLifecycleEntityForActor(target("skill", selected.id), actor, "Synthetic picker archive");
  await lifecycle.archiveLifecycleEntityForActor(target("derived-ability", derived), actor, "Synthetic picker archive");
  const unselected = await saveSkill(fresh("Synthetic unselected archive"));
  await lifecycle.archiveLifecycleEntityForActor(target("skill", unselected.id), actor, "Synthetic archive");
  const refs = await getMechanicsEditorReferences(owner.id);
  assert.ok(refs.options.some(row => row.kind === "skill" && row.skillId === selected.id && row.archived));
  assert.ok(refs.options.some(row => row.kind === "derived-ability" && row.derivedAbilityId === derived && row.archived));
  assert.ok(!refs.options.some(row => row.kind === "skill" && row.skillId === unselected.id));
  assert.ok(!(await getMechanicsEditorReferences()).options.some(row => row.archived));
  await assert.rejects(actors.run(player, () => getMechanicsEditorReferences(owner.id)), /access/);
  await assert.rejects(getMechanicsEditorReferences(-1), /saved Skill/);
  const hidden = await actors.run(other, () => saveSkill(fresh("Synthetic other creator picker choice")));
  await pool.query("insert into catalog_visibility_scope_activation(catalog_key,activation_method,activated_by_user_id) values('skill','manual',$1)", [god]);
  try {
    assert.ok(!(await getMechanicsEditorReferences(owner.id)).options.some(row => row.kind === "skill" && row.skillId === hidden.id));
    await pool.query("update skill set is_system_canon=true,canon_marked_by_user_id=$2,canon_marked_at=now() where id=$1", [hidden.id, admin]);
    assert.ok((await getMechanicsEditorReferences(owner.id)).options.some(row => row.kind === "skill" && row.skillId === hidden.id));
  } finally { await pool.query("delete from catalog_visibility_scope_activation where catalog_key='skill'"); }
});

test("real Skill actions preserve unrelated bytes and IDs; explicit family edits and detach remain independent", async () => {
  const spell = createEmptySpell();
  let saved = await saveSkill(fresh("Synthetic multiple extensions", [upsert(), upsert(spell, "spell-construction", spell.schemaVersion)]));
  assert.equal(saved.extensions.length, 2);
  await pool.query("insert into skill_extension(skill_id,extension_type,schema_version,data_json) values($1,'unknown-future-family',73,$2)", [saved.id, ' { "future" : [ 1, 2 ], "spacing" : "keep" }\n']);
  const before = await raw(saved.id);
  saved = await update(saved.id, [], { definition: "Changed core only." });
  assert.deepEqual(await raw(saved.id), before);
  assert.equal(saved.extensions.find(row => row.extensionType === type).data.rules[0].key, "same-stable-key");
  saved = await update(saved.id, [upsert({ schemaVersion: 1, rules: [] })]);
  const after = await raw(saved.id);
  for (const row of before.filter(row => row.extension_type !== type)) assert.deepEqual(after.find(item => item.extension_type === row.extension_type), row);
  const spellEdited = { ...spell, notes: "Explicit spell change" };
  await update(saved.id, [upsert(spellEdited, "spell-construction", spell.schemaVersion)]);
  assert.equal((await getSkill(saved.id)).extensions.find(row => row.extensionType === type).data.rules.length, 0);
  await update(saved.id, [remove(type)]);
  assert.equal((await raw(saved.id)).some(row => row.extension_type === type), false);
  await update(saved.id, [remove("spell-construction")]);
  assert.deepEqual((await raw(saved.id)).map(row => row.extension_type), ["unknown-future-family"]);
  const unversioned = await getSkill(saved.id);
  delete unversioned.revision;
  await assert.rejects(saveSkill(unversioned), /revision|Reload/);
});

test("stale full-Skill drafts cannot erase newer mechanics or overwrite core; source and edit authorization survive", async () => {
  const saved = await saveSkill(fresh("Synthetic stale"));
  const stale = await getSkill(saved.id);
  await update(saved.id, [upsert()]);
  await assert.rejects(saveSkill({ ...stale, core: { ...stale.core, name: "Stale rename" } }), /changed|Reload/);
  assert.equal((await getSkill(saved.id)).core.name, saved.core.name);
  assert.equal((await raw(saved.id)).length, 1);
  const newest = await getSkill(saved.id);
  await assert.rejects(actors.run(other, () => saveSkill(newest)), /creator|administrator/);
  await assert.rejects(actors.run(player, () => saveSkill(newest)), /access/);
  await assert.rejects(saveSkill({ ...newest, core: { ...newest.core, sourceSystem: "forged" } }), /source identity/);
  await actors.run(admin, () => saveSkill(newest));
  const simultaneous = await getSkill(saved.id);
  const outcomes = await Promise.allSettled([saveSkill({ ...simultaneous, core: { ...simultaneous.core, definition: "First" } }), saveSkill({ ...simultaneous, core: { ...simultaneous.core, definition: "Second" } })]);
  assert.equal(outcomes.filter(row => row.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter(row => row.status === "rejected").length, 1);
});

test("future Spell Construction is preserved during core and mechanics edits and cannot be downgraded", async () => {
  const saved = await saveSkill(fresh("Synthetic future spell", [upsert()]));
  const bytes = ' { "schemaVersion": 999, "futureSpellData": true } ';
  await pool.query("insert into skill_extension(skill_id,extension_type,schema_version,data_json) values($1,'spell-construction',999,$2)", [saved.id, bytes]);
  const before = (await raw(saved.id)).find(row => row.extension_type === "spell-construction");
  assert.equal((await getSkill(saved.id)).extensions.find(row => row.extensionType === "spell-construction").readStatus, "unsupported");
  await update(saved.id, [upsert({ schemaVersion: 1, rules: [] })], { name: "Synthetic future spell renamed" });
  assert.deepEqual((await raw(saved.id)).find(row => row.extension_type === "spell-construction"), before);
  const ordinary = createEmptySpell();
  await assert.rejects(update(saved.id, [upsert(ordinary, "spell-construction", ordinary.schemaVersion)]), /newer Spell Construction/);
  await update(saved.id, [remove("spell-construction")]);
  assert.equal((await raw(saved.id)).some(row => row.extension_type === type), true);
});

test("classification gates are semantic; explicit detach permits changing away; failures roll back", async () => {
  const standard = fresh("Synthetic ordinary", [upsert()]);
  standard.core = { ...standard.core, classification: "standard", tier: 1, primaryAttribute: "STR" };
  await assert.rejects(saveSkill(standard), /only be attached/);
  const saved = await saveSkill(fresh("Synthetic classification", [upsert()]));
  const standardCore = { classification: "standard", tier: 1, primaryAttribute: "STR" };
  await assert.rejects(update(saved.id, [], standardCore), /structural Skill change/);
  await assert.rejects(update(saved.id, [], standardCore, { structuralChangeConfirmed: true }), /detach/);
  assert.equal((await getSkill(saved.id)).core.classification, "special ability");
  await update(saved.id, [remove(type)], standardCore, { structuralChangeConfirmed: true });
  assert.equal((await getSkill(saved.id)).core.classification, "standard");
  const plural = { ...standard, core: { ...standard.core, name: "Synthetic plural", classification: "Special Abilities" } };
  assert.equal((await saveSkill(plural)).extensions.length, 1);
});

test("Skill and Derived references validate, retain archived targets, and block deletion symmetrically", async () => {
  const referenced = await saveSkill(fresh("Synthetic referenced"));
  const derived = await makeDerived("Synthetic derived reference");
  const refs = [{ kind: "skill", skillId: referenced.id }, { kind: "derived-ability", derivedAbilityId: derived }];
  const owner = await saveSkill(fresh("Synthetic reference owner", [upsert(document(refs))]));
  for (const selected of [target("skill", referenced.id), target("derived-ability", derived)]) {
    const preview = await lifecycle.previewLifecycleEntityForActor(selected, actor);
    assert.equal(preview.canDelete, false);
    assert.ok(preview.dependencies.some(row => row.label.includes("mechanics") && row.count > 0));
    await assert.rejects(lifecycle.permanentlyDeleteLifecycleEntityForActor(selected, actor), /mechanics|referenced/);
    await lifecycle.archiveLifecycleEntityForActor(selected, actor, "Synthetic archive");
  }
  await update(owner.id, [upsert(document(refs))]);
  await assert.rejects(saveSkill(fresh("Synthetic new archive reference", [upsert(document(refs))])), /Archived reference/);
  for (const missing of [{ kind: "skill", skillId: 2147483647 }, { kind: "derived-ability", derivedAbilityId: 2147483647 }])
    await assert.rejects(update(owner.id, [upsert(document([missing]))]), /no longer exists/);
  const view = await getSpecialAbilityMechanicsProjection(owner.id);
  assert.equal(view.context, "definition");
  assert.equal(view.rules[0].status, "unavailable");
  assert.ok(view.references.every(row => row.status === "archived" && row.name));
  await update(owner.id, [remove(type)]);
  for (const selected of [target("skill", referenced.id), target("derived-ability", derived)]) await lifecycle.permanentlyDeleteLifecycleEntityForActor(selected, actor);
});

test("save-first, delete-first and archive-first races cannot leave dangling or newly archived references", async () => {
  const ref = await saveSkill(fresh("Synthetic concurrent reference"));
  const owner = await saveSkill(fresh("Synthetic concurrent owner"));
  const ready = deferred(), release = deferred();
  const write = db.transaction(async tx => {
    await lockMechanicsReferenceGraph(tx);
    await saveSkillExtensionMutations(tx, { skillId: owner.id, name: owner.core.name, classification: "special ability", actor, previous: [],
      mutations: [upsert(document([{ kind: "skill", skillId: ref.id }]))] });
    ready.resolve(); await release.promise;
  });
  await ready.promise;
  const deletion = lifecycle.permanentlyDeleteLifecycleEntityForActor(target("skill", ref.id), actor);
  const rejection = assert.rejects(deletion, /referenced/);
  await stillPending(deletion); release.resolve(); await write; await rejection;
  await update(owner.id, [remove(type)]);

  const deleting = deferred(), finishDelete = deferred();
  const deletionWins = lifecycle.permanentlyDeleteLifecycleEntityForActor(target("skill", ref.id), actor, undefined, { afterAudit: async () => { deleting.resolve(); await finishDelete.promise; } });
  await deleting.promise;
  const pendingSave = update(owner.id, [upsert(document([{ kind: "skill", skillId: ref.id }]))]);
  const saveRejected = assert.rejects(pendingSave, /no longer exists/);
  await stillPending(pendingSave); finishDelete.resolve(); await deletionWins; await saveRejected;
  assert.equal((await raw(owner.id)).length, 0);

  const archived = await makeDerived("Synthetic archive race");
  const locked = deferred(), unlock = deferred();
  const archiving = db.transaction(async tx => {
    await lockMechanicsReferenceGraph(tx);
    const { sql } = await import("drizzle-orm");
    await tx.execute(sql`update derived_ability set archived_at = now(), archived_by_user_id = ${god}, archive_reason = 'Synthetic' where id = ${archived}`);
    locked.resolve(); await unlock.promise;
  });
  await locked.promise;
  const pending = update(owner.id, [upsert(document([{ kind: "derived-ability", derivedAbilityId: archived }]))]);
  const rejected = assert.rejects(pending, /Archived reference/);
  await stillPending(pending); unlock.resolve(); await archiving; await rejected;
});

test("Derived authoring waits for the reference graph before locking its root", async () => {
  const derived = await makeDerived("Synthetic concurrent Derived authoring");
  const draft = await getDerivedAbility(derived);
  const ready = deferred(), checkRoot = deferred(), checked = deferred(), release = deferred();
  const holding = db.transaction(async tx => {
    await lockMechanicsReferenceGraph(tx);
    ready.resolve();
    await checkRoot.promise;
    const { sql } = await import("drizzle-orm");
    // A writer that updated its Derived root before waiting on the graph would
    // conflict here. Do not wait indefinitely if that order ever regresses.
    await tx.execute(sql`select id from derived_ability where id = ${derived} for share nowait`);
    checked.resolve();
    await release.promise;
  });
  await ready.promise;
  const pending = saveDerivedAbility({ ...draft, core: { ...draft.core, description: "Synthetic updated description." } });
  try {
    await stillPending(pending);
    checkRoot.resolve();
    await Promise.race([checked.promise, holding]);
  } finally {
    checkRoot.resolve(); release.resolve();
    await holding;
  }
  assert.equal((await pending).core.description, "Synthetic updated description.");
});

test("unsupported and malformed documents survive core edits; unknown dependencies block destructive deletion", async () => {
  const saved = await saveSkill(fresh("Synthetic future document"));
  const rawFuture = ' { "schemaVersion": 90, "futureFamily": { "unrecognized": true } } ';
  await pool.query("insert into skill_extension(skill_id,extension_type,schema_version,data_json) values($1,$2,90,$3)", [saved.id, type, rawFuture]);
  const before = await raw(saved.id);
  assert.equal((await getSkill(saved.id)).extensions[0].readStatus, "unsupported");
  await update(saved.id, [], { definition: "Core editing remains available." });
  assert.deepEqual(await raw(saved.id), before);
  await assert.rejects(update(saved.id, [upsert()]), /newer mechanics/);
  const victim = await saveSkill(fresh("Synthetic protected from unknown dependency"));
  await assert.rejects(lifecycle.permanentlyDeleteLifecycleEntityForActor(target("skill", victim.id), actor), /unreadable/);
  await pool.query("update skill_extension set data_json = '{' where skill_id=$1", [saved.id]);
  assert.equal((await getSkill(saved.id)).extensions[0].readStatus, "invalid");
  await assert.rejects(update(saved.id, [upsert()]), /newer mechanics/);
  await pool.query("update skill_extension set data_json = '{', schema_version = 1 where skill_id=$1", [saved.id]);
  assert.equal((await getSkill(saved.id)).extensions[0].readStatus, "invalid");
  const invalidBefore = await raw(saved.id);
  await update(saved.id, [], { definition: "Still editable core." });
  assert.deepEqual(await raw(saved.id), invalidBefore);
  await assert.rejects(lifecycle.permanentlyDeleteLifecycleEntityForActor(target("skill", victim.id), actor), /unreadable/);
  await update(saved.id, [remove(type)]);
  await lifecycle.permanentlyDeleteLifecycleEntityForActor(target("skill", victim.id), actor);
});

test("authorized Character projection reads racial zero-point possession and existing Derived facts without state changes", async () => {
  const derived = await makeDerived("Synthetic automatically possessed derived");
  const input = document([{ kind: "derived-ability", derivedAbilityId: derived }]);
  input.rules[0].when = { mode: "requirements", groups: [{ key: "g", conditions: [{ key: "d", kind: "derived-ability-possession", derivedAbilityId: derived, operator: "possessed" }] }] };
  const ability = await saveSkill(fresh("Synthetic racial mechanics", [upsert(input)]));
  const campaignId = (await pool.query("insert into campaign(name,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,created_by_user_id) values('Synthetic campaign',1,1,1,1,100,0,'Credits','Rolled',$1) returning id", [god])).rows[0].id;
  await pool.query("insert into campaign_player(campaign_id,user_id) values($1,$2)", [campaignId, player]);
  await pool.query("insert into campaign_allowed_system(campaign_id,system,sort_order) values($1,'Derived Abilities',0)", [campaignId]);
  const characterId = (await pool.query("insert into campaign_character(campaign_id,player_user_id,name) values($1,$2,'Synthetic character') returning id", [campaignId, player])).rows[0].id;
  const race = (await pool.query("insert into races(name,created_by_user_id) values('Synthetic race',$1) returning id", [god])).rows[0].id;
  await pool.query("insert into campaign_character_profile(character_id,race_id) values($1,$2)", [characterId, race]);
  await pool.query("insert into race_skill_links(race_id,skill_id,link_type,value) values($1,$2,'Granted',0)", [race, ability.id]);
  const tables = ["campaign_character", "campaign_character_profile", "campaign_character_skill_allocation", "character_derived_ability", "character_derived_ability_use", "campaign_character_active_modifier", "campaign_character_active_mana", "campaign_character_active_health"];
  const snapshot = async () => { const result = {}; for (const table of tables) result[table] = (await pool.query(`select to_jsonb(t) body from ${table} t order by to_jsonb(t)::text`)).rows; return result; };
  const before = await snapshot();
  const view = await actors.run(player, () => getSpecialAbilityMechanicsProjection(ability.id, characterId));
  assert.equal(view.possessed, true); assert.equal(view.progression.value, 0); assert.equal(view.progression.provisional, true);
  assert.equal(view.rules[0].status, "matched"); assert.equal(view.runtimeSupported, false);
  assert.deepEqual(await snapshot(), before);
  await assert.rejects(actors.run(other, () => getSpecialAbilityMechanicsProjection(ability.id, characterId)), /permission/);
  await assert.rejects(actors.run(player, () => getSpecialAbilityMechanicsProjection(ability.id)), /access/);
});
