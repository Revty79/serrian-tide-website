import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

import { skill } from "../src/db/skill-schema";
import { raceSkillCandidateFilter } from "../src/features/races/race-skill-query";
import { assertRaceSkillsEligible, isRaceSkillEligible } from "../src/features/races/race-skills";
import { applyRaceSkillCleanup, readRaceSkillCleanupPlan } from "./race-skill-cleanup";
import { runRaceSkillsBrowser } from "./race-skills-browser";

async function loopbackPort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

test("race skill rules, search, and cleanup use a new disposable migrated database", { timeout: 240_000 }, async (t) => {
  const parent = path.resolve(tmpdir());
  const directory = path.resolve(await mkdtemp(path.join(parent, "serrian-race-skills-postgres-")));
  assert.ok(path.dirname(directory) === parent && path.basename(directory).startsWith("serrian-race-skills-postgres-"));
  const data = path.join(directory, "data");
  const bin = process.env.SERRIAN_TEST_POSTGRES_BIN ?? "C:/Program Files/PostgreSQL/18/bin";
  const executable = (name: string) => path.join(bin, `${name}${process.platform === "win32" ? ".exe" : ""}`);
  const port = await loopbackPort();
  const connectionString = `postgresql://postgres@127.0.0.1:${port}/serrian_race_skills_dev`;
  let started = false;
  let client: pg.Client | null = null;
  try {
    execFileSync(executable("initdb"), ["--auth=trust", "--encoding=UTF8", "--no-locale", "--username=postgres", "-D", data], { stdio: "pipe", windowsHide: true });
    execFileSync(executable("pg_ctl"), ["-D", data, "-l", path.join(directory, "postgres.log"), "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore", windowsHide: true });
    started = true;
    client = new pg.Client({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres` });
    await client.connect();
    await client.query("create database serrian_race_skills_dev");
    await client.end();
    client = new pg.Client({ connectionString });
    await client.connect();
    const connection = client;
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: path.resolve("drizzle") });
    await client.query("set statement_timeout='10s'");
    const addSkill = async (name: string, tier: number | null, classification = "standard", archived = false) =>
      (await connection.query<{ id: number }>("insert into skill(name,tier,classification,archived_at) values($1,$2,$3,$4) returning id", [name, tier, classification, archived ? new Date() : null])).rows[0].id;
    const root = await addSkill("Race Test Root A", 1);
    const rootB = await addSkill("Race Test Root B", 1, "sphere");
    const branch = await addSkill("Race Test Branch", 2);
    const leaf = await addSkill("Race Test Deep Specialty", 8);
    const gift = await addSkill("Race Test Gift", 7, " Special Ability ");
    const nullGift = await addSkill("Race Test Untiered Gift", null, "special ability");
    const untiered = await addSkill("Race Test Untiered Skill", null);
    const archivedRoot = await addSkill("Race Test Archived Root", 1, "standard", true);
    const archivedLeaf = await addSkill("Race Test Archived Leaf", 3, "standard", true);
    const orphan = await addSkill("Race Test Orphan", 5);
    const edge = async (child: number, parent: number, type = "parent") => {
      await connection.query("insert into skill_relationship(skill_id,related_skill_id,relationship_type) values($1,$2,$3)", [child, parent, type]);
    };
    await edge(branch, root); await edge(leaf, branch); await edge(leaf, rootB);
    await edge(leaf, archivedRoot); await edge(archivedLeaf, root);
    await edge(gift, root); await edge(orphan, root, "related");
    const search = async (text = "", classification?: string) => db
      .select({ id: skill.id, name: skill.name, classification: skill.classification, tier: skill.tier })
      .from(skill).where(raceSkillCandidateFilter(text, classification)).orderBy(asc(skill.name), asc(skill.id)).limit(30);

    await t.test("picker admits Tier 1 and Special Abilities, excluding archived and untiered ordinary Skills", async () => {
      const rows = await search("Race Test");
      assert.deepEqual(rows.map((row) => row.id).sort((a, b) => a - b), [root, rootB, gift, nullGift].sort((a, b) => a - b));
      assert.ok(rows.every(isRaceSkillEligible));
      assert.ok((await search()).every(isRaceSkillEligible));
    });
    await t.test("searching a deep or Tier 2 Skill returns its exact active Tier 1 ancestors", async () => {
      assert.deepEqual((await search("Deep Specialty")).map((row) => row.id), [root, rootB]);
      assert.deepEqual((await search("Branch")).map((row) => row.id), [root]);
      assert.deepEqual((await search("Deep Specialty", " SPHERE ")).map((row) => row.id), [rootB]);
      assert.deepEqual((await search("Gift", "special ability")).map((row) => row.id).sort((a, b) => a - b), [gift, nullGift]);
    });
    await t.test("orphan, archived, untiered, and non-parent links do not invent a root", async () => {
      for (const name of ["Orphan", "Archived Leaf", "Untiered Skill", "doesn't exist'; --"]) assert.deepEqual(await search(name), []);
    });
    await t.test("cycles terminate and multiple matching descendants deduplicate before the result limit", async () => {
      await edge(branch, leaf);
      for (let index = 0; index < 35; index++) await edge(await addSkill(`Limit Needle ${index}`, 4), leaf);
      assert.deepEqual((await search("Limit Needle")).map((row) => row.id), [root, rootB]);
    });
    await t.test("untiered intermediate nodes preserve authored ancestry", async () => {
      const deep = await addSkill("Null Bridge Descendant", 3);
      await edge(deep, untiered); await edge(untiered, root);
      assert.deepEqual((await search("Null Bridge Descendant")).map((row) => row.id), [root]);
    });
    await t.test("save eligibility uses the database classification, not forged client classification", async () => {
      const stored = (await search("Root A"))[0];
      assert.doesNotThrow(() => assertRaceSkillsEligible([stored]));
      const invalid = (await connection.query("select name,classification,tier from skill where id=$1", [branch])).rows[0];
      assert.throws(() => assertRaceSkillsEligible([invalid]), /Tier 1 Skill or Special Ability/);
      const gifts = await search("Gift");
      assert.doesNotThrow(() => assertRaceSkillsEligible(gifts));
    });
    const raceId = (await client.query("insert into races(name) values('Race Skills Browser Fixture') returning id")).rows[0].id as number;
    const archivedRaceId = (await client.query("insert into races(name,archived_at) values('Archived Race Fixture',now()) returning id")).rows[0].id as number;
    for (const id of [raceId, archivedRaceId]) {
      for (const skillId of [root, branch, leaf, gift, nullGift, untiered, archivedRoot]) {
        await client.query("insert into race_skill_links(race_id,skill_id,link_type,value,sort_order) values($1,$2,'Skill',7,3)", [id, skillId]);
      }
    }
    await t.test("cleanup removes only invalid race associations, includes archived races, and is idempotent", async () => {
      const beforeSkills = (await connection.query("select * from skill order by id")).rows;
      const beforeRaces = (await connection.query("select * from races order by id")).rows;
      const plan = await readRaceSkillCleanupPlan(connection);
      assert.equal(plan.remove.length, 6);
      assert.equal(plan.keep.length, 8);
      await assert.rejects(applyRaceSkillCleanup(connection, "stale"), /changed since review/);
      await connection.query("begin");
      try { await applyRaceSkillCleanup(connection, plan.digest); await connection.query("commit"); }
      catch (error) { await connection.query("rollback"); throw error; }
      const repeat = await readRaceSkillCleanupPlan(connection);
      assert.equal(repeat.remove.length, 0);
      await applyRaceSkillCleanup(connection, repeat.digest);
      assert.deepEqual((await connection.query("select * from skill order by id")).rows, beforeSkills);
      assert.deepEqual((await connection.query("select * from races order by id")).rows, beforeRaces);
    });
    if (process.env.SERRIAN_RACE_BROWSER === "true") {
      await t.test("desktop and mobile race picker and authoritative save", async () => {
        await runRaceSkillsBrowser({ connectionString, port: await loopbackPort(), client: connection, raceId, root, rootB, leaf, gift });
      });
    }
  } finally {
    if (client) await client.end();
    if (started && existsSync(path.join(data, "postmaster.pid"))) execFileSync(executable("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true });
    if (existsSync(path.join(data, "postmaster.pid"))) throw new Error(`Disposable cluster is still running; preserved ${directory}`);
    await rm(directory, { recursive: true, force: true });
  }
});
