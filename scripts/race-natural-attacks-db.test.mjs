import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { after, before, mock, test } from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.SERRIAN_DISPOSABLE_RACE_AUTHORING !== "true" || !/^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_race_authoring_dev$/.test(process.env.DATABASE_URL ?? "")) throw new Error("Use the disposable Race authoring harness.");
const actors = new AsyncLocalStorage();
const actor = { userId: "natural-attack-god", roles: ["god"] };
mock.module(pathToFileURL(path.resolve("src/lib/server-access.ts")).href, { namedExports: {
  requireGodOrAdminAccessContext: async () => ({ session: { user: { id: actors.getStore() ?? actor.userId } }, roles: ["god"] }),
} });
mock.module("next/cache", { namedExports: { revalidatePath() {} } });
const { pool } = await import("../src/db/index.ts");
const { getRace, saveRace, createRaceVariant, listNaturalAttackSkillCandidates } = await import("../src/app/heavens/races/actions.ts");
const { emptyRaceNaturalAttack } = await import("../src/features/races/race-natural-attacks.ts");
const { createHumanoidRaceAnatomy } = await import("../src/features/races/race-anatomy.ts");
const { createEmptySpell } = await import("../src/features/spell-construction/utilities/spellFactory.ts");
const { normalizeAttackAuthoring } = await import("../src/features/attacks/attack-authoring.ts");
const lifecycle = await import("../src/features/lifecycle/lifecycle-service.ts");
const rows = async (sql, args = []) => (await pool.query(sql, args)).rows;
const stored = id => rows("select * from race_natural_attacks where race_id=$1 order by sort_order,id", [id]);
before(async () => {
  for (const id of [actor.userId, "natural-attack-other"]) {
    await pool.query('insert into "user"(id,name,email) values($1,$1,$2)', [id, `${id}@example.invalid`]);
    await pool.query("insert into user_role(user_id,role) values($1,'god')", [id]);
  }
});
after(() => pool.end());
async function fixture() {
  const [row] = await rows("insert into races(name,size,base_magic,created_by_user_id) values('Natural Attack Fixture','Medium',99,$1) returning id", [actor.userId]);
  const [skill] = await rows("insert into skill(name,classification,tier) values('Natural Attack Skill','standard',3) returning id");
  return { draft: await getRace(row.id), skillId: skill.id };
}
function attack(key = "bite", mode = "melee") {
  const row = { ...emptyRaceNaturalAttack(key), attackName: key === "bite" ? "Bite" : key, damage: "4", damageType: "Piercing", notes: "Inherent attack" };
  row.authoring = { ...row.authoring, mode, initiativeCost: 3, range: { unit: "feet", reach: mode === "melee" || mode === "hybrid" ? 2 : null, short: mode === "melee" ? null : 10, medium: mode === "melee" ? null : 20, long: mode === "melee" ? null : 30 } };
  return row;
}

test("old and new Races with zero attacks save/reload without inferring attacks from Base Magic", async () => {
  const { draft } = await fixture();
  assert.deepEqual(draft.naturalAttacks, []);
  const oldDraft = { ...draft }; delete oldDraft.naturalAttacks;
  assert.deepEqual((await saveRace(oldDraft)).naturalAttacks, []);
  assert.deepEqual((await saveRace({ ...draft, id: undefined, core: { ...draft.core, name: "New zero-attack Race" } })).naturalAttacks, []);
});

test("one melee attack round-trips exact values, Skill basis and anatomical dependencies", async () => {
  const { draft, skillId } = await fixture(), definition = attack();
  definition.skillId = skillId;
  definition.basisNotes = "Use the Character's authored Skill basis.";
  const body = createHumanoidRaceAnatomy();
  definition.anatomy = { hpPoolIds: [body.hpPools[0].canonicalId], hitLocationNumbers: [0], notes: "Requires a functional mouth and jaw." };
  const saved = await saveRace({ ...draft, naturalAttacks: [definition] });
  assert.deepEqual(saved.naturalAttacks, [{ ...definition, skillName: "Natural Attack Skill" }]);
  assert.deepEqual((await getRace(draft.id)).naturalAttacks, saved.naturalAttacks);
  assert.equal((await stored(draft.id))[0].skill_id, skillId);
  assert.deepEqual(saved.skillLinks, [], "Attack basis does not grant a Skill");
  assert.ok((await listNaturalAttackSkillCandidates("Natural Attack Skill")).some(row => row.id === skillId && row.tier === 3));
});

