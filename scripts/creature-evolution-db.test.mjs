import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { after, before, mock, test } from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

assert.equal(process.env.SERRIAN_EVOLUTION_DISPOSABLE, "true");
assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_creature_evolution_dev$/);
const actors = new AsyncLocalStorage();
const god = "evolution-god", admin = "evolution-admin", player = "evolution-player", foreign = "evolution-foreign";
const session = async () => ({ user: { id: actors.getStore() ?? god } });
mock.module(pathToFileURL(path.resolve("src/lib/server-access.ts")).href, { namedExports: {
  requireSession: session, requireGod: session, requirePlayer: session,
  requireGodOrAdminAccessContext: async () => {
    const current = await session();
    const roles = (await rows("select role from user_role where user_id=$1", [current.user.id])).map(row => row.role);
    if (!roles.some(role => role === "admin" || role === "god")) throw new Error("Authoring access required.");
    return { session: current, roles };
  },
} });
mock.module("next/cache", { namedExports: { revalidatePath() {} } });
const { pool } = await import("../src/db/index.ts");
const rows = async (text, values = []) => (await pool.query(text, values)).rows;
const one = async (text, values = []) => (await rows(text, values))[0];
const actions = await import("../src/app/heavens/creatures/evolution-actions.ts");
const creatures = await import("../src/app/heavens/creatures/actions.ts");
const npcs = await import("../src/app/heavens/npcs/actions.ts");
const lifecycle = await import("../src/features/lifecycle/lifecycle-service.ts");
const health = await import("../src/features/active-state/active-health-service.ts");
const effects = await import("../src/features/active-state/active-effects-service.ts");
const { creatureDraftFixture, creatureFormFixture } = await import("./creature-form-fixture.ts");
const actor = { userId: god, roles: ["god"] };
const target = id => ({ entityKind: "creature", entityId: id });
const definition = async name => {
  const draft = creatureDraftFixture(); draft.core.canonicalName = name; draft.forms = [creatureFormFixture()];
  return creatures.saveCreature(draft);
};
const list = async id => (await actions.getCreatureEvolutions(id)).paths;
const add = async (source, destination, name = "Mature") => actions.saveEvolutionPath({ sourceCreatureId: source.id, destinationCreatureId: destination.id, name, description: "Description", notes: "Notes" });
const edit = (path, patch = {}) => actions.saveEvolutionPath({ ...path, expectedVersion: path.version, ...patch });
const remove = path => actions.removeEvolutionPath({ sourceCreatureId: path.sourceCreatureId, id: path.id, expectedVersion: path.version });
const snapshot = async () => {
  const tables = await rows("select tablename from pg_tables where schemaname='public' and tablename <> 'creature_evolution_paths' order by tablename");
  return Object.fromEntries(await Promise.all(tables.map(async ({ tablename }) => [tablename, await rows(`select to_jsonb(t) body from "${tablename}" t order by to_jsonb(t)::text`)])));
};
let young, adult, frost, ancient, individual, ownerId;
before(async () => {
  for (const [id, role] of [[god,"god"],[admin,"admin"],[player,"player"],[foreign,"god"]]) {
    await pool.query('insert into "user"(id,name,email) values($1,$1,$2)', [id, `${id}@example.invalid`]);
    await pool.query("insert into user_role(user_id,role) values($1,$2)", [id,role]);
  }
  young = await definition("Evolution Young Drake"); adult = await definition("Evolution Adult Drake");
  frost = await definition("Evolution Frost Drake"); ancient = await definition("Evolution Ancient Drake");
  const campaignId = (await one("insert into campaign(name,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,created_by_user_id) values('Evolution Campaign',100,100,50,10,100,0,'Credits','Assigned',$1) returning id", [god])).id;
  await pool.query("insert into campaign_player(campaign_id,user_id) values($1,$2)", [campaignId,player]);
  ownerId = (await one("insert into campaign_character(campaign_id,player_user_id,name) values($1,$2,'Drake owner') returning id", [campaignId,player])).id;
  individual = (await npcs.createNpc({ campaignId, origin: "creature", buildMode: "detailed", sourceId: young.id, name: "Ember", roleLabel: "Companion", notes: "Keep history", ownerCharacterId: ownerId })).characterId;
  const activeHealth = await health.getActiveHealth(individual);
  await health.applyLocalizedDamageToCharacter({ characterId: individual, amount: 7, poolKey: activeHealth.anatomy.pools[0].key, injuryName: "Bruise", injuryNotes: "Keep injury" });
  await effects.addManualCondition({ characterId: individual, name: "Limping", description: "Retain condition", duration: { kind: "until-removed" } });
  const gear = (await one("insert into items(canonical_id,name,catalog_scope,record_type,family,category,credits,price_basis) values('EVOLUTION-COLLAR','Ember collar','equipment','misc','Gear','Gear',3,'Each') returning id")).id;
  await pool.query("insert into campaign_character_item_instance(character_id,item_id,current_charges,equipment_state,unit_cost_credits) values($1,$2,0,'worn',3)", [individual,gear]);
});
after(() => pool.end());

