import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { after, before, mock, test } from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.SERRIAN_DISPOSABLE_RACE_AUTHORING !== "true" || !/^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_race_authoring_dev$/.test(process.env.DATABASE_URL ?? "")) throw new Error("Use the disposable Race authoring harness.");
const actors = new AsyncLocalStorage();
const actor = { userId: "forms-god", roles: ["god"] };
mock.module(pathToFileURL(path.resolve("src/lib/server-access.ts")).href, { namedExports: {
  requireGodOrAdminAccessContext: async () => ({ session: { user: { id: actors.getStore() ?? actor.userId } }, roles: ["god"] }),
} });
mock.module("next/cache", { namedExports: { revalidatePath() {} } });
const { pool } = await import("../src/db/index.ts");
const { getRace, saveRace, createRaceVariant } = await import("../src/app/heavens/races/actions.ts");
const { emptyRaceForm } = await import("../src/features/races/race-forms.ts");
const { emptyRaceNaturalAttack } = await import("../src/features/races/race-natural-attacks.ts");
const { createHumanoidRaceAnatomy } = await import("../src/features/races/race-anatomy.ts");
const lifecycle = await import("../src/features/lifecycle/lifecycle-service.ts");
const rows = async (sql, args = []) => (await pool.query(sql, args)).rows;
const stored = id => rows("select * from race_forms where race_id=$1 order by sort_order,id", [id]);
const form = (key = "wolf") => ({ ...emptyRaceForm(key), name: `${key} Form`, description: `Description of ${key}\nSecond paragraph.`, notes: `Notes for ${key}` });
const definitions = forms => forms.map(({ key, name, description, notes, sortOrder }) => ({ key, name, description, notes, sortOrder }));
before(async () => {
  for (const id of [actor.userId, "forms-other"]) {
    await pool.query('insert into "user"(id,name,email) values($1,$1,$2)', [id, `${id}@example.invalid`]);
    await pool.query("insert into user_role(user_id,role) values($1,'god')", [id]);
  }
});
after(() => pool.end());
async function fixture(name = "Forms Fixture") {
  const [row] = await rows("insert into races(name,size,created_by_user_id) values($1,'Medium',$2) returning id", [name, actor.userId]);
  return getRace(row.id);
}

test("existing and new Races start with zero Forms, including names associated with shifting", async () => {
  const draft = await fixture("Shift-Folk");
  assert.deepEqual(draft.forms, []);
  const oldDraft = { ...draft }; delete oldDraft.forms;
  assert.deepEqual((await saveRace(oldDraft)).forms, []);
  assert.deepEqual((await saveRace({ ...oldDraft, id: undefined, core: { ...draft.core, name: "New zero-Form Race" } })).forms, []);
});

test("any Race may author one Form; saved reads expose exact Race ownership and stable database ID", async () => {
  const draft = await fixture("Human"), saved = await saveRace({ ...draft, forms: [form()] });
  assert.deepEqual(definitions(saved.forms), [form()]);
  assert.equal(saved.forms[0].raceId, draft.id);
  assert.ok(saved.forms[0].id > 0);
  assert.deepEqual((await getRace(draft.id)).forms, saved.forms);
});

test("20 Forms save, reload and reorder with every database identity retained", async () => {
  const draft = await fixture();
  const forms = Array.from({ length: 20 }, (_, index) => form(`state-${index}`));
  const saved = await saveRace({ ...draft, forms });
  assert.deepEqual(definitions(saved.forms), forms.map((row, sortOrder) => ({ ...row, sortOrder })));
  assert.deepEqual((await getRace(draft.id)).forms, saved.forms);
  const reversed = await saveRace({ ...saved, forms: [...saved.forms].reverse() });
  assert.deepEqual(reversed.forms, [...saved.forms].reverse().map((row, sortOrder) => ({ ...row, sortOrder })));
  assert.deepEqual((await getRace(draft.id)).forms, reversed.forms);
});

test("editing and removing one Form preserve all surviving IDs; old callers retain Forms", async () => {
  const draft = await fixture(), saved = await saveRace({ ...draft, forms: [form(), form("mist"), form("winged")] });
  const updated = await saveRace({ ...saved, forms: [{ ...saved.forms[0], name: "Renamed", description: "Changed", notes: "Revised" }, saved.forms[2]] });
  assert.deepEqual(updated.forms.map(row => row.id), [saved.forms[0].id, saved.forms[2].id]);
  assert.deepEqual(updated.forms.map(row => row.sortOrder), [0, 1]);
  assert.deepEqual(updated.forms[0], { ...saved.forms[0], name: "Renamed", description: "Changed", notes: "Revised" });
  const oldDraft = { ...updated }; delete oldDraft.forms;
  assert.deepEqual((await saveRace(oldDraft)).forms, updated.forms);
  assert.deepEqual((await saveRace({ ...updated, forms: [] })).forms, []);
});

test("invalid keys, duplicate keys, malformed fields and blank names roll back the entire save", async () => {
  const draft = await fixture(), saved = await saveRace({ ...draft, forms: [form()] });
  const before = await stored(draft.id);
  for (const forms of [[form(), form()], [{ ...form(), key: " " }], [{ ...form(), key: 4 }], [{ ...form(), name: " " }], [{ ...form(), description: null }], [null], null, {}]) {
    await assert.rejects(saveRace({ ...saved, core: { ...saved.core, name: "Must roll back" }, forms }));
    assert.deepEqual(await stored(draft.id), before);
    assert.equal((await getRace(draft.id)).core.name, saved.core.name);
  }
  await assert.rejects(saveRace({ ...draft, id: undefined, core: { ...draft.core, name: "Invalid new Forms Race" }, forms: [form(), form()] }), /unique/);
  assert.deepEqual(await rows("select id from races where name='Invalid new Forms Race'"), []);
});

