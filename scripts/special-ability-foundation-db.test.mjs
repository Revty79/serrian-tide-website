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
  requirePlayer: async () => { const id = actors.getStore() ?? god; if (id !== player) throw new Error("Player required."); return { user: { id } }; },
  requireGod: async () => { const id = actors.getStore() ?? god; if (![god, other].includes(id)) throw new Error("G.O.D. required."); return { user: { id } }; },
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
const { getSpecialAbilityMechanicsProjection, getCharacterSpecialAbilityMechanics } = await import("../src/features/special-abilities/read-service.ts");
const { readSavedSpecialAbilityMechanics } = await import("../src/features/special-abilities/read-actions.ts");
const { getMechanicsEditorReferences } = await import("../src/features/special-abilities/editor-actions.ts");
const { createEmptySpell } = await import("../src/features/spell-construction/utilities/spellFactory.ts");
const { lockMechanicsReferenceGraph } = await import("../src/features/special-abilities/reference-service.ts");
const { saveSkillExtensionMutations } = await import("../src/features/skills/skill-extension-persistence.ts");
const { syntheticToolbox } = await import("../src/features/special-abilities/v2-fixtures.ts");
const characterActions = await import("../src/app/characters/actions.ts");
const { characterAggregateToDraft } = await import("../src/features/characters/character-rules.ts");
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

