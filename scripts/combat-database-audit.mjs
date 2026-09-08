import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local", quiet: true });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured.");
const url = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !url.pathname.slice(1).endsWith("_dev")) {
  throw new Error("Combat database audit requires a loopback _dev database.");
}

const journal = JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
await client.connect();
try {
  await client.query("begin transaction isolation level repeatable read read only");
  await client.query("set local statement_timeout = '15s'");
  const ledger = await client.query("select hash, created_at from drizzle.__drizzle_migrations order by id");
  const migrations = [];
  for (const [index, entry] of journal.entries.entries()) {
    const sql = await readFile(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url));
    const applied = ledger.rows[index];
    migrations.push({
      tag: entry.tag,
      timestampMatches: Number(applied?.created_at) === entry.when,
      hashMatches: applied?.hash === createHash("sha256").update(sql).digest("hex"),
    });
  }
  const tableRows = await client.query(`
    select table_name, array_agg(column_name::text order by ordinal_position) as columns
    from information_schema.columns
    where table_schema = 'public'
      and (table_name like 'campaign_session%' or table_name like 'campaign_character_firearm%'
        or table_name = 'defense_skill_path_mapping')
    group by table_name order by table_name
  `);
  const tables = [];
  for (const table of tableRows.rows) {
    // Identifiers come from the catalog, and must still fit this strict allowlist.
    if (!/^[a-z][a-z0-9_]*$/.test(table.table_name)) throw new Error("Unexpected table identifier.");
    const name = `public."${table.table_name}"`;
    const count = await client.query(`select count(*)::integer as count from ${name}`);
    const statuses = table.columns.includes("status")
      ? (await client.query(`select status::text as status, count(*)::integer as count from ${name} group by status order by status`)).rows
      : [];
    tables.push({ name: table.table_name, count: count.rows[0].count, statuses, columns: table.columns });
  }
  const constraints = await client.query(`
    select child.relname as child_table, parent.relname as parent_table,
      c.conname as name, c.convalidated as validated, pg_get_constraintdef(c.oid) as definition
    from pg_constraint c
    join pg_class child on child.oid = c.conrelid
    join pg_namespace n on n.oid = child.relnamespace
    join pg_class parent on parent.oid = c.confrelid
    where c.contype = 'f' and n.nspname = 'public'
      and (child.relname like 'campaign_session%' or parent.relname like 'campaign_session%'
        or child.relname like 'campaign_character_firearm%' or parent.relname like 'campaign_character_firearm%'
        or child.relname = 'defense_skill_path_mapping')
    order by child.relname, c.conname
  `);
  const historicalPlanStates = await client.query(`
    select encounter.status as encounter_status, plan.status as plan_status,
      declaration.status as declaration_status, count(*)::integer as count
    from campaign_session_encounter_effect_plan plan
    join campaign_session_encounter encounter on encounter.id = plan.encounter_id
    join campaign_session_encounter_action_declaration declaration on declaration.id = plan.declaration_id
    where encounter.status = 'completed'
      and plan.status not in ('applied', 'declined', 'cancelled', 'superseded')
    group by encounter.status, plan.status, declaration.status
    order by plan.status, declaration.status
  `);
  const result = {
    auditedAt: new Date().toISOString(),
    database: url.pathname.slice(1),
    readOnly: true,
    migrationCount: { expected: journal.entries.length, applied: ledger.rows.length },
    migrationLedgerMatches: ledger.rows.length === journal.entries.length && migrations.every((entry) => entry.timestampMatches && entry.hashMatches),
    migrations,
    tables,
    unfinishedPlansInCompletedEncounters: historicalPlanStates.rows,
    foreignKeys: constraints.rows,
    unvalidatedForeignKeys: constraints.rows.filter((entry) => !entry.validated).map((entry) => entry.name),
  };
  await client.query("rollback");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.migrationLedgerMatches || result.unvalidatedForeignKeys.length) process.exitCode = 1;
} finally {
  await client.end();
}
