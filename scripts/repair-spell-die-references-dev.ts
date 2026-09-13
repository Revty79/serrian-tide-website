import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

type Repair = {
  id: number;
  skillId: number;
  name: string;
  field?: "modifier-description";
  replacements: [string, string][];
};

// Explicit catalog edits, not a general conversion rule for Serrian Tide dice.
export const repairs: Repair[] = [
  { id: 13, skillId: 766, name: "Annihilation Field", replacements: [["Backlash: caster takes 2d6 psychic damage if concentration breaks.", "Backlash: caster takes 8 damage if concentration breaks."]] },
  { id: 33, skillId: 778, name: "Astral Step", replacements: [["1d4 vitality damage", "3 damage"]] },
  { id: 197, skillId: 781, name: "Eclipse of Eternity", replacements: [["2d6 vitality backlash", "8 backlash damage"]] },
  { id: 229, skillId: 884, name: "Eternal Citadel", replacements: [["1d4 days", "3 days"], ["2d6 psychic backlash damage", "8 backlash damage"]] },
  { id: 247, skillId: 871, name: "Eyes Beyond Time", replacements: [["3d6 psychic damage", "11 damage"]] },
  { id: 279, skillId: 867, name: "Foresight Step", replacements: [["1d4 initiative", "3 Initiative"]] },
  { id: 283, skillId: 1050, name: "Fracture of the Infinite", replacements: [["1d2 sonic", "2 damage"]] },
  { id: 291, skillId: 833, name: "Genesis Metamorphosis", field: "modifier-description", replacements: [["1d6 damage", "4 damage"]] },
  { id: 293, skillId: 923, name: "Genesis Renewal", replacements: [["2d6 psychic backlash damage", "8 backlash damage"]] },
  { id: 295, skillId: 820, name: "Genesis Transmutation", replacements: [["1d10% of max HP", "6% of max HP"]] },
  { id: 423, skillId: 741, name: "Nightmare Menagerie", replacements: [["1d4 steps", "3 steps"]] },
  { id: 433, skillId: 768, name: "Oblivion Veil", replacements: [["5d6 psychic damage", "18 damage"]] },
  { id: 497, skillId: 883, name: "Reality Bastion", replacements: [["1d6 mental fatigue damage", "4 damage"]] },
  { id: 499, skillId: 767, name: "Reflective Maelstrom", replacements: [["1d6 damage", "4 damage"]] },
  { id: 591, skillId: 761, name: "Spell Shatter", replacements: [["1d4 backlash damage", "3 backlash damage"]] },
  { id: 661, skillId: 869, name: "Threads of Destiny", replacements: [["1d6 self damage", "4 self damage"]] },
  { id: 711, skillId: 866, name: "Web of Insight", replacements: [["1d4 damage", "3 damage"]] },
];

export function repairDocument(dataJson: string, repair: Repair) {
  const document = JSON.parse(dataJson);
  let holder = document;
  const field = repair.field ? "description" : "notes";
  if (repair.field) {
    assert.ok(Array.isArray(document.modifiers) && document.modifiers.length > 0, `${repair.name}: missing modifier`);
    holder = document.modifiers[0];
  }
  assert.equal(typeof holder[field], "string", `${repair.name}: missing text`);
  const before: string = holder[field];
  let after = before;
  for (const [oldText, newText] of repair.replacements) {
    const occurrences = after.split(oldText).length - 1;
    if (occurrences === 0) {
      assert.equal(after.split(newText).length - 1, 1, `${repair.name}: text changed since review`);
      continue;
    }
    assert.equal(occurrences, 1, `${repair.name}: ambiguous replacement`);
    after = after.replace(oldText, newText);
  }
  holder[field] = after;
  return { before, after, dataJson: before === after ? dataJson : JSON.stringify(document) };
}