test("core Character acquisition, grants, advancement, and score limits use real actions atomically", async () => {
  const campaignId = (await pool.query("insert into campaign(name,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,created_by_user_id) values('Synthetic progression campaign',1000,200,100,1,200,0,'Credits','Rolled',$1) returning id", [god])).rows[0].id;
  await pool.query("insert into campaign_player(campaign_id,user_id) values($1,$2)", [campaignId, player]);
  await pool.query("insert into campaign_allowed_system(campaign_id,system,sort_order) values($1,'Special Abilities',0)", [campaignId]);
  const abilities = await Promise.all(["purchased", "unowned", "god-zero", "race-zero", "god-positive"].map(name => saveSkill(fresh(`Synthetic progression ${name}`, [upsert()]))));
  const [purchased, unowned, assigned, racial, positive] = abilities;
  let record = await characterActions.createCharacterForPlayer(campaignId, player);
  const id = record.character.id;
  const asPlayer = operation => actors.run(player, operation);
  const read = () => asPlayer(() => characterActions.getCharacter(id));
  const request = (skillId, pointsToAdd = 1) => ({ planId: String(skillId), skillId, parentAllocationId: null, parentPlanId: null, pointsToAdd });
  const draft = characterAggregateToDraft(record);
  draft.skillAllocations.push({ draftId: -1, skillId: purchased.id, points: 5, parentDraftId: null });
  record = await asPlayer(() => characterActions.saveCharacter(id, draft));
  assert.equal(record.skillAllocations.find(row => row.skillId === purchased.id).points, 5, "beginning purchase");
  const forged = characterAggregateToDraft(record);
  forged.skillAllocations.push({ draftId: -2, skillId: assigned.id, points: 0, parentDraftId: null, specialAbilityGranted: true });
  await assert.rejects(asPlayer(() => characterActions.saveCharacter(id, forged)), /G.O.D./);
  await pool.query("update campaign_character_profile set creation_completed_at=now(),experience=100000 where character_id=$1", [id]);
  record = await read();
  const before = { allocations: record.skillAllocations, xp: record.profile.experience, total: record.profile.totalExperience };
  await assert.rejects(asPlayer(() => characterActions.advanceCharacterSkills(id, [request(purchased.id), request(unowned.id)])), /already.*possessed/);
  record = await read();
  assert.deepEqual({ allocations: record.skillAllocations, xp: record.profile.experience, total: record.profile.totalExperience }, before);
  await pool.query("insert into campaign_character_skill_allocation(character_id,skill_id,points) values($1,$2,0)", [id, unowned.id]);
  await assert.rejects(asPlayer(() => characterActions.advanceCharacterSkills(id, [request(unowned.id)])), /already.*possessed/);
  await pool.query("delete from campaign_character_skill_allocation where character_id=$1 and skill_id=$2", [id, unowned.id]);
  await assert.rejects(asPlayer(() => characterActions.saveCharacter(id, characterAggregateToDraft(record))), /creation.*complete/i);
  record = await asPlayer(() => characterActions.advanceCharacterSkills(id, [request(purchased.id)]));
  assert.equal(record.skillAllocations.find(row => row.skillId === purchased.id).points, 6);
  assert.equal(record.profile.experience, before.xp - 5);
  assert.equal(record.profile.totalExperience, before.total + 5);
  const godDraft = characterAggregateToDraft(record);
  godDraft.skillAllocations.push({ draftId: -2, skillId: assigned.id, points: 0, parentDraftId: null, specialAbilityGranted: true }, { draftId: -3, skillId: positive.id, points: 4, parentDraftId: null });
  record = await characterActions.saveCharacter(id, godDraft, false, true);
  assert.equal(record.skillAllocations.find(row => row.skillId === assigned.id).specialAbilityGranted, true);
  let projection = await asPlayer(() => getSpecialAbilityMechanicsProjection(assigned.id, id));
  assert.equal(projection.possessed, true); assert.equal(projection.progression.value, 0);
  const raceId = (await pool.query("insert into races(name,created_by_user_id) values('Synthetic progression race',$1) returning id", [god])).rows[0].id;
  await pool.query("insert into campaign_allowed_race(campaign_id,race_id,sort_order) values($1,$2,0)", [campaignId, raceId]);
  await pool.query("insert into race_skill_links(race_id,skill_id,link_type,value) values($1,$2,'Granted',0)", [raceId, racial.id]);
  await pool.query("update campaign_character_profile set race_id=$2 where character_id=$1", [id, raceId]);
  projection = await asPlayer(() => getSpecialAbilityMechanicsProjection(racial.id, id));
  assert.equal(projection.possessed, true); assert.equal(projection.progression.value, 0);
  const xp = record.profile.experience;
  record = await asPlayer(() => characterActions.advanceCharacterSkills(id, [request(assigned.id), request(racial.id), request(positive.id)]));
  assert.equal(record.profile.experience, xp - 24, "two first points at 10 and 4 to 5 at 4");
  for (const skill of [assigned, racial]) assert.equal(record.skillAllocations.find(row => row.skillId === skill.id).points, 1);
  const atCap = characterAggregateToDraft(record);
  atCap.skillAllocations.find(row => row.skillId === racial.id).points = 99;
  await pool.query("update race_skill_links set value=1 where race_id=$1 and skill_id=$2", [raceId, racial.id]);
  record = await characterActions.saveCharacter(id, atCap, false, true);
  assert.equal((await asPlayer(() => getSpecialAbilityMechanicsProjection(racial.id, id))).progression.value, 100);
  const tooHigh = characterAggregateToDraft(record);
  tooHigh.skillAllocations.find(row => row.skillId === racial.id).points = 100;
  await assert.rejects(characterActions.saveCharacter(id, tooHigh, false, true), /0 to 100/);
  await assert.rejects(asPlayer(() => characterActions.advanceCharacterSkills(id, [request(racial.id)])), /maximum|100|cap/i);
  await assert.rejects(pool.query("update campaign_character_skill_allocation set points=101 where character_id=$1 and skill_id=$2", [id, purchased.id]), /0 to 100/);
  await assert.rejects(pool.query("update race_skill_links set value=2 where race_id=$1 and skill_id=$2", [raceId, racial.id]), /0 to 100/);
  const strongerRace = (await pool.query("insert into races(name,created_by_user_id) values('Synthetic stronger race',$1) returning id", [god])).rows[0].id;
  await pool.query("insert into race_skill_links(race_id,skill_id,link_type,value) values($1,$2,'Granted',2)", [strongerRace, racial.id]);
  await assert.rejects(pool.query("update campaign_character_profile set race_id=$2 where character_id=$1", [id, strongerRace]), /0 to 100/);
  const ordinaryId = (await pool.query("insert into skill(name,classification,tier,primary_attribute) values('Synthetic ordinary high score','standard',1,'STR') returning id")).rows[0].id;
  await pool.query("insert into campaign_character_skill_allocation(character_id,skill_id,points) values($1,$2,150)", [id, ordinaryId]);
  assert.equal((await pool.query("select points from campaign_character_skill_allocation where character_id=$1 and skill_id=$2", [id, ordinaryId])).rows[0].points, 150);
  await assert.rejects(pool.query("update skill set classification='special ability' where id=$1", [ordinaryId]), /0 to 100/);
});