test("author branching and multi-stage chains; edit/reorder/remove stable paths without changing any existing public rows", async () => {
  const before = await snapshot();
  const [first] = await add(young, adult, "Grow Fire");
  let paths = await add(young, frost, "Grow Frost");
  await add(adult, ancient, "Become Ancient");
  assert.equal(paths.length, 2); assert.deepEqual(paths.map(row => row.destinationCreatureId), [adult.id,frost.id]);
  assert.equal((await list(adult.id))[0].destinationCreatureId, ancient.id);
  paths = await edit(first, { name: "Become Fire", description: "Edited", notes: "Preserve identity" });
  assert.equal(paths[0].id, first.id); assert.equal(paths[0].name, "Become Fire");
  const reversed = await actions.reorderEvolutionPaths({ sourceCreatureId: young.id, paths: paths.toReversed().map(({id,version}) => ({id,version})) });
  assert.deepEqual(reversed.map(row => row.id), paths.map(row => row.id).toReversed());
  assert.deepEqual(reversed.map(row => row.sortOrder), [0,1]);
  await remove(reversed[0]);
  assert.deepEqual((await list(young.id)).map(row => row.id), [first.id]);
  assert.deepEqual(await snapshot(), before, "Creature definitions, Forms, owned NPC identity/snapshots/health/injuries/gear and every other public row unchanged");
  assert.equal((await one("select owner_character_id from campaign_character where id=$1",[individual])).owner_character_id,ownerId);
});

test("direct self Evolution, nonexistent IDs, invalid names and forged foreign path IDs fail atomically", async () => {
  await assert.rejects(add(young,young), /itself/);
  await assert.rejects(add(young,{id:2147483647}), /no longer exists/);
  await assert.rejects(add(young,adult," "), /name is required/);
  const [path] = await list(young.id);
  await assert.rejects(edit(path,{sourceCreatureId:frost.id}), /changed or was removed/);
  await assert.rejects(actions.removeEvolutionPath({sourceCreatureId:frost.id,id:path.id,expectedVersion:path.version}), /changed or was removed/);
  await assert.rejects(pool.query("insert into creature_evolution_paths(source_creature_id,destination_creature_id,name) values($1,$1,'Self')",[young.id]), /creature_evolution_not_self/);
  await assert.rejects(pool.query("insert into creature_evolution_paths(source_creature_id,destination_creature_id,name) values($1,2147483647,'Missing')",[young.id]), /foreign key/);
});

test("stale edits/removals/reorders and simultaneous edits cannot overwrite another author's changes", async () => {
  const [path] = await list(young.id);
  const outcomes = await Promise.allSettled([edit(path,{notes:"First"}),edit(path,{notes:"Second"})]);
  assert.equal(outcomes.filter(row=>row.status==="fulfilled").length,1);
  await assert.rejects(remove(path), /changed or was removed/);
  await assert.rejects(actions.reorderEvolutionPaths({sourceCreatureId:young.id,paths:[{id:path.id,version:path.version}]}), /changed or was removed/);
  await assert.rejects(actions.reorderEvolutionPaths({sourceCreatureId:young.id,paths:[]}), /list changed/);
});

test("variants copy authored paths independently with fresh IDs, unchanged destinations, no dynamic inheritance or Forms inference", async () => {
  const source = await definition("Evolution Clone Source");
  const before = await creatures.createDerivedCreature(source.id,"Evolution Early Variant");
  assert.deepEqual(await list(source.id),[]); assert.deepEqual(await list(before.id),[]);
  await add(source,adult); const [original] = await list(source.id);
  assert.deepEqual(await list(before.id),[],"parent edits do not create inherited paths");
  const copy = await creatures.createDerivedCreature(source.id,"Evolution Copied Variant");
  const [copied] = await list(copy.id);
  assert.notEqual(copied.id,original.id); assert.equal(copied.destinationCreatureId,adult.id); assert.equal(copied.sourceCreatureId,copy.id);
  assert.equal(copy.forms.length,source.forms.length);
  const formsBefore = (await creatures.getCreature(copy.id)).forms;
  await edit(copied,{name:"Independent"});
  assert.equal((await list(source.id))[0].name,original.name);
  assert.deepEqual((await creatures.getCreature(copy.id)).forms,formsBefore);
  await add(source,ancient,"Later branch"); assert.equal((await list(copy.id)).length,1);
  const exactDestination = await creatures.createDerivedCreature(adult.id,"Evolution Destination Variant");
  const paths = await add(source,exactDestination,"Exact variant");
  const exact = paths.find(row=>row.name==="Exact variant");
  assert.equal(exact.destinationCreatureId,exactDestination.id); assert.equal(exact.destination.parentCreatureId,adult.id);
  assert.equal((await list(exactDestination.id))[0].destinationCreatureId,ancient.id,"destination variant retains its own copied authoring");
});