test("multiple melee/ranged/hybrid/AoE attacks preserve order and Yes/No/Unspecified independently", async () => {
  const { draft } = await fixture();
  const attacks = [attack("breath", "aoe"), attack(), attack("spines", "ranged"), attack("tail", "hybrid")];
  attacks.forEach((row, index) => { row.authoring.magical = [true, false, null, null][index]; row.sortOrder = 99; });
  const saved = await saveRace({ ...draft, naturalAttacks: attacks });
  assert.deepEqual(saved.naturalAttacks.map(row => [row.key, row.sortOrder, row.authoring.magical]), [["breath", 0, true], ["bite", 1, false], ["spines", 2, null], ["tail", 3, null]]);
  assert.deepEqual(saved.naturalAttacks[2].authoring.range, attacks[2].authoring.range);
  assert.deepEqual((await getRace(draft.id)).naturalAttacks, saved.naturalAttacks);
});

test("ordered on-hit effects and optional shared Magic construction round-trip without a new effect format", async () => {
  const { draft } = await fixture(), definition = attack("breath", "aoe");
  definition.authoring.magical = true;
  definition.authoring.magic = { document: createEmptySpell() };
  definition.authoring.onHitEffects = [
    { effectKey: "burn", schemaVersion: 2, sortOrder: 0, effect: { kind: "condition.apply", name: "Burning", description: "Authored burning", duration: { kind: "scene", value: null } } },
    { effectKey: "manual", schemaVersion: 2, sortOrder: 1, effect: { kind: "manual", title: "Heat", description: "G.O.D. resolves heat." } },
  ];
  const saved = await saveRace({ ...draft, naturalAttacks: [definition] });
  assert.deepEqual(saved.naturalAttacks[0].authoring, JSON.parse(JSON.stringify(normalizeAttackAuthoring(definition.authoring))));
});

test("invalid attacks and unknown Skill/anatomy references roll back the entire Race save", async () => {
  const { draft } = await fixture();
  const saved = await saveRace({ ...draft, naturalAttacks: [attack()] }), before = await stored(draft.id);
  const invalid = [
    { ...attack(), attackName: "" }, { ...attack(), skillId: 2147483647 },
    { ...attack(), authoring: { ...attack().authoring, initiativeCost: 0 } },
    { ...attack(), authoring: { ...attack().authoring, range: { unit: null, reach: 2, short: null, medium: null, long: null } } },
    { ...attack(), anatomy: { hpPoolIds: ["missing"], hitLocationNumbers: [], notes: "" } },
    { ...attack(), authoring: { ...attack().authoring, magical: "yes" } },
  ];
  for (const definition of invalid) {
    await assert.rejects(saveRace({ ...saved, core: { ...saved.core, name: "Must roll back" }, naturalAttacks: [definition] }));
    assert.equal((await getRace(draft.id)).core.name, saved.core.name);
    assert.deepEqual(await stored(draft.id), before);
  }
  await assert.rejects(saveRace({ ...saved, naturalAttacks: [attack(), attack()] }), /unique/);
});

test("edit, reorder and remove preserve surviving row identities; old callers preserve authored attacks", async () => {
  const { draft } = await fixture();
  const saved = await saveRace({ ...draft, naturalAttacks: [attack(), attack("claws"), attack("tail")] });
  const before = await stored(draft.id), reordered = [saved.naturalAttacks[2], { ...saved.naturalAttacks[0], damage: "9" }];
  const updated = await saveRace({ ...saved, naturalAttacks: reordered });
  assert.deepEqual((await stored(draft.id)).map(row => row.id), [before[2].id, before[0].id]);
  assert.equal(updated.naturalAttacks[1].damage, "9");
  const oldDraft = { ...updated }; delete oldDraft.naturalAttacks;
  assert.deepEqual((await saveRace(oldDraft)).naturalAttacks, updated.naturalAttacks);
  assert.deepEqual((await saveRace({ ...updated, naturalAttacks: [] })).naturalAttacks, []);
});