test("historical v1 and v2 threshold bytes survive core saves while edited invalid benchmarks reject", async () => {
  for (const version of [1, 2]) {
    const saved = await saveSkill(fresh(`Synthetic historical score v${version}`));
    const data = { ...document(), schemaVersion: version };
    data.rules[0].when = { mode: "requirements", groups: [{ key: "g", conditions: [{ key: "c", kind: "self-progression", operator: "gte", requiredValue: 150 }] }] };
    const bytes = ` ${JSON.stringify(data)}\n`;
    await pool.query("insert into skill_extension(skill_id,extension_type,schema_version,data_json) values($1,$2,$3,$4)", [saved.id, type, version, bytes]);
    const before = await raw(saved.id);
    assert.equal((await getSpecialAbilityMechanicsProjection(saved.id)).documentStatus, "ready");
    await update(saved.id, [], { definition: "Core edit keeps historical bytes." });
    assert.deepEqual(await raw(saved.id), before);
    for (const threshold of [-1, 101]) {
      data.rules[0].when.groups[0].conditions[0].requiredValue = threshold;
      await assert.rejects(update(saved.id, [upsert(data, type, version)]), /0|non-negative/);
      assert.deepEqual(await raw(saved.id), before);
    }
  }
});

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
  assert.equal(view.possessed, true); assert.equal(view.progression.value, 0); assert.equal(view.progression.source, "core-v1-special-ability-score");
  assert.equal(view.rules[0].status, "matched"); assert.equal(view.runtimeSupported, false);
  assert.deepEqual(await snapshot(), before);
  // Expanded definitions must also remain entirely read-only for a possessed owner.
  await update(ability.id, [upsert(syntheticToolbox(ability.id, derived), type, 2)]);
  const expanded = await actors.run(player, () => getSpecialAbilityMechanicsProjection(ability.id, characterId));
  assert.equal(expanded.runtimeSupported, false); assert.ok(expanded.rules.every(rule => rule.status === "manual"));
  assert.deepEqual(await snapshot(), before);
  await assert.rejects(actors.run(other, () => getSpecialAbilityMechanicsProjection(ability.id, characterId)), /permission/);
  await assert.rejects(actors.run(player, () => getSpecialAbilityMechanicsProjection(ability.id)), /access/);
});

test("v2 explicit saves preserve v1 history and unrelated bytes, reject downgrade and stale or dangling writes", async () => {
  const selected = await saveSkill(fresh("Synthetic toolbox target")), derived = await makeDerived("Synthetic toolbox derived");
  const spell = createEmptySpell();
  const owner = await saveSkill(fresh("Synthetic toolbox owner", [upsert(), upsert(spell, "spell-construction", spell.schemaVersion)]));
  await pool.query("insert into skill_extension(skill_id,extension_type,schema_version,data_json) values($1,'synthetic-opaque',99,$2)", [owner.id, ' { "opaque" : true } ']);
  await pool.query("update skill_extension set data_json=$2 where skill_id=$1 and extension_type=$3", [owner.id, ' ' + JSON.stringify(document()) + '\n', type]);
  const original = await raw(owner.id);
  await getSkill(owner.id); await update(owner.id, [], { definition: "Core only, no migration." });
  assert.deepEqual(await raw(owner.id), original);
  const stale = await getSkill(owner.id), v2 = syntheticToolbox(selected.id, derived);
  v2.rules.unshift(document().rules[0]);
  await update(owner.id, [upsert(v2, type, 2)]);
  const saved = await raw(owner.id), current = saved.find(row => row.extension_type === type);
  assert.equal(current.schema_version, 2); assert.equal(current.id, original.find(row => row.extension_type === type).id);
  assert.deepEqual(JSON.parse(current.data_json), v2);
  assert.deepEqual(saved.filter(row => row.extension_type !== type), original.filter(row => row.extension_type !== type));
  await assert.rejects(saveSkill(stale), /changed|Reload/);
  await assert.rejects(update(owner.id, [upsert()]), /downgraded/);
  await assert.rejects(update(owner.id, [upsert({ ...v2, rules: v2.rules.filter(rule => rule.kind !== "resource") }, type, 2)], { definition: "Must roll back" }), /missing/);
  assert.deepEqual(await raw(owner.id), saved); assert.notEqual((await getSkill(owner.id)).core.definition, "Must roll back");
  await update(owner.id, [], { definition: "Core preserves v2 bytes." }); assert.deepEqual(await raw(owner.id), saved);
});