async function main() {
  const mode = process.argv[2];
  assert.ok(mode === "--plan" || mode === "--apply", "Use --plan or --apply.");
  dotenv.config({ path: ".env.local", quiet: true });
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && (url.port || "5432") === "5432" && url.pathname === "/serrian_tide_dev", "Only local serrian_tide_dev on port 5432 is supported.");
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  let transactionOpen = false;
  try {
    const target = (await client.query("select current_database() as database,host(inet_server_addr()) as address,inet_server_port() as port")).rows[0];
    assert.ok(target.database === "serrian_tide_dev" && ["127.0.0.1", "::1"].includes(target.address) && target.port === 5432);
    await client.query(mode === "--apply" ? "begin" : "begin isolation level repeatable read read only");
    transactionOpen = true;
    await client.query("set local lock_timeout='5s'");
    await client.query("set local statement_timeout='30s'");
    if (mode === "--apply") {
      await client.query("lock table skill in share mode");
      await client.query("lock table skill_extension in share row exclusive mode");
    }
    const readExtensions = async () => (await client.query("select * from skill_extension order by id")).rows;
    const before = await readExtensions();
    const skills = (await client.query("select id,name,archived_at from skill where id=any($1::int[])", [repairs.map((repair) => repair.skillId)])).rows;
    const plan = repairs.map((repair) => {
      const row = before.find((candidate) => candidate.id === repair.id);
      const skill = skills.find((candidate) => candidate.id === repair.skillId);
      assert.ok(row && skill, `${repair.name}: catalog row missing`);
      assert.equal(row.skill_id, repair.skillId);
      assert.equal(row.extension_type, "spell-construction");
      assert.equal(skill.name, repair.name);
      assert.equal(skill.archived_at, null);
      return { repair, row, ...repairDocument(row.data_json, repair) };
    });
    const changes = plan.filter((entry) => entry.dataJson !== entry.row.data_json);
    const summary = changes.map(({ repair, before, after }) => ({ extensionId: repair.id, skillId: repair.skillId, name: repair.name, field: repair.field ? "modifiers[0].description" : "notes", before, after }));
    if (mode === "--plan" || changes.length === 0) {
      await client.query("rollback");
      transactionOpen = false;
      console.log(JSON.stringify({ target, changedSpells: changes.length, changes: summary }, null, 2));
      return;
    }
    const directory = await mkdtemp(path.join(os.tmpdir(), "serrian-spell-die-reference-repair-"));
    const backupPath = path.join(directory, "before.json");
    await writeFile(backupPath, JSON.stringify({ target, capturedAt: new Date().toISOString(), rows: changes.map((entry) => entry.row) }, null, 2) + "\n", { flag: "wx" });
    const expected = new Map<number, string>();
    for (const change of changes) {
      const result = await client.query("update skill_extension set data_json=$1,updated_at=now() where id=$2 and skill_id=$3 and extension_type='spell-construction' and data_json=$4", [change.dataJson, change.repair.id, change.repair.skillId, change.row.data_json]);
      assert.equal(result.rowCount, 1);
      expected.set(change.repair.id, change.dataJson);
    }
    const after = await readExtensions();
    assert.equal(after.length, before.length);
    for (let index = 0; index < before.length; index++) {
      const original = before[index];
      const saved = after[index];
      const expectedJson = expected.get(original.id);
      if (expectedJson === undefined) {
        assert.deepEqual(saved, original, `Unrelated extension ${original.id} changed`);
      } else {
        assert.equal(saved.data_json, expectedJson);
        assert.deepEqual({ ...saved, data_json: original.data_json, updated_at: original.updated_at }, original);
      }
    }
    for (const { repair } of plan) {
      const row = after.find((candidate) => candidate.id === repair.id)!;
      assert.equal(repairDocument(row.data_json, repair).dataJson, row.data_json, "Repair must be idempotent");
    }
    await client.query("commit");
    transactionOpen = false;
    for (const [id, expectedJson] of expected) {
      const persisted = (await client.query("select data_json from skill_extension where id=$1", [id])).rows[0];
      assert.equal(persisted.data_json, expectedJson, `Post-commit verification failed for ${id}`);
    }
    const receipt = { target, committedAt: new Date().toISOString(), changedSpells: changes.length, backupPath, changes: summary, otherExtensionsUnchanged: true, repeatPlanHasNoChanges: true, postCommitVerified: true };
    const receiptPath = path.join(directory, "applied.json");
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ ...receipt, receiptPath }, null, 2));
  } finally {
    if (transactionOpen) await client.query("rollback");
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
}