test("archived targets are excluded from discovery/new selection while retained paths can be read, edited, cloned and restored", async () => {
  const source = await definition("Evolution Archive Source"), destination = await definition("Evolution Archive Target");
  await add(source,destination);
  await lifecycle.archiveLifecycleEntityForActor(target(destination.id),actor,"Retain relationship");
  assert.equal((await actions.searchEvolutionDestinations(source.id,"Evolution Archive Target")).length,0);
  await assert.rejects(add(frost,destination), /Archived Creatures/);
  const [path] = await list(source.id); assert.equal(path.destination.archived,true);
  await edit(path,{notes:"Still editable"});
  const copy = await creatures.createDerivedCreature(source.id,"Evolution Archived Reference Copy");
  assert.equal((await list(copy.id))[0].destinationCreatureId,destination.id);
  await lifecycle.archiveLifecycleEntityForActor(target(source.id),actor);
  assert.equal((await actions.getCreatureEvolutions(source.id)).canEdit,false);
  assert.equal((await list(source.id)).length,1);
  await assert.rejects(add(source,adult), /Restore/);
  await lifecycle.restoreLifecycleEntityForActor(target(source.id),actor);
  await lifecycle.restoreLifecycleEntityForActor(target(destination.id),actor);
  assert.equal((await list(source.id))[0].destination.archived,false);
});

test("lifecycle preview and FK block incoming reference deletion; explicit source deletion lists and removes owned paths only", async () => {
  const source = await definition("Evolution Deletable Source"), destination = await definition("Evolution Protected Target");
  await add(source,destination);
  const preview = await lifecycle.previewLifecycleEntityForActor(target(destination.id),actor);
  assert.ok(preview.dependencies.some(row=>row.label==="Incoming Evolution paths" && row.blocking && row.count===1));
  await assert.rejects(lifecycle.permanentlyDeleteLifecycleEntityForActor(target(destination.id),actor), /Incoming Evolution/);
  await assert.rejects(pool.query("delete from creatures where id=$1",[destination.id]), /foreign key/);
  const sourcePreview = await lifecycle.previewLifecycleEntityForActor(target(source.id),actor);
  assert.ok(sourcePreview.dependencies.some(row=>row.label==="Authored outgoing Evolution paths" && !row.blocking && row.count===1));
  await lifecycle.permanentlyDeleteLifecycleEntityForActor(target(source.id),actor);
  assert.deepEqual(await rows("select id from creature_evolution_paths where source_creature_id=$1",[source.id]),[]);
  assert.ok(await creatures.getCreature(destination.id));
});

test("owning a Creature does not authorize authoring; source creator/admin permissions apply to every mutation", async () => {
  const [path] = await list(young.id);
  for (const user of [player,foreign]) {
    await assert.rejects(actors.run(user,()=>add(young,adult)), /access required|creator or an administrator/);
    await assert.rejects(actors.run(user,()=>edit(path,{name:"Denied"})), /access required|creator or an administrator/);
    await assert.rejects(actors.run(user,()=>remove(path)), /access required|creator or an administrator/);
    await assert.rejects(actors.run(user,()=>actions.reorderEvolutionPaths({sourceCreatureId:young.id,paths:[{id:path.id,version:path.version}]})), /access required|creator or an administrator/);
  }
  await assert.rejects(actors.run(player,()=>actions.getCreatureEvolutions(young.id)), /access required/);
  await assert.rejects(actors.run(player,()=>actions.searchEvolutionDestinations(young.id,"")), /access required/);
  await actors.run(admin,()=>edit(path,{notes:"Administrator edit"}));
  const imported = await definition("Evolution Imported Source");
  await pool.query("update creatures set created_by_user_id=null,source_system='canon' where id=$1",[imported.id]);
  await assert.rejects(actors.run(admin,()=>add(imported,adult)), /Only a G.O.D./);
  await add(imported,adult);
});

test("catalog visibility gates new destinations server-side but retains hidden saved references", async () => {
  const hidden = await actors.run(foreign,()=>definition("Evolution Hidden Target"));
  const source = await definition("Evolution Visibility Source");
  await add(source,hidden);
  await pool.query("insert into catalog_visibility_scope_activation(catalog_key,activated_by_user_id,activation_method) values('creature',$1,'manual')",[admin]);
  assert.equal((await actions.searchEvolutionDestinations(source.id,"Evolution Hidden Target")).length,0);
  await assert.rejects(add(frost,hidden), /catalog view/);
  const [path] = await list(source.id); assert.equal(path.destination.canonicalName,hidden.core.canonicalName);
  await edit(path,{notes:"Retained hidden reference"});
  assert.equal((await list(source.id))[0].id,path.id);
  await pool.query("delete from catalog_visibility_scope_activation where catalog_key='creature'");
});

test("ordinary Creature saves preserve Evolution IDs and path data independently", async () => {
  const before = await list(young.id);
  const draft = await creatures.getCreature(young.id); draft.core.notes="Ordinary definition edit";
  await creatures.saveCreature(draft);
  assert.deepEqual(await list(young.id),before);
});