test("v2 nested modifier, choice and maximum-condition references each enforce lifecycle and archived retention", async () => {
  for (const location of ["modifier", "intrinsic-modifier", "skill-choice", "derived-choice", "maximum-condition"]) {
    const skill = await saveSkill(fresh(`Synthetic ${location} target`)), derived = await makeDerived(`Synthetic ${location} derived`);
    const full = syntheticToolbox(skill.id, derived);
    let rule;
    if (location === "modifier") rule = full.rules.find(rule => rule.kind === "modifier");
    if (location === "intrinsic-modifier") rule = { ...full.rules.find(rule => rule.kind === "activated"), choiceKeys: [], costs: [], effects: [{ key: "effect", effect: full.rules.find(rule => rule.kind === "modifier").effect }] };
    if (location === "skill-choice" || location === "derived-choice") rule = { ...full.rules.find(rule => rule.kind === "choice"), selection: location === "skill-choice" ? { kind: "skill", skillIds: [skill.id] } : { kind: "derived-ability", derivedAbilityIds: [derived] } };
    if (location === "maximum-condition") rule = full.rules.find(rule => rule.kind === "resource");
    const input = { schemaVersion: 2, rules: [rule] }, selected = location === "derived-choice" ? target("derived-ability", derived) : target("skill", skill.id);
    const owner = await saveSkill(fresh(`Synthetic ${location} owner`, [upsert(input, type, 2)]));
    assert.equal((await lifecycle.previewLifecycleEntityForActor(selected, actor)).canDelete, false);
    await assert.rejects(lifecycle.permanentlyDeleteLifecycleEntityForActor(selected, actor), /mechanics|referenced/);
    await lifecycle.archiveLifecycleEntityForActor(selected, actor, "Synthetic nested reference archive");
    await update(owner.id, [upsert(input, type, 2)]);
    const refs = await getMechanicsEditorReferences(owner.id);
    assert.ok(refs.options.some(row => row.archived && (row.kind === "skill" ? row.skillId === skill.id : row.derivedAbilityId === derived)));
    await assert.rejects(saveSkill(fresh(`Synthetic new ${location} archived link`, [upsert(input, type, 2)])), /Archived reference/);
    await update(owner.id, [remove(type)]);
    assert.equal((await lifecycle.previewLifecycleEntityForActor(selected, actor)).canDelete, true);
    await lifecycle.permanentlyDeleteLifecycleEntityForActor(selected, actor);
  }
});