test("Anatomy edits cannot orphan requirements; renaming a pool preserves its identity", async () => {
  const { draft } = await fixture(), body = createHumanoidRaceAnatomy(), definition = attack("tail");
  body.hpPools.push({ canonicalId: "tail", poolName: "Tail", hpPercentage: 20, notes: "", sortOrder: body.hpPools.length });
  body.hitLocations[0] = { ...body.hitLocations[0], hpPoolCanonicalId: "tail", locationName: "Tail" };
  definition.anatomy = { hpPoolIds: ["tail"], hitLocationNumbers: [0], notes: "A functional tail" };
  const saved = await saveRace({ ...draft, core: { ...draft.core, anatomy: body }, naturalAttacks: [definition] });
  const oldDraft = { ...saved }; delete oldDraft.naturalAttacks;
  await assert.rejects(saveRace({ ...oldDraft, core: { ...saved.core, anatomy: null } }), /HP Pools/);
  body.hpPools.at(-1).poolName = "Long Tail";
  const renamed = await saveRace({ ...saved, core: { ...saved.core, anatomy: body } });
  assert.deepEqual(renamed.naturalAttacks, saved.naturalAttacks);
});

test("Clone as Variant copies fresh owned rows and all definitions; edits and removals are independent", async () => {
  const { draft, skillId } = await fixture(), definition = attack(); definition.skillId = skillId;
  const saved = await saveRace({ ...draft, naturalAttacks: [definition, attack("spines", "ranged")] });
  const variant = await createRaceVariant(saved.id, "Natural Attack Variant");
  assert.deepEqual(variant.naturalAttacks, saved.naturalAttacks);
  const parentRows = await stored(saved.id), variantRows = await stored(variant.id);
  for (const [index, row] of variantRows.entries()) {
    assert.notEqual(row.id, parentRows[index].id); assert.equal(row.race_id, variant.id);
    assert.deepEqual({ ...row, id: 0, race_id: 0 }, { ...parentRows[index], id: 0, race_id: 0 });
  }
  await saveRace({ ...variant, naturalAttacks: [{ ...variant.naturalAttacks[0], damage: "11" }] });
  assert.deepEqual((await getRace(saved.id)).naturalAttacks, saved.naturalAttacks);
  await saveRace({ ...saved, naturalAttacks: [] });
  assert.equal((await getRace(variant.id)).naturalAttacks[0].damage, "11");
});

test("archived Skill references survive existing saves and variant cloning; new assignments reject them", async () => {
  const { draft, skillId } = await fixture(), definition = attack(); definition.skillId = skillId;
  const saved = await saveRace({ ...draft, naturalAttacks: [definition] });
  await pool.query("update skill set archived_at=now() where id=$1", [skillId]);
  assert.deepEqual((await saveRace(saved)).naturalAttacks, saved.naturalAttacks);
  const clone = await createRaceVariant(saved.id, "Archived Skill Attack Variant");
  assert.deepEqual((await saveRace(clone)).naturalAttacks, saved.naturalAttacks);
  await assert.rejects(saveRace({ ...saved, naturalAttacks: [...saved.naturalAttacks, { ...definition, key: "new" }] }), /Archived Skills/);
  const preview = await lifecycle.previewLifecycleEntityForActor({ entityKind: "skill", entityId: skillId }, actor);
  assert.ok(preview.dependencies.some(row => row.label === "Race Natural Attack Skill bases" && row.count === 2));
  assert.equal(preview.canDelete, false);
});

test("Race archive/restore preserve definitions; eligible permanent deletion cascades them; foreign authors cannot edit", async () => {
  const { draft } = await fixture(), saved = await saveRace({ ...draft, naturalAttacks: [attack()] });
  const target = { entityKind: "race", entityId: saved.id }, before = await stored(saved.id);
  await assert.rejects(actors.run("natural-attack-other", () => saveRace({ ...saved, naturalAttacks: [] })), /access|owner|creator|author/i);
  await lifecycle.archiveLifecycleEntityForActor(target, actor, "Natural Attack regression");
  assert.deepEqual(await stored(saved.id), before);
  await assert.rejects(saveRace(saved), /Restore/);
  await lifecycle.restoreLifecycleEntityForActor(target, actor);
  assert.deepEqual(await stored(saved.id), before);
  const preview = await lifecycle.previewLifecycleEntityForActor(target, actor);
  assert.equal(preview.canDelete, true);
  assert.ok(preview.dependencies.some(row => row.label === "Race Natural Attacks" && row.count === 1 && !row.blocking));
  await lifecycle.permanentlyDeleteLifecycleEntityForActor(target, actor);
  assert.deepEqual(await stored(saved.id), []);
});
