// Read-only ordinary-database audit. This script never creates combat fixtures.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local", quiet: true });
const url = new URL(process.env.DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname) || !url.pathname.slice(1).endsWith("_dev")) throw new Error("Combat audit requires the ordinary loopback _dev database.");
const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
try {
  await client.query("begin transaction isolation level repeatable read read only");
  const ledger = (await client.query("select hash, created_at from drizzle.__drizzle_migrations order by id")).rows;
  const expected = [];
  for (const entry of journal.entries) expected.push({ tag: entry.tag, when: entry.when,
    hash: createHash("sha256").update(await readFile(`drizzle/${entry.tag}.sql`, "utf8")).digest("hex") });
  const prefixMatches = ledger.every((row, index) => expected[index]?.hash === row.hash && expected[index]?.when === Number(row.created_at));
  if (!prefixMatches) throw new Error("Applied migration history differs from the repository; preserve it and inspect before migration.");
  const tableNames = ["campaign_session_encounter", "campaign_session_encounter_participant", "campaign_session_encounter_initiative",
    "campaign_session_encounter_initiative_participant", "campaign_session_encounter_pending_action", "campaign_session_encounter_pending_action_source",
    "campaign_session_encounter_action_declaration", "campaign_session_encounter_reaction", "campaign_session_encounter_effect_plan",
    "campaign_session_encounter_effect", "campaign_session_encounter_effect_plan_event", "campaign_session_roll", "campaign_session_roll_amendment",
    "campaign_session_encounter_firearm_attack", "campaign_session_encounter_firearm_bullet", "campaign_character_firearm_state",
    "campaign_session_encounter_reward", "campaign_character_profile", "campaign_character_active_health", "campaign_character_active_health_pool",
    "campaign_character_active_mana", "campaign_character_item", "campaign_character_item_instance",
    "campaign_character_active_condition", "campaign_character_active_modifier", "campaign_character_injury",
    "campaign_session_effect_duration_binding", "campaign_session_encounter_responder_opportunity",
    "campaign_session_encounter_declaration_checkpoint", "campaign_session_encounter_action_declaration_event",
    "campaign_session_encounter_reaction_event", "campaign_session_encounter_firearm_attack_event"];
  const preserved = [];
  for (const table of tableNames) {
    const exists = (await client.query("select to_regclass($1) as name", [`public.${table}`])).rows[0].name;
    if (!exists) { preserved.push({ table, unavailable: true }); continue; }
    // Exclude only additive migration columns, preserving every old value in the digest.
    const result = await client.query(`select count(*)::int as count,
      md5(coalesce(jsonb_agg(to_jsonb(t) - ARRAY['firearm_portion','firing_portions_resolved','decision_id']
        order by (to_jsonb(t) - ARRAY['firearm_portion','firing_portions_resolved','decision_id'])::text)::text, '[]')) as digest
      from "${table}" t`);
    preserved.push({ table, ...result.rows[0] });
  }
  const unfinishedPlans = (await client.query(`select p.id as plan_id, p.encounter_id, e.status as encounter_status,
    p.declaration_id, d.status as declaration_status, p.status as plan_status,
    (select count(*)::int from campaign_session_encounter_effect f where f.plan_id=p.id and f.applied_at is not null) as applied_effects
    from campaign_session_encounter_effect_plan p
    join campaign_session_encounter e on e.id=p.encounter_id
    join campaign_session_encounter_action_declaration d on d.id=p.declaration_id
    where p.status not in ('applied','declined','cancelled','superseded') order by p.id`)).rows;
  await client.query("commit");
  const report = { auditedAt: new Date().toISOString(), database: url.pathname.slice(1), appliedMigrations: ledger.length,
    repositoryMigrations: expected.length, appliedPrefixMatches: prefixMatches, pending: expected.slice(ledger.length).map(({ tag }) => tag),
    preserved, unfinishedPlans };
  const output = process.argv[2];
  if (output) await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, preserved: `${preserved.length} table digests${output ? ` recorded in ${output}` : " checked"}` }, null, 2));
} finally { await client.end(); }