test("batched Character presentation preserves all states, saved possession and exact references without runtime writes", async () => {
  const campaignId = (await pool.query("insert into campaign(name,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,created_by_user_id) values('Synthetic presentation campaign',1,1,1,1,100,0,'Credits','Rolled',$1) returning id", [god])).rows[0].id;
  await pool.query("insert into campaign_player(campaign_id,user_id) values($1,$2)", [campaignId, player]);
  const characterId = (await pool.query("insert into campaign_character(campaign_id,player_user_id,name) values($1,$2,'Synthetic mechanics reader') returning id", [campaignId, player])).rows[0].id;
  const race = (await pool.query("insert into races(name,created_by_user_id) values('Synthetic presentation Race',$1) returning id", [god])).rows[0].id;
  await pool.query("insert into campaign_character_profile(character_id,race_id) values($1,$2)", [characterId, race]);
  await pool.query("insert into campaign_character_active_health(character_id,total_damage) values($1,5)", [characterId]);
  await pool.query("insert into campaign_character_active_mana(character_id,system,mana_spent) values($1,'Spellcraft',4)", [characterId]);
  const selected = await saveSkill(fresh("Synthetic readable target")), derived = await makeDerived("Synthetic readable Derived");
  const ids = {};
  for (const state of ["legacy", "empty", "v1", "v2", "invalid", "future", "unpossessed", "zero-allocation"]) {
    const input = state === "empty" ? { schemaVersion: 1, rules: [] } : state === "v1" ? document([{ kind: "skill", skillId: selected.id }]) : state === "v2" ? syntheticToolbox(selected.id, derived) : null;
    const saved = await saveSkill(fresh(`Synthetic presentation ${state}`, input ? [upsert(input, type, input.schemaVersion)] : [])); ids[state] = saved.id;
    if (["invalid", "future"].includes(state)) await pool.query("insert into skill_extension(skill_id,extension_type,schema_version,data_json) values($1,$2,$3,$4)", [saved.id, type, state === "invalid" ? 2 : 99, state === "invalid" ? "{" : '{"schemaVersion":99,"future":true}']);
    if (state === "v1") await pool.query("insert into race_skill_links(race_id,skill_id,link_type,value) values($1,$2,'Granted',0)", [race, saved.id]);
    else if (state !== "unpossessed") await pool.query("insert into campaign_character_skill_allocation(character_id,skill_id,points) values($1,$2,$3)", [characterId, saved.id, state === "zero-allocation" ? 0 : 3]);
  }
  // Same Skill through two paths: one document and the established maximum, not a sum.
  await pool.query("insert into campaign_character_skill_allocation(character_id,skill_id,parent_allocation_id,points) select $1,$2,id,7 from campaign_character_skill_allocation where character_id=$1 and skill_id=$3", [characterId, ids.v2, ids.legacy]);
  await pool.query("update skill set archived_at=now(),archived_by_user_id=$1 where id=$2", [god, selected.id]);
  const fields = (await pool.query("select table_name from information_schema.tables where table_schema='public' and (table_name='campaign_character' or starts_with(table_name,'campaign_character_') or starts_with(table_name,'character_derived_ability') or starts_with(table_name,'campaign_session') or starts_with(table_name,'item_') or starts_with(table_name,'inventory_') or starts_with(table_name,'character_form')) order by table_name")).rows;
  const snapshot = async () => { const values = {}; for (const { table_name: table } of fields) { assert.match(table, /^[a-z_]+$/); values[table] = (await pool.query(`select to_jsonb(t) body from "${table}" t order by to_jsonb(t)::text`)).rows; } return values; };
  const before = await snapshot();
  const { Client } = await import("pg"); const originalQuery = Client.prototype.query;
  let queries = [];
  const spy = mock.method(Client.prototype, "query", function(...args) { queries.push(typeof args[0] === "string" ? args[0] : args[0].text); return originalQuery.apply(this, args); });
  let result, queryCount;
  try {
    result = await actors.run(player, () => readSavedSpecialAbilityMechanics(characterId));
    queryCount = queries.filter(sql => /^select/i.test(sql)).length;
    assert.ok(queries.some(sql => /read only/i.test(sql)), "database must enforce read-only");
    assert.equal(queries.filter(sql => /^select/i.test(sql) && /"skill_extension"/.test(sql)).length, 1, "one source/extension batch");
  } finally { spy.mock.restore(); }
  assert.equal(result.context, "saved-normal"); assert.equal(result.runtimeSupported, false); assert.equal(result.abilities.length, 6);
  const byId = new Map(result.abilities.map(ability => [ability.mechanics.source.id, ability]));
  assert.equal(byId.get(ids.legacy).mechanics.documentStatus, "absent"); assert.equal(byId.get(ids.empty).mechanics.empty, true);
  assert.equal(byId.get(ids.invalid).mechanics.documentStatus, "invalid"); assert.equal(byId.get(ids.future).mechanics.documentStatus, "unsupported");
  assert.equal(byId.get(ids.v1).mechanics.progression.value, 0); assert.equal(byId.get(ids.v1).possession.racial, true); assert.equal(byId.get(ids.v1).mechanics.rules[0].status, "matched");
  assert.equal(byId.get(ids.v2).mechanics.progression.value, 7); assert.equal(byId.get(ids.v2).possession.purchased, true);
  assert.ok(byId.get(ids.v2).mechanics.references.some(ref => ref.name === "Synthetic readable target" && ref.status === "archived"));
  assert.ok(!byId.has(ids.unpossessed)); assert.ok(!byId.has(ids["zero-allocation"]));
  assert.deepEqual(await actors.run(god, () => getCharacterSpecialAbilityMechanics(characterId)), result);
  assert.deepEqual(await actors.run(admin, () => getCharacterSpecialAbilityMechanics(characterId)), result);
  await assert.rejects(actors.run(other, () => getCharacterSpecialAbilityMechanics(characterId)), /permission/);
  await assert.rejects(getCharacterSpecialAbilityMechanics(-1), /saved Character/);
  await assert.rejects(actors.run(player, () => getCharacterSpecialAbilityMechanics(2147483647)), /permission/);
  assert.deepEqual(await snapshot(), before);
  // Simulate a historical missing link without weakening lifecycle validation.
  const dangling = syntheticToolbox(2147483647, derived);
  await pool.query("update skill_extension set data_json=$2 where skill_id=$1 and extension_type=$3", [ids.v2, JSON.stringify(dangling), type]);
  assert.ok((await actors.run(player, () => getCharacterSpecialAbilityMechanics(characterId))).abilities.find(row => row.mechanics.source.id === ids.v2).mechanics.references.some(ref => ref.status === "missing" && ref.name === null));
  // Expansion adds rows, not per-ability queries. Raw synthetic inserts preserve archived refs for this read test.
  for (let i = 0; i < 12; i++) {
    const saved = await saveSkill(fresh(`Synthetic batch ${i}`));
    await pool.query("insert into skill_extension(skill_id,extension_type,schema_version,data_json) values($1,$2,2,$3)", [saved.id, type, JSON.stringify(dangling)]);
    await pool.query("insert into campaign_character_skill_allocation(character_id,skill_id,points) values($1,$2,1)", [characterId, saved.id]);
  }
  queries = [];
  const batchSpy = mock.method(Client.prototype, "query", function(...args) { queries.push(typeof args[0] === "string" ? args[0] : args[0].text); return originalQuery.apply(this, args); });
  try { assert.equal((await actors.run(player, () => getCharacterSpecialAbilityMechanics(characterId))).abilities.length, 18); assert.equal(queries.filter(sql => /^select/i.test(sql)).length, queryCount); console.log(`Batched mechanics: ${queryCount} SELECTs for both 6 and 18 possessed abilities, including Derived facts.`); }
  finally { batchSpy.mock.restore(); }
  // Evolved Race uses current saved links; no Evolution-specific mechanics adapter.
  const nextRace = (await pool.query("insert into races(name,created_by_user_id) values('Synthetic evolved Race',$1) returning id", [god])).rows[0].id;
  await pool.query("update campaign_character_profile set race_id=$2 where character_id=$1", [characterId, nextRace]);
  assert.ok(!(await actors.run(player, () => getCharacterSpecialAbilityMechanics(characterId))).abilities.some(row => row.mechanics.source.id === ids.v1));
  await pool.query("update campaign_character set is_npc=true,npc_kind='creature',npc_build_mode='simple' where id=$1", [characterId]);
  const native = await actors.run(god, () => getCharacterSpecialAbilityMechanics(characterId));
  assert.equal(native.context, "native-creature-unavailable"); assert.deepEqual(native.abilities, []);
  await assert.rejects(actors.run(player, () => getCharacterSpecialAbilityMechanics(characterId)), /permission/);
});