test("database enforces owner, local identity, nonblank name and ordering constraints", async () => {
  const draft = await fixture();
  await pool.query("insert into race_forms(race_id,key,name,sort_order) values($1,'wolf','Wolf',0)", [draft.id]);
  for (const [raceId, key, name, order] of [[draft.id, "wolf", "Duplicate", 1], [draft.id, "", "Name", 1], [draft.id, "blank", " ", 1], [draft.id, "negative", "Name", -1], [2147483647, "owner", "Name", 0]]) {
    await assert.rejects(pool.query("insert into race_forms(race_id,key,name,sort_order) values($1,$2,$3,$4)", [raceId, key, name, order]), /constraint|foreign key|duplicate/i);
  }
});

test("variant cloning preserves definitions/order with fresh IDs and independent edits in both directions", async () => {
  const draft = await fixture(), saved = await saveRace({ ...draft, forms: [form(), form("mist"), form("winged")] });
  const variant = await createRaceVariant(saved.id, "Forms Variant");
  assert.deepEqual(definitions(variant.forms), definitions(saved.forms));
  assert.ok(variant.forms.every(row => row.raceId === variant.id && !saved.forms.some(parent => parent.id === row.id)));
  const changed = await saveRace({ ...variant, forms: [{ ...variant.forms[2], notes: "Variant note" }, variant.forms[0]] });
  assert.deepEqual((await getRace(saved.id)).forms, saved.forms);
  await saveRace({ ...saved, forms: [{ ...saved.forms[1], name: "Parent mist renamed" }] });
  assert.deepEqual((await getRace(variant.id)).forms, changed.forms);
});

test("keys are Race-local and client-supplied IDs cannot move or edit another Race's Form", async () => {
  const parent = await saveRace({ ...await fixture(), forms: [form()] });
  const other = await saveRace({ ...await fixture(), forms: [{ ...parent.forms[0], notes: "Other owner" }] });
  assert.equal(other.forms[0].raceId, other.id);
  assert.notEqual(other.forms[0].id, parent.forms[0].id);
  assert.deepEqual((await getRace(parent.id)).forms, parent.forms);
});

test("Natural Attacks and Anatomy survive Form saves and clone independently alongside Forms", async () => {
  const draft = await fixture(), anatomy = createHumanoidRaceAnatomy();
  const attack = { ...emptyRaceNaturalAttack("bite"), attackName: "Bite", damage: "4", anatomy: { hpPoolIds: [anatomy.hpPools[0].canonicalId], hitLocationNumbers: [0], notes: "Jaw required" } };
  const saved = await saveRace({ ...draft, core: { ...draft.core, anatomy }, naturalAttacks: [attack], forms: [form()] });
  const beforeAttacks = await rows("select * from race_natural_attacks where race_id=$1", [draft.id]);
  const changed = await saveRace({ ...saved, forms: [form("mist"), ...saved.forms] });
  assert.deepEqual(changed.naturalAttacks, saved.naturalAttacks);
  assert.deepEqual(changed.core.anatomy, saved.core.anatomy);
  assert.deepEqual(await rows("select * from race_natural_attacks where race_id=$1", [draft.id]), beforeAttacks);
  const variant = await createRaceVariant(draft.id, "Forms and Attacks Variant");
  assert.deepEqual(variant.naturalAttacks, saved.naturalAttacks);
  assert.deepEqual(variant.core.anatomy, saved.core.anatomy);
  assert.deepEqual(definitions(variant.forms), definitions(changed.forms));
  const clonedAttacks = await rows("select * from race_natural_attacks where race_id=$1", [variant.id]);
  assert.notEqual(clonedAttacks[0].id, beforeAttacks[0].id);
  assert.deepEqual({ ...clonedAttacks[0], id: 0, race_id: 0 }, { ...beforeAttacks[0], id: 0, race_id: 0 });
});

test("archive/restore preserve Forms exactly; eligible Race deletion cascades Forms with no independent archive", async () => {
  const saved = await saveRace({ ...await fixture(), forms: [form(), form("mist")] });
  const target = { entityKind: "race", entityId: saved.id }, before = await stored(saved.id);
  await assert.rejects(actors.run("forms-other", () => saveRace({ ...saved, forms: [] })), /access|owner|creator|author/i);
  await lifecycle.archiveLifecycleEntityForActor(target, actor, "Forms regression");
  assert.deepEqual(await stored(saved.id), before);
  assert.deepEqual((await getRace(saved.id)).forms, saved.forms);
  await assert.rejects(saveRace(saved), /Restore/);
  await lifecycle.restoreLifecycleEntityForActor(target, actor);
  assert.deepEqual(await stored(saved.id), before);
  const preview = await lifecycle.previewLifecycleEntityForActor(target, actor);
  assert.equal(preview.canDelete, true);
  assert.ok(preview.dependencies.some(row => row.label === "Race Forms" && row.count === 2 && !row.blocking));
  await lifecycle.permanentlyDeleteLifecycleEntityForActor(target, actor);
  assert.deepEqual(await stored(saved.id), []);
});
